/**
 * Deterministic mock-snapshot generator for the Public Crowding-Risk Monitor.
 *
 * Writes src/data/snapshot.json in exactly the shape documented in
 * docs/DATA_CONTRACT.md, so the Backend member can replace this file
 * without any frontend change.
 *
 * The snapshot carries MEASURED INPUTS ONLY (attention, consensus, coverage,
 * events, outcomes). The alert state is derived in the UI from
 * src/lib/scoring.ts so that every warning can be explained on screen.
 *
 * This script imports THAT SAME MODULE to verify its output, so the pipeline
 * cannot drift away from what the screens will show.
 *
 *   node scripts/generate-mock.ts                    # dated at run time
 *   MOCK_AS_OF=2026-08-21T09:30:00Z node scripts/generate-mock.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveSignal } from '../src/lib/scoring.ts'
import { attentionMultiple, coverageTier, relatedEventLabel, toAlertState } from '../src/lib/attnshift.ts'
import type { Direction, EventType, Instrument, SeriesPoint, Snapshot } from '../src/types.ts'
import { DEMO_READINGS, DEMO_WINDOW } from './demo-contract.ts'
import type { DemoReading } from './demo-contract.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The snapshot is stamped at RUN TIME, so "last updated" is never a date left
 * over from a design file. Pin it with MOCK_AS_OF when a byte-identical
 * snapshot matters (regression fixtures, screenshot diffs).
 */
const AS_OF = (() => {
  const pinned = process.env.MOCK_AS_OF
  if (pinned) {
    const d = new Date(pinned)
    if (Number.isNaN(d.getTime())) {
      throw new Error(`MOCK_AS_OF is not a valid date: ${pinned}`)
    }
    return d
  }

  return new Date()
})()

const DAYS = 90
const BASELINE_WINDOW = DEMO_WINDOW

/* ---------- deterministic PRNG (mulberry32) ---------- */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const seeded = (seed: number) => {
  const r = rng(seed)
  return {
    next: r,
    range: (lo: number, hi: number) => lo + r() * (hi - lo),
    // Box-Muller, deterministic
    normal: (mu = 0, sd = 1) => {
      const u = Math.max(r(), 1e-9)
      const v = Math.max(r(), 1e-9)
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    pick: <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)],
  }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const dayOffset = (base: Date, n: number) => new Date(base.getTime() + n * 86400000)
const round = (n: number, p = 2) => Number(n.toFixed(p))
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
const sd = (a: number[]) => {
  const m = mean(a)
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)))
}

const SOURCES = [
  { id: 'news', label: 'Licensed news feed', note: 'Wire and publisher headlines under a licensed feed.' },
  { id: 'forum', label: 'Authorised forum sample', note: 'Retail-heavy discussion; skews toward high-visibility names.' },
  { id: 'search', label: 'Public search interest', note: 'Normalised index, not raw counts. Weekly re-basing.' },
  { id: 'filings', label: 'Company disclosure feed', note: 'Scheduled disclosures. Causes attention spikes unrelated to positioning.' },
]

type Profile = 'surge' | 'forum-spike' | 'ramp' | 'mild-ramp' | 'flat' | 'sparse'

/**
 * The exact reading a demo ticker has to show on screen, from the shared
 * contract table, plus where inside the state's band to aim so the target is
 * not a knife edge. The generator SOLVES for a series that derives to it and
 * refuses to write a snapshot that misses — the demo cannot drift from the data.
 */
type DemoTarget = DemoReading & { aimScore: number }

const reading = (ticker: string): DemoReading => {
  const found = DEMO_READINGS.find((d) => d.ticker === ticker)
  if (!found) throw new Error(`no demo reading declared for ${ticker}`)
  return found
}

interface Spec {
  ticker: string
  name: string
  sector: string
  seed: number
  base: number
  profile: Profile
  dir: Direction
  peakShare: number
  coverage: number
  event: { day: number; type: EventType; label: string } | null
  limitations: string[]
  demo?: DemoTarget
}

/* ---------- universe definition ----------
 * Fictional instruments. The snapshot is a synthetic demonstration export, and
 * attaching invented mention counts and invented forward outcomes to real
 * listed companies would misrepresent both.
 *
 * `profile` drives the SHAPE of the synthetic series, not the state. The state
 * is derived in the UI from whatever this data produces. */
