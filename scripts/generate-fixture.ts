/**
 * Builds the backend's saved fixture from the snapshot the interface already
 * ships (src/data/snapshot.json).
 *
 * The point of the backend proof is that the API *calculates* its numbers, so
 * the fixture carries RAW COUNTS only — daily mention counts, classified item
 * counts, per-source item counts. Every published figure (attention multiple,
 * consensus %, coverage %, risk state) is derived from those counts at request
 * time by server/signals.ts.
 *
 * Generating from the interface snapshot rather than hand-writing the fixture
 * means the two cannot drift: scripts/api.test.ts re-checks that the API and
 * src/lib/scoring.ts still agree on the demo tickers.
 *
 *   node scripts/generate-fixture.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { Snapshot } from '../src/types.ts'
import { WINDOW_SESSIONS } from '../server/signals.ts'

const root = new URL('..', import.meta.url)
const snap = JSON.parse(readFileSync(new URL('src/data/snapshot.json', root), 'utf8')) as Snapshot

let problems = 0
const fail = (msg: string) => {
  problems++
  console.error('FAIL', msg)
}

const instruments = snap.instruments.map((i) => {
  const window = i.series.slice(-WINDOW_SESSIONS)
  const today = window[window.length - 1]

  // the fixture is only honest if the counts it carries are the counts the
  // interface snapshot reports for the same day
  if (today.mentions !== i.attention.mentions_today) {
    fail(`${i.ticker}: series tail ${today.mentions} != attention.mentions_today ${i.attention.mentions_today}`)
  }
  // The snapshot derives each source count from a rounded share, so the parts
  // can miss the whole by a unit or two. Anything larger would mean the two
  // files disagree about the day; a rounding residual is reconciled into the
  // largest source so the fixture's own counts add up exactly.
  const sourceItems = i.source_mix.reduce((s, m) => s + m.mentions, 0)
  const residual = i.attention.mentions_today - sourceItems
  if (Math.abs(residual) > i.source_mix.length) {
    fail(`${i.ticker}: source mix sums to ${sourceItems}, mentions_today is ${i.attention.mentions_today}`)
  }
  const largest = i.source_mix.reduce((a, b) => (b.mentions > a.mentions ? b : a))

  const classified = i.consensus.directional_mentions
  const dominant = Math.round(i.consensus.share * classified)
  const other = classified - dominant
  const bullish = i.consensus.dominant_direction === 'bearish' ? other : dominant
  const bearish = i.consensus.dominant_direction === 'bearish' ? dominant : other

  // The flagged event is the one the interface discounts for, so match it on
  // type as well as date: a day can carry more than one recorded event.
  const event = i.event_flag.present
    ? i.related_events.find((e) => e.date === i.event_flag.date && e.type === i.event_flag.type) ??
      i.related_events.find((e) => e.date === i.event_flag.date) ??
      i.related_events[0]
    : i.related_events[0]

  return {
    ticker: i.ticker,
    name: i.name,
    sector: i.sector,
    as_of: today.date,
    collected_at: i.last_updated,
    /** last N sessions; the final entry is the current day, the rest are the baseline */
    daily_mentions: window.map((p) => ({ date: p.date, mentions: p.mentions })),
    classification: {
      total_items: today.mentions,
      bullish_items: bullish,
      bearish_items: bearish,
      unclassified_items: today.mentions - classified,
    },
    sources: i.source_mix.map((m) => ({
      id: m.source_id,
      label: m.label,
      items: m === largest ? m.mentions + residual : m.mentions,
      reporting: m.available,
      note: m.note,
    })),
    related_event: event
      ? {
          date: event.date,
          type: event.type,
          label: event.label,
          headline: event.headline,
          source: event.source,
          possible_confounder: event.confounder,
        }
      : null,
    limitations: i.limitations ?? [],
  }
})

const fixture = {
  fixture_version: '1.0.0',
  dataset: 'demo-fixture',
  is_illustrative: true,
  generated_at: new Date().toISOString(),
  generated_from: 'src/data/snapshot.json',
  as_of: snap.data_window.end,
  window_sessions: WINDOW_SESSIONS,
  sources_expected: snap.sources.map((s) => s.id),
  disclaimer: snap.disclaimer,
  instruments,
}

if (problems > 0) {
  console.error(`\n${problems} consistency problem(s) — fixture not written.`)
  process.exit(1)
}

writeFileSync(new URL('server/data/fixture.json', root), JSON.stringify(fixture, null, 2) + '\n')
console.log(`wrote server/data/fixture.json — ${instruments.length} instruments, ${WINDOW_SESSIONS} sessions each`)
