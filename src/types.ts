/**
 * Shared data contract between Backend (JSON/CSV export) and this frontend.
 * See docs/DATA_CONTRACT.md for field-by-field notes.
 *
 * The snapshot carries MEASURED INPUTS ONLY. Risk score and risk state are
 * derived in src/lib/scoring.ts so that every warning is explainable on screen.
 */

export type Direction = 'bullish' | 'bearish' | 'mixed'
export type EventType = 'earnings' | 'filing' | 'regulatory' | 'news' | 'forum'
export type RiskState = 'elevated' | 'watch' | 'normal' | 'insufficient'

export interface SourceDefinition {
  id: string
  label: string
  note: string
}

export interface SeriesPoint {
  /** ISO date, YYYY-MM-DD */
  date: string
  mentions: number
  baseline_mean: number
  baseline_sd: number
  attention_z: number
  /** share of directional mentions pointing the same way, 0-1 */
  consensus_share: number
  dominant_direction: Direction
}

export interface SourceMixEntry {
  source_id: string
  label: string
  share: number
  mentions: number
  available: boolean
  note: string
}

export interface RelatedEvent {
  date: string
  type: EventType
  label: string
  headline: string
  source: string
  /** true when the event could plausibly explain the attention change on its own */
  confounder: boolean
}

export interface HistoricalCase {
  id: string
  date: string
  attention_z: number
  consensus_share: number
  forward_5d_pct: number
  outcome: 'continuation' | 'weakening' | 'reversal'
  event_flagged: boolean
  note: string
}

export interface HistoricalEvidence {
  sample_size: number
  date_range: { start: string; end: string }
  definition: string
  high_signal_mean_pct: { d1: number; d3: number; d5: number }
  ordinary_mean_pct: { d1: number; d3: number; d5: number }
  outcome_split: { continuation: number; weakening: number; reversal: number }
  event_flagged_share: number
  supporting_cases: HistoricalCase[]
  counterexamples: HistoricalCase[]
}

export interface Instrument {
  ticker: string
  name: string
  sector: string
  last_updated: string
  attention: {
    mentions_today: number
    mentions_prev_day: number
    baseline_mean: number
    baseline_sd: number
    baseline_window_days: number
    z_score: number
    pct_vs_baseline: number
    days_above_baseline: number
  }
  consensus: {
    dominant_direction: Direction
    share: number
    baseline_share: number
    share_change: number
    directional_mentions: number
  }
  coverage: {
    completeness: number
    sources_available: number
    sources_expected: number
    note: string
  }
  event_flag: { present: boolean; date?: string; type?: EventType; label?: string }
  /**
   * What this particular signal cannot tell you. Optional: the UI falls back to
   * the generic limit sentence plus the coverage note when an export omits it.
   */
  limitations?: string[]
  source_mix: SourceMixEntry[]
  related_events: RelatedEvent[]
  series: SeriesPoint[]
  historical: HistoricalEvidence
}

export interface Snapshot {
  schema_version: string
  dataset: string
  is_synthetic: boolean
  /**
   * User-facing statement of what this export is — rendered verbatim wherever a
   * screen has to say where its numbers came from. Optional: the UI falls back
   * to a phrase derived from `is_synthetic`.
   */
  data_status?: string
  disclaimer: string
  generated_at: string
  data_window: { start: string; end: string }
  baseline_window_days: number
  sources: SourceDefinition[]
  instruments: Instrument[]
}
