/**
 * The public crowding-risk proxy calculation.
 *
 * This module is deliberately small and readable: the whole team must be able
 * to explain it, and the UI renders every term of it on screen. There is no
 * machine-learning model and no hidden weighting.
 *
 *   score = attention + consensus + persistence - coverage penalty - event discount
 *
 * The score is a PUBLIC PROXY. It measures how unusual public discussion is,
 * not how many funds hold a position.
 */
import type { Instrument, RiskState, SeriesPoint } from '../types.ts'
import { longDate } from './format.ts'

/** Points available to each component. They sum to 100. */
export const WEIGHTS = { attention: 45, consensus: 35, persistence: 20 } as const

/** The point at which a component is considered fully expressed. */
export const CAPS = {
  /** attention z-score that earns full attention points */
  attentionZ: 6,
  /** dominant-direction share that earns full consensus points (0.50 = no agreement) */
  consensusShare: 0.85,
  /** consecutive sessions above the 2σ line that earn full persistence points */
  persistenceDays: 5,
} as const

export const PENALTIES = {
  /** points removed when sources are missing: (1 - completeness) x this */
  incompleteCoverage: 20,
  /** points removed when a scheduled or major event can explain the attention on its own */
  eventConfounder: 10,
} as const

export const THRESHOLDS = {
  elevated: 60,
  watch: 35,
  /** below this level of source coverage we refuse to state a risk level at all */
  minCoverage: 0.5,
  /** z-score that counts as "above baseline" for persistence */
  persistenceZ: 2,
} as const

export const WINDOWS = [7, 30, 90] as const
export type WindowDays = (typeof WINDOWS)[number]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const stdev = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)))
}

export interface ScoreComponent {
  key: 'attention' | 'consensus' | 'persistence'
  label: string
  /** plain-language statement of the measured input */
  detail: string
  /** the arithmetic, shown verbatim in the UI */
  formula: string
  points: number
  max: number
}

export interface ScoreAdjustment {
  key: 'coverage' | 'event'
  label: string
  detail: string
  points: number
}

export interface DriverNote {
  key: string
  label: string
  detail: string
  effect: 'raises' | 'lowers' | 'context'
}

export interface DerivedSignal {
  ticker: string
  windowDays: number
  /** the window actually used — a series shorter than the request is not padded */
  windowUsed: number
  windowSeries: SeriesPoint[]
  asOf: string
  mentionsToday: number
  mentionsPrevDay: number
  baselineMean: number
  baselineSd: number
  baselineDays: number
  attentionZ: number
  attentionPct: number
  persistenceDays: number
  consensusShare: number
  consensusBaselineShare: number
  consensusChange: number
  direction: Instrument['consensus']['dominant_direction']
  components: ScoreComponent[]
  adjustments: ScoreAdjustment[]
  rawScore: number
  score: number
  state: RiskState
  stateReason: string
  drivers: DriverNote[]
  thinWindow: boolean
}

export const STATE_LABEL: Record<RiskState, string> = {
  elevated: 'Elevated',
  watch: 'Watch',
  normal: 'Normal',
  insufficient: 'Insufficient data',
}

/** Ordering used for sorting and for the filter chips. */
export const STATE_RANK: Record<RiskState, number> = {
  elevated: 3,
  watch: 2,
  normal: 1,
  insufficient: 0,
}

export const DIRECTION_LABEL = {
  bullish: 'Bullish-leaning',
  bearish: 'Bearish-leaning',
  mixed: 'No clear lean',
} as const

/**
 * Recompute the signal over a chosen look-back window.
 *
 * The baseline is every session in the window except the most recent one, so
 * the latest reading is always compared against its own recent normal level.
 */