const UNIVERSE: Spec[] = [
  {
    ticker: 'NVX', name: 'Novexa Semiconductor', sector: 'Semiconductors',
    seed: 1011, base: 940, profile: 'surge', dir: 'bullish', peakShare: 0.78, coverage: 1.0,
    event: { day: -3, type: 'earnings', label: 'Earnings' },
    limitations: [
      'The earnings release sits inside the window and could account for the whole attention change on its own.',
      'A licensed-news-led rise measures editorial attention, not who is positioned.',
    ],
    demo: { ...reading('NVX'), aimScore: 72 },
  },
  {
    ticker: 'MIN', name: 'Meridian Industrials', sector: 'Industrials',
    seed: 2022, base: 305, profile: 'ramp', dir: 'bullish', peakShare: 0.61, coverage: 0.96,
    event: { day: -2, type: 'news', label: 'Analyst upgrade' },
    limitations: [
      'An analyst upgrade coincides with the rise and could account for it on its own.',
      'A 61% dominant-direction share is close enough to an even split that the agreement reading is weak.',
    ],
    demo: { ...reading('MIN'), aimScore: 47 },
  },
  {
    ticker: 'QGG', name: 'Quantgrid Group', sector: 'Digital Infrastructure',
    seed: 3033, base: 168, profile: 'mild-ramp', dir: 'bearish', peakShare: 0.57, coverage: 0.72,
    event: { day: -4, type: 'news', label: 'Media coverage' },
    limitations: [
      'One source group returned partial data, so the mention count is biased downward.',
      'A 57% bearish share is a slight lean, not a consensus.',
    ],
    demo: { ...reading('QGG'), aimScore: 45 },
  },
  {
    ticker: 'ORBX', name: 'Orbex Dynamics', sector: 'Aerospace & Defence',
    seed: 4044, base: 210, profile: 'forum-spike', dir: 'bullish', peakShare: 0.88, coverage: 0.78,
    event: null,
    limitations: [
      'Most of the volume comes from one retail-heavy forum sample, which covers a narrow population.',
      'One or more source groups returned partial data for this window.',
    ],
  },
  {
    ticker: 'KVRA', name: 'Kavira Therapeutics', sector: 'Biotechnology',
    seed: 5055, base: 155, profile: 'surge', dir: 'bearish', peakShare: 0.79, coverage: 0.86,
    event: null,
    limitations: ['No scheduled event was found, so an unrecorded catalyst outside these sources cannot be excluded.'],
  },
  {
    ticker: 'ZNTH', name: 'Zenith Grid Energy', sector: 'Utilities',
    seed: 6066, base: 430, profile: 'ramp', dir: 'bullish', peakShare: 0.81, coverage: 0.95,
    event: null,
    limitations: ['A gradual build is harder to separate from a slow drift in source coverage than a single-day spike.'],
  },
  {
    ticker: 'SLTR', name: 'Solterra Materials', sector: 'Materials',
    seed: 7077, base: 265, profile: 'ramp', dir: 'mixed', peakShare: 0.62, coverage: 0.72,
    event: { day: -6, type: 'filing', label: 'Delayed filing update' },
    limitations: [
      'A scheduled disclosure sits in the window and is discounted, which is why the level stays low despite the rise.',
      'One or more source groups returned partial data for this window.',
    ],
  },
  {
    ticker: 'AXOM', name: 'Axiom Payments', sector: 'Financials',
    seed: 8088, base: 320, profile: 'ramp', dir: 'bullish', peakShare: 0.74, coverage: 0.91,
    event: { day: -9, type: 'regulatory', label: 'Regulatory consultation' },
    limitations: ['A regulatory consultation coincides with the rise and could account for it on its own.'],
  },
  {
    ticker: 'VNTR', name: 'Ventra Mobility', sector: 'Automotive',
    seed: 9099, base: 180, profile: 'mild-ramp', dir: 'bearish', peakShare: 0.71, coverage: 0.83,
    event: null,
    limitations: ['One or more source groups returned partial data, so the mention count is biased downward.'],
  },
  {
    ticker: 'CRSL', name: 'Carousel Media Group', sector: 'Media',
    seed: 1212, base: 1180, profile: 'mild-ramp', dir: 'mixed', peakShare: 0.56, coverage: 1.0,
    event: { day: -2, type: 'news', label: 'Media coverage' },
    limitations: ['Press coverage coincides with the rise and could account for it on its own.'],
  },
  {
    ticker: 'HRVS', name: 'Harvest Foods Co.', sector: 'Consumer Staples',
    seed: 1313, base: 620, profile: 'flat', dir: 'mixed', peakShare: 0.53, coverage: 1.0,
    event: null,
    limitations: ['Nothing unusual is being measured here; a quiet reading is not evidence that nothing is happening.'],
  },
  {
    ticker: 'QNTL', name: 'Quantel Labs', sector: 'Quantum Computing',
    seed: 1414, base: 38, profile: 'sparse', dir: 'bullish', peakShare: 0.7, coverage: 0.41,
    event: null,
    limitations: [
      'Source coverage is below the floor required to state a level at all, so no alert state is claimed.',
      'A thin sample makes the z-score unstable from session to session.',
    ],
  },
]

