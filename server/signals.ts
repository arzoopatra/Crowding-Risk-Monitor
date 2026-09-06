/**
 * The prototype's public-attention calculation, server side.
 *
 * Every number the API publishes is derived here from the raw counts in
 * server/data/fixture.json. There is no model, no training and no hidden
 * weighting: four divisions and four threshold comparisons, each of which is
 * returned to the caller alongside its own arithmetic.
 *
 *   attention_multiple = current_mentions / average_baseline_mentions
 *   consensus_percent  = dominant_direction_items / classified_items
 *   coverage_percent   = classified_items / total_items
 *   risk_state         = the threshold table in RULES, below
 *
 * THRESHOLDS ARE PROTOTYPE HEURISTICS. They were chosen to make the four
 * states legible on an illustrative fixture. They are not calibrated against
 * market outcomes, not empirically validated, and carry no claim that a state
 * predicts a price move, a reversal or alpha decay.
 */

/** Sessions carried per instrument: the current day plus its baseline. */
export const WINDOW_SESSIONS = 30

/**
 * The rule table, published verbatim at /api/signals so a reader never has to
 * take a state on trust.
 */
export const RULES = {
  elevated: { attention_multiple: 2.0, consensus_percent: 70 },
  watch: { attention_multiple: 1.5, consensus_percent: 65 },
  insufficient: { min_classified_items: 50, min_coverage_percent: 50, requires_all_sources: true },
  basis: 'prototype heuristic — not an empirically validated threshold',
} as const

export type RiskState = 'Elevated' | 'Watch' | 'Stable' | 'Insufficient data'
export type Direction = 'bullish' | 'bearish' | 'mixed'

export interface FixtureSource {
  id: string
  label: string
  items: number
  reporting: boolean
  note: string
}

export interface FixtureInstrument {
  ticker: string
  name: string
  sector: string
  as_of: string
  collected_at: string
  daily_mentions: { date: string; mentions: number }[]
  classification: {
    total_items: number
    bullish_items: number
    bearish_items: number
    unclassified_items: number
  }
  sources: FixtureSource[]
  related_event: {
    date: string
    type: string
    label: string
    headline: string
    source: string
    possible_confounder: boolean
  } | null
  limitations: string[]
}

export interface Fixture {
  fixture_version: string
  dataset: string
  is_illustrative: boolean
  generated_at: string
  generated_from: string
  as_of: string
  window_sessions: number
  sources_expected: string[]
  disclaimer: string
  instruments: FixtureInstrument[]
}

export interface Signal {
  ticker: string
  name: string
  sector: string
  as_of: string
  risk_state: RiskState
  risk_state_reason: string
  attention: {
    current_mentions: number
    average_baseline_mentions: number | null
    baseline_sessions: number
    attention_multiple: number | null
    formula: string
  }
  consensus: {
    dominant_direction: Direction
    dominant_direction_items: number
    classified_items: number
    consensus_percent: number | null
    formula: string
  }
  coverage: {
    classified_items: number
    total_items: number
    coverage_percent: number | null
    sources_reporting: number
    sources_expected: number
    formula: string
  }
  source_breakdown: { id: string; label: string; items: number; share_percent: number; reporting: boolean; note: string }[]
  related_event: FixtureInstrument['related_event'] & { relation: string } | null
  limitations: string[]
  is_illustrative: true
}

const round = (n: number, dp: number) => Number(n.toFixed(dp))
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/**
 * Today against its own recent normal level.
 *
 * The baseline is every session in the window EXCEPT the current one, so a
 * spike is never allowed to raise the line it is being measured against. This
 * is the same convention as src/lib/scoring.ts, which is why the API and the
 * interface report the same multiple.
 */
export function attentionMultiple(daily: { date: string; mentions: number }[]): {
  current: number
  baselineMean: number | null
  baselineSessions: number
  multiple: number | null
} {
  const current = daily.length ? daily[daily.length - 1].mentions : 0
  const baseline = daily.slice(0, -1).map((d) => d.mentions)
  const baselineMean = baseline.length ? mean(baseline) : null
  const multiple = baselineMean && baselineMean > 0 ? current / baselineMean : null
  return {
    current,
    baselineMean: baselineMean === null ? null : round(baselineMean, 1),
    baselineSessions: baseline.length,
    multiple: multiple === null ? null : round(multiple, 2),
  }
}

/** Which way the classified items lean, and how one-sided that lean is. */
export function consensus(c: FixtureInstrument['classification']): {
  direction: Direction
  dominantItems: number
  classifiedItems: number
  percent: number | null
} {
  const classifiedItems = c.bullish_items + c.bearish_items
  const dominantItems = Math.max(c.bullish_items, c.bearish_items)
  const direction: Direction =
    c.bullish_items === c.bearish_items ? 'mixed' : c.bullish_items > c.bearish_items ? 'bullish' : 'bearish'
  const percent = classifiedItems > 0 ? round((dominantItems / classifiedItems) * 100, 1) : null
  return { direction, dominantItems, classifiedItems, percent }
}

/** The share of collected items that could be given a direction at all. */
export function coveragePercent(classifiedItems: number, totalItems: number): number | null {
  return totalItems > 0 ? round((classifiedItems / totalItems) * 100, 1) : null
}

/**
 * The four-state classification.
 *
 * Insufficient data is checked first and wins outright: the prototype refuses
 * to state a level when it cannot see enough to have an opinion.
 */