export function deriveSignal(instrument: Instrument, windowDays: number): DerivedSignal {
  const series = instrument.series
  const windowSeries = series.slice(-windowDays)
  const latest = windowSeries[windowSeries.length - 1]
  const prev = windowSeries[windowSeries.length - 2] ?? latest
  const baselinePoints = windowSeries.slice(0, -1)

  const mentions = baselinePoints.map((p) => p.mentions)
  const baselineMean = mean(mentions)
  // guard against a degenerate sd on very quiet or very short windows
  const baselineSd = Math.max(stdev(mentions), baselineMean * 0.06, 1)

  const attentionZ = (latest.mentions - baselineMean) / baselineSd
  const attentionPct = baselineMean > 0 ? ((latest.mentions - baselineMean) / baselineMean) * 100 : 0

  let persistenceDays = 0
  for (let i = windowSeries.length - 1; i >= 0; i--) {
    const z = (windowSeries[i].mentions - baselineMean) / baselineSd
    if (z >= THRESHOLDS.persistenceZ) persistenceDays++
    else break
  }

  const consensusShare = latest.consensus_share
  const consensusBaselineShare = mean(baselinePoints.map((p) => p.consensus_share))
  const consensusChange = consensusShare - consensusBaselineShare

  const attentionPoints = clamp(attentionZ / CAPS.attentionZ, 0, 1) * WEIGHTS.attention
  const consensusPoints =
    clamp((consensusShare - 0.5) / (CAPS.consensusShare - 0.5), 0, 1) * WEIGHTS.consensus
  const persistencePoints =
    clamp(persistenceDays / CAPS.persistenceDays, 0, 1) * WEIGHTS.persistence

  const components: ScoreComponent[] = [
    {
      key: 'attention',
      label: 'Unusual attention',
      detail: `${latest.mentions.toLocaleString()} mentions today against a ${baselinePoints.length}-session baseline of ${Math.round(baselineMean).toLocaleString()} (σ ${baselineSd.toFixed(0)}).`,
      formula: `min(z ${attentionZ.toFixed(2)} / ${CAPS.attentionZ}, 1) × ${WEIGHTS.attention}`,
      points: attentionPoints,
      max: WEIGHTS.attention,
    },
    {
      key: 'consensus',
      label: 'Directional agreement',
      detail: `${(consensusShare * 100).toFixed(0)}% of directional mentions point the same way, against ${(consensusBaselineShare * 100).toFixed(0)}% over the baseline.`,
      formula: `min((${consensusShare.toFixed(2)} − 0.50) / 0.35, 1) × ${WEIGHTS.consensus}`,
      points: consensusPoints,
      max: WEIGHTS.consensus,
    },
    {
      key: 'persistence',
      label: 'Persistence',
      detail:
        persistenceDays > 0
          ? `Attention has stayed above the ${THRESHOLDS.persistenceZ}σ line for ${persistenceDays} consecutive session${persistenceDays === 1 ? '' : 's'}.`
          : `Today's reading is not part of a run above the ${THRESHOLDS.persistenceZ}σ line.`,
      formula: `min(${persistenceDays} / ${CAPS.persistenceDays}, 1) × ${WEIGHTS.persistence}`,
      points: persistencePoints,
      max: WEIGHTS.persistence,
    },
  ]

  const rawScore = attentionPoints + consensusPoints + persistencePoints
  const coveragePenalty = (1 - instrument.coverage.completeness) * PENALTIES.incompleteCoverage
  const eventDiscount = instrument.event_flag.present ? PENALTIES.eventConfounder : 0

  const adjustments: ScoreAdjustment[] = [
    {
      key: 'coverage',
      label: 'Incomplete source coverage',
      detail: `${instrument.coverage.sources_available} of ${instrument.coverage.sources_expected} sources responded, and ${(instrument.coverage.completeness * 100).toFixed(0)}% of the expected records arrived. Missing records bias the mention count downward.`,
      points: -coveragePenalty,
    },
    {
      key: 'event',
      label: 'Event confounder discount',
      detail: instrument.event_flag.present
        ? `${instrument.event_flag.label} on ${longDate(instrument.event_flag.date!)} could explain the attention change on its own.`
        : 'No scheduled or major event found in the window that would explain the change on its own.',
      points: -eventDiscount,
    },
  ]

  const score = clamp(rawScore - coveragePenalty - eventDiscount, 0, 100)

  let state: RiskState
  let stateReason: string
  if (instrument.coverage.completeness < THRESHOLDS.minCoverage) {
    state = 'insufficient'
    stateReason = `Source coverage is ${(instrument.coverage.completeness * 100).toFixed(0)}%, below the ${THRESHOLDS.minCoverage * 100}% floor required to state a level.`
  } else if (score >= THRESHOLDS.elevated) {
    state = 'elevated'
    stateReason = `Proxy score ${score.toFixed(0)} is at or above the ${THRESHOLDS.elevated}-point threshold for Elevated.`
  } else if (score >= THRESHOLDS.watch) {
    state = 'watch'
    stateReason = `Proxy score ${score.toFixed(0)} sits between the Watch (${THRESHOLDS.watch}) and Elevated (${THRESHOLDS.elevated}) thresholds.`
  } else {
    state = 'normal'
    stateReason = `Proxy score ${score.toFixed(0)} is below the ${THRESHOLDS.watch}-point Watch threshold.`
  }

  const drivers = buildDrivers({
    instrument,
    attentionZ,
    attentionPct,
    baselineDays: baselinePoints.length,
    persistenceDays,
    consensusShare,
    consensusChange,
    latest,
    prev,
  })

  return {
    ticker: instrument.ticker,
    windowDays,
    windowUsed: windowSeries.length,
    windowSeries,
    asOf: latest.date,
    mentionsToday: latest.mentions,
    mentionsPrevDay: prev.mentions,
    baselineMean,
    baselineSd,
    baselineDays: baselinePoints.length,
    attentionZ,
    attentionPct,
    persistenceDays,
    consensusShare,
    consensusBaselineShare,
    consensusChange,
    direction: latest.dominant_direction,
    components,
    adjustments,
    rawScore,
    score,
    state,
    stateReason,
    drivers,
    thinWindow: baselinePoints.length < 10,
  }
}