const HEADLINES: Record<EventType, string[]> = {
  earnings: ['{name} reports quarterly results ahead of guidance', 'Analysts revisit {ticker} estimates after results', '{ticker} guidance commentary drives extended-hours coverage'],
  filing: ['{name} files updated disclosure with the regulator', '{ticker} filing timetable draws follow-up coverage'],
  regulatory: ['{name} responds to regulatory consultation', 'Policy commentary references {ticker} directly'],
  news: ['{name} coverage picks up across major outlets', 'Sector note names {ticker} among most-discussed'],
  forum: ['Discussion volume on {ticker} rises across authorised forum sample', '{ticker} appears in daily most-mentioned list'],
}

/* ---------------------------------------------------------------- series -- */

/** Raw daily mention counts, before any demo target is applied. */
function buildRaw(spec: Spec, rampStrength = 1): number[] {
  const r = seeded(spec.seed)
  const total = DAYS + BASELINE_WINDOW // extra history so day 0 already has a baseline
  const raw: number[] = []
  for (let i = 0; i < total; i++) {
    const t = i / total
    let level = spec.base
    const recent = i - (total - 1) // 0 for today, negative going back
    switch (spec.profile) {
      case 'surge':
        level *= 1 + 0.1 * Math.sin(t * 6)
        if (recent > -9) level *= 1 + rampStrength * 1.9 * Math.exp((recent + 1) / 3.2)
        break
      case 'forum-spike':
        level *= 1 + 0.14 * Math.sin(t * 9)
        if (recent > -6) level *= 1 + rampStrength * 3.4 * Math.exp((recent + 1) / 2.1)
        break
      case 'ramp':
        level *= 1 + 0.08 * Math.sin(t * 5)
        if (recent > -18) level *= 1 + rampStrength * 0.95 * ((recent + 18) / 18) ** 1.7
        break
      case 'mild-ramp':
        level *= 1 + 0.09 * Math.sin(t * 4)
        if (recent > -14) level *= 1 + rampStrength * 0.34 * ((recent + 14) / 14) ** 1.5
        break
      case 'sparse':
        level *= 1 + 0.25 * Math.sin(t * 11)
        break
      default:
        level *= 1 + 0.11 * Math.sin(t * 7)
    }
    const noise = r.normal(1, spec.profile === 'sparse' ? 0.34 : 0.13)
    raw.push(Math.max(spec.profile === 'sparse' ? 3 : 12, Math.round(level * noise)))
  }
  return raw
}

function buildShares(spec: Spec): number[] {
  const r = seeded(spec.seed)
  const total = DAYS + BASELINE_WINDOW
  // burn the noise draws the mention series already consumed, so shares get
  // their own stream rather than mirroring the counts
  for (let i = 0; i < total; i++) r.normal(1, 0.13)
  const shares: number[] = []
  for (let i = 0; i < total; i++) {
    const recent = i - (total - 1)
    const baseShare = spec.dir === 'mixed' ? 0.5 : 0.55
    const build = clamp((recent + 20) / 20, 0, 1) ** 1.4
    const target = baseShare + (spec.peakShare - baseShare) * build
    shares.push(clamp(target + r.normal(0, 0.028), 0.42, 0.94))
  }
  return shares
}

function buildSeries(spec: Spec, rampStrength = 1): SeriesPoint[] {
  const raw = buildRaw(spec, rampStrength)
  const shares = buildShares(spec)
  const total = raw.length

  const series: SeriesPoint[] = []
  for (let i = BASELINE_WINDOW; i < total; i++) {
    const window = raw.slice(i - BASELINE_WINDOW, i)
    const bMean = mean(window)
    const bSd = Math.max(sd(window), bMean * 0.06, 1)
    series.push({
      date: isoDay(dayOffset(AS_OF, i - (total - 1))),
      mentions: raw[i],
      baseline_mean: round(bMean, 1),
      baseline_sd: round(bSd, 1),
      attention_z: round((raw[i] - bMean) / bSd, 2),
      consensus_share: round(shares[i], 3),
      dominant_direction: spec.dir === 'mixed' ? (shares[i] > 0.55 ? 'bullish' : 'mixed') : spec.dir,
    })
  }
  return series
}