export function riskState(input: {
  attentionMultiple: number | null
  consensusPercent: number | null
  coveragePercent: number | null
  classifiedItems: number
  sourcesReporting: number
  sourcesExpected: number
}): { state: RiskState; reason: string } {
  const { attentionMultiple: mult, consensusPercent: cons, coveragePercent: cov } = input

  const gaps: string[] = []
  if (mult === null || cons === null || cov === null) gaps.push('a required input could not be calculated')
  if (input.classifiedItems < RULES.insufficient.min_classified_items) {
    gaps.push(`only ${input.classifiedItems} classified items (floor ${RULES.insufficient.min_classified_items})`)
  }
  if (cov !== null && cov < RULES.insufficient.min_coverage_percent) {
    gaps.push(`coverage ${cov}% is below the ${RULES.insufficient.min_coverage_percent}% floor`)
  }
  if (input.sourcesReporting < input.sourcesExpected) {
    gaps.push(`${input.sourcesReporting} of ${input.sourcesExpected} sources reported`)
  }
  if (gaps.length > 0) {
    return { state: 'Insufficient data', reason: `No level stated: ${gaps.join('; ')}.` }
  }

  const m = mult as number
  const c = cons as number

  if (m >= RULES.elevated.attention_multiple && c >= RULES.elevated.consensus_percent) {
    return {
      state: 'Elevated',
      reason: `Attention ${m}× baseline (rule: ≥ ${RULES.elevated.attention_multiple}×) with ${c}% directional agreement (rule: ≥ ${RULES.elevated.consensus_percent}%).`,
    }
  }
  if (m >= RULES.watch.attention_multiple || c >= RULES.watch.consensus_percent) {
    const hit =
      m >= RULES.watch.attention_multiple
        ? `attention ${m}× is at or above the ${RULES.watch.attention_multiple}× Watch rule`
        : `agreement ${c}% is at or above the ${RULES.watch.consensus_percent}% Watch rule`
    return { state: 'Watch', reason: `One Watch condition met: ${hit}; the Elevated rule needs both.` }
  }
  return {
    state: 'Stable',
    reason: `Attention ${m}× and agreement ${c}% are both below the Watch rules (${RULES.watch.attention_multiple}×, ${RULES.watch.consensus_percent}%).`,
  }
}

/** One instrument, from raw counts to a published signal. */
export function buildSignal(i: FixtureInstrument, sourcesExpected: number): Signal {
  const a = attentionMultiple(i.daily_mentions)
  const c = consensus(i.classification)
  const total = i.classification.total_items
  const cov = coveragePercent(c.classifiedItems, total)
  const sourcesReporting = i.sources.filter((s) => s.reporting).length

  const { state, reason } = riskState({
    attentionMultiple: a.multiple,
    consensusPercent: c.percent,
    coveragePercent: cov,
    classifiedItems: c.classifiedItems,
    sourcesReporting,
    sourcesExpected,
  })

  return {
    ticker: i.ticker,
    name: i.name,
    sector: i.sector,
    as_of: i.as_of,
    risk_state: state,
    risk_state_reason: reason,
    attention: {
      current_mentions: a.current,
      average_baseline_mentions: a.baselineMean,
      baseline_sessions: a.baselineSessions,
      attention_multiple: a.multiple,
      formula: `${a.current} current mentions / ${a.baselineMean ?? 'n/a'} mean over the previous ${a.baselineSessions} sessions = ${a.multiple ?? 'n/a'}`,
    },
    consensus: {
      dominant_direction: c.direction,
      dominant_direction_items: c.dominantItems,
      classified_items: c.classifiedItems,
      consensus_percent: c.percent,
      formula: `${c.dominantItems} ${c.direction} items / ${c.classifiedItems} classified items = ${c.percent ?? 'n/a'}%`,
    },
    coverage: {
      classified_items: c.classifiedItems,
      total_items: total,
      coverage_percent: cov,
      sources_reporting: sourcesReporting,
      sources_expected: sourcesExpected,
      formula: `${c.classifiedItems} classified items / ${total} collected items = ${cov ?? 'n/a'}%`,
    },
    source_breakdown: i.sources.map((s) => ({
      id: s.id,
      label: s.label,
      items: s.items,
      share_percent: total > 0 ? round((s.items / total) * 100, 1) : 0,
      reporting: s.reporting,
      note: s.note,
    })),
    related_event: i.related_event
      ? {
          ...i.related_event,
          // an event never *caused* a signal here: it coincided, and may or may
          // not account for the change on its own
          relation: i.related_event.possible_confounder
            ? 'coincided with the change · possible confounder'
            : 'coincided with the change',
        }
      : null,
    limitations: i.limitations,
    is_illustrative: true,
  }
}

/** What every signal response says about itself. */
export function methodBlock(fixture: Fixture) {
  return {
    attention_multiple: 'current_mentions / mean(previous sessions in the window)',
    consensus_percent: 'dominant_direction_items / classified_items',
    coverage_percent: 'classified_items / total_items',
    risk_state: 'threshold table below, applied in order: Insufficient data, Elevated, Watch, Stable',
    rules: RULES,
    window_sessions: fixture.window_sessions,
    caveat:
      'Prototype heuristics on an illustrative fixture. Thresholds are not empirically validated, the signal is a public-attention proxy rather than a measure of institutional positioning, and no state is a prediction or investment advice.',
  }
}

export function buildSignals(fixture: Fixture): Signal[] {
  return fixture.instruments.map((i) => buildSignal(i, fixture.sources_expected.length))
}
