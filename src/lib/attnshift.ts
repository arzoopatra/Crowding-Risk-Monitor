/**
 * Presentation-layer derivations for the AttnShift screens.
 *
 * The scoring model in lib/scoring.ts stays the single source of truth for
 * risk state. This module only translates that model into the vocabulary the
 * Figma design speaks: an attention MULTIPLE rather than a z-score, a coverage
 * TIER rather than a fraction, and a cross-ticker CHANGE LOG derived by
 * replaying the same scoring function day by day.
 */
import type { Instrument, RelatedEvent, RiskState, Snapshot } from '../types.ts'
import { deriveSignal } from './scoring.ts'
import type { DerivedSignal } from './scoring.ts'

/**
 * The prototype's own version, shown in the sidebar and on the methodology
 * screen. Deliberately separate from `snapshot.schema_version`, which versions
 * the data contract with the backend and moves for different reasons.
 */
export const PRODUCT_VERSION = '0.3'

/** The design labels the calm state "Stable"; the model calls it "normal". */
export type AlertState = 'elevated' | 'watch' | 'stable' | 'insufficient'

export const ALERT_STATES: AlertState[] = ['elevated', 'watch', 'stable', 'insufficient']

export const ALERT_LABEL: Record<AlertState, string> = {
  elevated: 'Elevated',
  watch: 'Watch',
  stable: 'Stable',
  insufficient: 'Insufficient data',
}

/** Short form used inside the change log, where column width is tight. */
export const ALERT_LABEL_SHORT: Record<AlertState, string> = {
  elevated: 'Elevated',
  watch: 'Watch',
  stable: 'Stable',
  insufficient: 'Insufficient',
}

export const ALERT_RANK: Record<AlertState, number> = {
  elevated: 3,
  watch: 2,
  stable: 1,
  insufficient: 0,
}

export function toAlertState(state: RiskState): AlertState {
  return state === 'normal' ? 'stable' : state
}

/* ------------------------------------------------------------ attention -- */

/**
 * Today's mentions as a multiple of the baseline mean — the headline number on
 * every screen ("3.1× avg"). Returns null when there is no usable baseline.
 */
export function attentionMultiple(signal: DerivedSignal): number | null {
  if (!Number.isFinite(signal.baselineMean) || signal.baselineMean <= 0) return null
  return signal.mentionsToday / signal.baselineMean
}

export function formatMultiple(m: number | null): string {
  return m === null ? 'N/A' : `${m.toFixed(1)}×`
}

/** Where today's reading sits inside its own look-back window, as a percentile. */
export function attentionPercentile(signal: DerivedSignal): number {
  const values = signal.windowSeries.map((p) => p.mentions)
  if (values.length < 2) return 0
  const below = values.filter((v) => v < signal.mentionsToday).length
  return Math.round((below / (values.length - 1)) * 100)
}

/* ------------------------------------------------------------- coverage -- */

export type CoverageTier = 'high' | 'medium' | 'low'

export const COVERAGE_LABEL: Record<CoverageTier, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export function coverageTier(instrument: Instrument): CoverageTier {
  const { completeness, sources_available, sources_expected } = instrument.coverage
  if (completeness >= 0.85 && sources_available === sources_expected) return 'high'
  if (completeness >= 0.5) return 'medium'
  return 'low'
}

export function sourcesFraction(instrument: Instrument): string {
  return `${instrument.coverage.sources_available} / ${instrument.coverage.sources_expected}`
}

/* ------------------------------------------------------------ consensus -- */

export function consensusLabel(signal: DerivedSignal): string {
  const share = Math.round(signal.consensusShare * 100)
  return `${share}% ${signal.direction}`
}

/* --------------------------------------------------------------- events -- */

export function relatedEventLabel(instrument: Instrument): string {
  if (instrument.event_flag.present && instrument.event_flag.label) return instrument.event_flag.label
  const latest = instrument.related_events[0]
  return latest ? latest.label : 'No notable event'
}

/**
 * How a related event is allowed to be described anywhere in the product.
 *
 * An event never *caused* a signal here. It either coincided with the change,
 * or it coincided AND could account for the change on its own — which is what
 * "possible confounder" means, and the only reason a discount is applied.
 */
export function relatedEventContext(instrument: Instrument): string {
  if (instrument.event_flag.present) return 'coincided · possible confounder'
  if (instrument.related_events.length > 0) return 'coincided with the change'
  return 'no event recorded in the window'
}

/* ---------------------------------------------------------- data status -- */

/** What the screens say about where their numbers came from. */
export function dataStatusLabel(snapshot: Snapshot | null): string {
  if (!snapshot) return 'Unknown'
  return snapshot.data_status ?? (snapshot.is_synthetic ? 'Illustrative interface data' : 'Backend export')
}

/**
 * The instrument-specific limits, from the export where it supplies them.
 * The product-level limit sentence is rendered separately and always.
 */
export function limitationsFor(instrument: Instrument): string[] {
  if (instrument.limitations?.length) return instrument.limitations
  return instrument.coverage.completeness < 1 ? [instrument.coverage.note] : []
}