/**
 * Force the latest session to the exact headline reading the demo has to show.
 *
 * The multiple is `today / mean(baseline)`, and the baseline is every session
 * in the window EXCEPT today — so writing today's count as a multiple of that
 * mean is not circular, and the screen reads back the target to one decimal.
 */
function applyDemoTarget(series: SeriesPoint[], demo: DemoTarget): SeriesPoint[] {
  const out = series.map((p) => ({ ...p }))
  const window = out.slice(-BASELINE_WINDOW)
  const baseline = window.slice(0, -1).map((p) => p.mentions)
  const bMean = mean(baseline)
  const bSd = Math.max(sd(baseline), bMean * 0.06, 1)

  const today = out[out.length - 1]
  today.mentions = Math.round(demo.multiple * bMean)
  today.baseline_mean = round(bMean, 1)
  today.baseline_sd = round(bSd, 1)
  today.attention_z = round((today.mentions - bMean) / bSd, 2)
  today.consensus_share = demo.share
  today.dominant_direction = demo.direction
  return out
}

/* ---------------------------------------------------- rest of the record -- */

function buildSourceMix(spec: Spec, todayMentions: number) {
  const r = seeded(spec.seed + 77)
  let weights: number[]
  if (spec.profile === 'forum-spike') weights = [0.18, 0.63, 0.15, 0.04]
  else if (spec.profile === 'surge') weights = [0.46, 0.28, 0.19, 0.07]
  else if (spec.profile === 'sparse') weights = [0.34, 0.2, 0.46, 0.0]
  else weights = [0.41, 0.31, 0.22, 0.06]
  const jittered = weights.map((w) => (w === 0 ? 0 : Math.max(0.01, w + r.normal(0, 0.02))))
  const sum = jittered.reduce((s, x) => s + x, 0)
  return SOURCES.map((s, i) => ({
    source_id: s.id,
    label: s.label,
    share: round(jittered[i] / sum, 3),
    mentions: Math.round((jittered[i] / sum) * todayMentions),
    available: jittered[i] > 0.02,
    note: s.note,
  })).filter((s) => s.share > 0.005)
}

/**
 * Related events. `confounder: true` means only that the event could account
 * for the attention change on its own — it is never a claim that the event
 * caused the signal.
 */
function buildEvents(spec: Spec) {
  const r = seeded(spec.seed + 123)
  const events = []
  if (spec.event) {
    events.push({
      date: isoDay(dayOffset(AS_OF, spec.event.day)),
      type: spec.event.type,
      label: spec.event.label,
      headline: r.pick(HEADLINES[spec.event.type]).replace('{name}', spec.name).replace('{ticker}', spec.ticker),
      source: spec.event.type === 'filing' || spec.event.type === 'regulatory' ? 'Company disclosure feed' : 'Licensed news feed',
      // a media-coverage note coincides with the change without being able to
      // explain it on its own, so it carries no discount
      confounder: spec.event.label !== 'Media coverage',
    })
  }
  const extra = spec.profile === 'flat' || spec.profile === 'sparse' ? 1 : 2
  for (let i = 0; i < extra; i++) {
    const d = -Math.round(r.range(3, 26))
    const type: EventType = r.pick(['news', 'forum'])
    events.push({
      date: isoDay(dayOffset(AS_OF, d)),
      type,
      label: type === 'forum' ? 'Forum volume note' : 'Media coverage note',
      headline: r.pick(HEADLINES[type]).replace('{name}', spec.name).replace('{ticker}', spec.ticker),
      source: type === 'forum' ? 'Authorised forum sample' : 'Licensed news feed',
      confounder: false,
    })
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : -1))
}