function buildDrivers(a: {
  instrument: Instrument
  attentionZ: number
  attentionPct: number
  baselineDays: number
  persistenceDays: number
  consensusShare: number
  consensusChange: number
  latest: SeriesPoint
  prev: SeriesPoint
}): DriverNote[] {
  const drivers: DriverNote[] = []

  if (a.attentionZ >= THRESHOLDS.persistenceZ) {
    drivers.push({
      key: 'attention',
      label: 'Attention rose faster than its recent normal level',
      detail: `Mentions are ${a.attentionPct > 0 ? '+' : ''}${a.attentionPct.toFixed(0)}% against the ${a.baselineDays}-session baseline, a z-score of ${a.attentionZ.toFixed(2)}.`,
      effect: 'raises',
    })
  } else {
    drivers.push({
      key: 'attention',
      label: 'Attention is within its recent normal range',
      detail: `Mentions are ${a.attentionPct > 0 ? '+' : ''}${a.attentionPct.toFixed(0)}% against the ${a.baselineDays}-session baseline (z ${a.attentionZ.toFixed(2)}), below the ${THRESHOLDS.persistenceZ}σ line.`,
      effect: 'lowers',
    })
  }

  if (a.consensusShare >= 0.65) {
    drivers.push({
      key: 'consensus',
      label: 'Public discussion has become one-sided',
      detail: `${(a.consensusShare * 100).toFixed(0)}% of directional mentions lean the same way, ${a.consensusChange >= 0 ? 'up' : 'down'} ${Math.abs(a.consensusChange * 100).toFixed(0)} points on the baseline.`,
      effect: 'raises',
    })
  } else {
    drivers.push({
      key: 'consensus',
      label: 'Discussion remains split',
      detail: `${(a.consensusShare * 100).toFixed(0)}% dominant-direction share is close to an even split, so agreement adds little to the score.`,
      effect: 'lowers',
    })
  }

  if (a.persistenceDays >= 3) {
    drivers.push({
      key: 'persistence',
      label: 'The elevated reading has held for several sessions',
      detail: `${a.persistenceDays} consecutive sessions above the ${THRESHOLDS.persistenceZ}σ line, so this is not a single-day spike.`,
      effect: 'raises',
    })
  }

  const topSource = [...a.instrument.source_mix].sort((x, y) => y.share - x.share)[0]
  if (topSource && topSource.share >= 0.5) {
    drivers.push({
      key: 'source',
      label: `${topSource.label} accounts for most of the volume`,
      detail: `${(topSource.share * 100).toFixed(0)}% of today's mentions come from one source. ${topSource.note}`,
      effect: 'context',
    })
  }

  if (a.instrument.event_flag.present) {
    drivers.push({
      key: 'event',
      label: 'A confounding event sits inside the window',
      detail: `${a.instrument.event_flag.label} on ${longDate(a.instrument.event_flag.date!)}. The attention change may be explained by the event rather than by positioning, so ${PENALTIES.eventConfounder} points are discounted.`,
      effect: 'lowers',
    })
  }

  if (a.instrument.coverage.completeness < 0.8) {
    drivers.push({
      key: 'coverage',
      label: 'Source coverage is incomplete',
      detail: a.instrument.coverage.note,
      effect: 'lowers',
    })
  }

  return drivers
}