/**
 * The evidence table on the signal detail screen. The design shows one row per
 * observed change; the data contract carries those as related events.
 */
export interface EvidenceItem {
  source: string
  observed: string
  context: string
  confounder: boolean
  date: string
}

export function evidenceItems(instrument: Instrument): EvidenceItem[] {
  return instrument.related_events.map((e: RelatedEvent) => ({
    source: e.source,
    observed: e.headline,
    context: e.confounder ? 'Possible confounder' : e.label,
    confounder: e.confounder,
    date: e.date,
  }))
}

/* ----------------------------------------------------------- change log -- */

export interface ChangeLogRow {
  ticker: string
  name: string
  date: string
  from: AlertState
  to: AlertState
  multiple: number | null
  consensus: string
  event: string
  /** an event sits within COINCIDENCE_DAYS of the change — context, never cause */
  eventNearby: boolean
}

/** How close an event has to sit to a state change to count as coinciding. */
export const COINCIDENCE_DAYS = 3

/** The nearest recorded event to a date, if one falls inside the window. */
export function eventNear(instrument: Instrument, date: string, days = COINCIDENCE_DAYS): RelatedEvent | null {
  const candidates = instrument.related_events.filter(
    (e) => Math.abs(daysBetween(e.date, date)) <= days,
  )
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => Math.abs(daysBetween(a.date, date)) - Math.abs(daysBetween(b.date, date)))[0]
}

/**
 * Replay the scoring function across the tail of each series to find the days
 * on which a ticker changed alert state.
 *
 * Each replay step re-derives from a truncated series, so a change log entry
 * means exactly what the monitor would have shown on that day — the two
 * screens can never disagree.
 */
export function buildChangeLog(
  instruments: Instrument[],
  windowDays: number,
  lookbackDays = 30,
): ChangeLogRow[] {
  const rows: ChangeLogRow[] = []

  for (const instrument of instruments) {
    const series = instrument.series
    // one extra step at the front so the first day in range has something to
    // compare against, and never walk past the start of the series
    const first = Math.max(1, series.length - lookbackDays - 1)
    let previous: AlertState | null = null

    for (let end = first; end <= series.length; end++) {
      const truncated: Instrument = { ...instrument, series: series.slice(0, end) }
      const signal = deriveSignal(truncated, windowDays)
      const state = toAlertState(signal.state)

      if (previous !== null && state !== previous) {
        const date = series[end - 1].date
        const nearby = eventNear(instrument, date)
        rows.push({
          ticker: instrument.ticker,
          name: instrument.name,
          date,
          from: previous,
          to: state,
          multiple: attentionMultiple(signal),
          consensus: consensusLabel(signal),
          event: nearby ? nearby.label : 'No notable event',
          eventNearby: nearby !== null,
        })
      }
      previous = state
    }
  }

  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.ticker.localeCompare(b.ticker)))
}

export interface ChangeLogSummary {
  total: number
  elevatedEntries: number
  remainElevated: number
  returnedToStable: number
  medianDaysToStable: number | null
  withEvent: number
  byTarget: Record<AlertState, number>
}

export function summariseChangeLog(
  rows: ChangeLogRow[],
  currentStates: Record<string, AlertState>,
): ChangeLogSummary {
  const byTarget: Record<AlertState, number> = { elevated: 0, watch: 0, stable: 0, insufficient: 0 }
  rows.forEach((r) => (byTarget[r.to] += 1))

  const elevatedEntries = rows.filter((r) => r.to === 'elevated')
  const returned = rows.filter((r) => r.to === 'stable')

  // for each entry into elevated, how long until the same ticker went stable
  const spans: number[] = []
  for (const entry of elevatedEntries) {
    const exit = rows
      .filter((r) => r.ticker === entry.ticker && r.to === 'stable' && r.date > entry.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0]
    if (exit) spans.push(daysBetween(entry.date, exit.date))
  }
  spans.sort((a, b) => a - b)
  const medianDaysToStable = spans.length
    ? spans.length % 2
      ? spans[(spans.length - 1) / 2]
      : (spans[spans.length / 2 - 1] + spans[spans.length / 2]) / 2
    : null

  return {
    total: rows.length,
    elevatedEntries: elevatedEntries.length,
    remainElevated: Object.values(currentStates).filter((s) => s === 'elevated').length,
    returnedToStable: returned.length,
    medianDaysToStable,
    withEvent: rows.filter((r) => r.eventNearby).length,
    byTarget,
  }
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/* --------------------------------------------------------------- misc ---- */

/** "2h" / "3d" — the compact age column used across the design. */
export function age(iso: string, referenceIso: string): string {
  const ms = new Date(referenceIso).getTime() - new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return '<1h'
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Sidebar footer and watchlist settings read the workspace name from the data. */
export function workspaceLabel(snapshot: Snapshot | null): string {
  if (!snapshot) return 'Research workspace'
  return snapshot.dataset === 'demo-snapshot' ? 'Demo workspace' : snapshot.dataset
}