function buildHistorical(spec: Spec) {
  const r = seeded(spec.seed + 999)
  const n = Math.round(r.range(18, 44))
  const bias = spec.profile === 'flat' || spec.profile === 'sparse' ? 0.15 : 0.55
  // forward moves are cumulative: the 3- and 5-session figures build on the 1-session one
  const cumulative = (drift: number, spread: number) => {
    const s1 = r.normal(drift, spread)
    const s2 = s1 + r.normal(drift * 1.1, spread * 1.2)
    const s3 = s2 + r.normal(drift * 1.2, spread * 1.4)
    return { d1: round(s1, 2), d3: round(s2, 2), d5: round(s3, 2) }
  }
  const highSignal = cumulative(-0.55 * bias, 0.5)
  const ordinary = cumulative(0.04, 0.12)
  const continued = round(clamp(r.range(0.34, 0.48), 0, 1) * 100, 0)
  const weakened = round(clamp(r.range(0.28, 0.4), 0, 1) * 100, 0)
  const reversed = 100 - continued - weakened

  const mkCase = (supporting: boolean, idx: number) => {
    const d = -Math.round(r.range(35, 400))
    const z = round(r.range(2.6, 7.4), 1)
    const share = round(r.range(0.68, 0.9), 2)
    const move = supporting ? round(-r.range(1.4, 8.2), 1) : round(r.range(2.1, 9.6), 1)
    return {
      id: `${spec.ticker}-${supporting ? 'S' : 'C'}${idx + 1}`,
      date: isoDay(dayOffset(AS_OF, d)),
      attention_z: z,
      consensus_share: share,
      forward_5d_pct: move,
      outcome: supporting ? (move < -4 ? 'reversal' : 'weakening') : 'continuation',
      event_flagged: r.next() > 0.6,
      note: supporting
        ? 'Attention and one-sided discussion rose together; the move did not continue over the next five sessions.'
        : 'A comparable signal was followed by continued movement in the same direction. The signal did not hold here.',
    }
  }

  return {
    sample_size: n,
    date_range: { start: isoDay(dayOffset(AS_OF, -540)), end: isoDay(dayOffset(AS_OF, -1)) },
    definition: 'Historical days where attention z ≥ 2.5 and dominant-direction share ≥ 0.70, measured on the same public sources.',
    high_signal_mean_pct: highSignal,
    ordinary_mean_pct: ordinary,
    outcome_split: { continuation: continued, weakening: weakened, reversal: reversed },
    event_flagged_share: round(r.range(0.28, 0.62), 2),
    supporting_cases: [0, 1].map((i) => mkCase(true, i)),
    counterexamples: [0, 1].map((i) => mkCase(false, i)),
  } as Instrument['historical']
}

function assemble(spec: Spec, series: SeriesPoint[]): Instrument {
  const today = series[series.length - 1]
  const prev = series[series.length - 2]

  let persistence = 0
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].attention_z >= 2) persistence++
    else break
  }

  const activeSources = buildSourceMix(spec, today.mentions)
  const events = buildEvents(spec)
  const recentConfounder = events.find(
    (e) => e.confounder && (new Date(e.date).getTime() - AS_OF.getTime()) / 86400000 >= -10,
  )
  const baselineShare = round(mean(series.slice(-40, -12).map((s) => s.consensus_share)), 3)

  return {
    ticker: spec.ticker,
    name: spec.name,
    sector: spec.sector,
    last_updated: new Date(AS_OF.getTime() - Math.round(seeded(spec.seed).range(4, 55)) * 60000).toISOString(),
    attention: {
      mentions_today: today.mentions,
      mentions_prev_day: prev.mentions,
      baseline_mean: today.baseline_mean,
      baseline_sd: today.baseline_sd,
      baseline_window_days: BASELINE_WINDOW,
      z_score: today.attention_z,
      pct_vs_baseline: round(((today.mentions - today.baseline_mean) / today.baseline_mean) * 100, 1),
      days_above_baseline: persistence,
    },
    consensus: {
      dominant_direction: today.dominant_direction,
      share: today.consensus_share,
      baseline_share: baselineShare,
      share_change: round(today.consensus_share - baselineShare, 3),
      directional_mentions: Math.round(today.mentions * 0.72),
    },
    coverage: {
      completeness: spec.coverage,
      sources_available: activeSources.filter((s) => s.available).length,
      sources_expected: SOURCES.length,
      note:
        spec.coverage < 0.5
          ? 'Sample too thin for a reliable reading. Treat any state as provisional.'
          : spec.coverage < 0.85
            ? 'One or more sources returned partial data for this window.'
            : 'All expected sources returned data for this window.',
    },
    event_flag: recentConfounder
      ? { present: true, date: recentConfounder.date, type: recentConfounder.type, label: recentConfounder.label }
      : { present: false },
    limitations: spec.limitations,
    source_mix: activeSources,
    related_events: events,
    series,
    historical: buildHistorical(spec),
  }
}

/**
 * Search the ramp strength that lands a demo ticker in the middle of its target
 * band. Only the run-up shape moves — the multiple, the consensus share and the
 * coverage are pinned by the target, so the scan is choosing the z-score and the
 * persistence run that sit behind them.
 */
function solveDemo(spec: Spec): SeriesPoint[] {
  const demo = spec.demo!
  let best: { series: SeriesPoint[]; distance: number; score: number } | null = null
  for (let step = 0; step <= 240; step++) {
    const strength = step / 80 // 0 … 3
    const series = applyDemoTarget(buildSeries(spec, strength), demo)
    const signal = deriveSignal(assemble(spec, series), BASELINE_WINDOW)
    if (toAlertState(signal.state) !== demo.state) continue
    const distance = Math.abs(signal.score - demo.aimScore)
    if (!best || distance < best.distance) best = { series, distance, score: signal.score }
  }
  if (!best) throw new Error(`${spec.ticker}: no ramp strength produces state "${demo.state}"`)
  return best.series
}

function buildInstrument(spec: Spec): Instrument {
  const series = spec.demo ? solveDemo(spec) : buildSeries(spec)
  return assemble(spec, series)
}

/* -------------------------------------------------------------- assemble -- */

const instruments = UNIVERSE.map(buildInstrument)

const snapshot: Snapshot = {
  schema_version: '1.1.0',
  dataset: 'demo-snapshot',
  is_synthetic: true,
  data_status: 'Illustrative interface data',
  disclaimer:
    'Synthetic demonstration snapshot. Tickers, company names, values, headlines and historical outcomes are generated for prototype testing and are not market data.',
  generated_at: AS_OF.toISOString(),
  data_window: { start: isoDay(dayOffset(AS_OF, -(DAYS - 1))), end: isoDay(AS_OF) },
  baseline_window_days: BASELINE_WINDOW,
  sources: SOURCES,
  instruments,
}

/* ----------------------------------------------- verify before it ships --- */
/* Derived with the same module the screens use, so a passing run means the
 * snapshot and the interface cannot disagree about a demo ticker. */

const failures: string[] = []
for (const spec of UNIVERSE) {
  if (!spec.demo) continue
  const instrument = instruments.find((i) => i.ticker === spec.ticker)!
  const signal = deriveSignal(instrument, BASELINE_WINDOW)
  const actual = {
    state: toAlertState(signal.state),
    multiple: Number((attentionMultiple(signal) ?? 0).toFixed(1)),
    share: Math.round(signal.consensusShare * 100),
    direction: signal.direction,
    coverage: coverageTier(instrument),
    event: relatedEventLabel(instrument),
  }
  const want = {
    state: spec.demo.state,
    multiple: spec.demo.multiple,
    share: Math.round(spec.demo.share * 100),
    direction: spec.demo.direction,
    coverage: spec.demo.coverage,
    event: spec.demo.event,
  }

  for (const key of Object.keys(want) as (keyof typeof want)[]) {
    if (actual[key] !== want[key]) failures.push(`${spec.ticker}.${key}: got ${actual[key]}, want ${want[key]}`)
  }
}

if (failures.length) {
  console.error('demo contract not met:\n  ' + failures.join('\n  '))
  process.exit(1)
}

const out = resolve(ROOT, 'src/data/snapshot.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n')

console.log(`wrote ${out}`)
console.log(`  instruments:     ${instruments.length}`)
console.log(`  days/instrument: ${instruments[0].series.length}`)
console.log(`  generated_at:    ${snapshot.generated_at}${process.env.MOCK_AS_OF ? ' (pinned)' : ' (run time)'}`)
console.log('\n  demo tickers — derived with src/lib/scoring.ts:')
for (const spec of UNIVERSE) {
  if (!spec.demo) continue
  const instrument = instruments.find((i) => i.ticker === spec.ticker)!
  const signal = deriveSignal(instrument, BASELINE_WINDOW)
  console.log(
    `    ${instrument.ticker.padEnd(5)} ${toAlertState(signal.state).padEnd(9)}` +
      ` ${(attentionMultiple(signal) ?? 0).toFixed(1)}×` +
      ` ${String(Math.round(signal.consensusShare * 100)) + '% ' + signal.direction}`.padEnd(16) +
      ` ${coverageTier(instrument).padEnd(7)} ${relatedEventLabel(instrument).padEnd(18)} score ${signal.score.toFixed(0)}`,
  )
}
