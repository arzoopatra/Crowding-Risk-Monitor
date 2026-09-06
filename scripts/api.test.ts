/**
 * Calculation tests for the prototype API.
 *
 *   node --test scripts/api.test.ts
 *
 * Four of these check the arithmetic and the threshold table on hand-written
 * inputs, where the expected answer can be worked out on paper. The last two
 * check the two joins that make the path repeatable: that the API agrees with
 * the interface's own scoring module on the demo tickers, and that the routes
 * answer.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import {
  attentionMultiple,
  buildSignals,
  consensus,
  coveragePercent,
  riskState,
  RULES,
} from '../server/signals.ts'
import type { Fixture } from '../server/signals.ts'
import { createApiServer } from '../server/index.ts'
import { deriveSignal } from '../src/lib/scoring.ts'
import { attentionMultiple as uiAttentionMultiple, toAlertState } from '../src/lib/attnshift.ts'
import { DEMO_READINGS, DEMO_WINDOW } from './demo-contract.ts'
import type { Snapshot } from '../src/types.ts'

const root = new URL('..', import.meta.url)
const fixture = JSON.parse(readFileSync(new URL('server/data/fixture.json', root), 'utf8')) as Fixture
const snapshot = JSON.parse(readFileSync(new URL('src/data/snapshot.json', root), 'utf8')) as Snapshot
const signals = buildSignals(fixture)
const byTicker = (t: string) => {
  const s = signals.find((x) => x.ticker === t)
  assert.ok(s, `${t} missing from the fixture`)
  return s
}

/** A baseline of `sessions` days at `level`, then today at `today`. */
const daily = (level: number, today: number, sessions = 29) => [
  ...Array.from({ length: sessions }, (_, n) => ({ date: `2026-07-${n + 1}`, mentions: level })),
  { date: '2026-08-01', mentions: today },
]

/* ------------------------------------------------ 1. attention multiple -- */

test('attention multiple divides today by the mean of the preceding sessions', () => {
  // 29 sessions at 100, today 300 → 3.00, and the spike must not raise its own baseline
  const a = attentionMultiple(daily(100, 300))
  assert.equal(a.current, 300)
  assert.equal(a.baselineMean, 100)
  assert.equal(a.baselineSessions, 29)
  assert.equal(a.multiple, 3)

  // uneven baseline: mean(10, 20, 30) = 20, today 50 → 2.5
  const b = attentionMultiple([
    { date: '2026-08-01', mentions: 10 },
    { date: '2026-08-02', mentions: 20 },
    { date: '2026-08-03', mentions: 30 },
    { date: '2026-08-04', mentions: 50 },
  ])
  assert.equal(b.baselineMean, 20)
  assert.equal(b.multiple, 2.5)

  // no usable baseline: one session, or a silent one, cannot produce a multiple
  assert.equal(attentionMultiple([{ date: '2026-08-01', mentions: 40 }]).multiple, null)
  assert.equal(attentionMultiple(daily(0, 40)).multiple, null)
})

/* ------------------------------------------------------- 2. consensus --- */

test('consensus is the dominant direction over classified items only', () => {
  // 780 of 1000 classified lean bullish; the 200 unclassified are excluded
  const a = consensus({ total_items: 1200, bullish_items: 780, bearish_items: 220, unclassified_items: 200 })
  assert.equal(a.direction, 'bullish')
  assert.equal(a.classifiedItems, 1000)
  assert.equal(a.dominantItems, 780)
  assert.equal(a.percent, 78)

  // the dominant side can be the bearish one
  const b = consensus({ total_items: 100, bullish_items: 20, bearish_items: 60, unclassified_items: 20 })
  assert.equal(b.direction, 'bearish')
  assert.equal(b.percent, 75)

  // an even split has no dominant direction, and nothing classified has no percentage
  assert.equal(consensus({ total_items: 10, bullish_items: 5, bearish_items: 5, unclassified_items: 0 }).direction, 'mixed')
  assert.equal(consensus({ total_items: 10, bullish_items: 0, bearish_items: 0, unclassified_items: 10 }).percent, null)

  // coverage counts classified items against everything collected
  assert.equal(coveragePercent(1000, 1200), 83.3)
  assert.equal(coveragePercent(0, 0), null)
})

/* --------------------------------------------- 3. insufficient handling -- */

test('insufficient data wins over any level, on each of its three gates', () => {
  const ok = {
    attentionMultiple: 3,
    consensusPercent: 80,
    coveragePercent: 72,
    classifiedItems: 500,
    sourcesReporting: 4,
    sourcesExpected: 4,
  }
  assert.equal(riskState(ok).state, 'Elevated')

  // too few classified items to have an opinion, despite a 3x spike
  const thin = riskState({ ...ok, classifiedItems: 20 })
  assert.equal(thin.state, 'Insufficient data')
  assert.match(thin.reason, /classified items/)

  // classification coverage below the floor
  assert.equal(riskState({ ...ok, coveragePercent: 31 }).state, 'Insufficient data')

  // a source did not report, so the mention count is known to be short
  const missing = riskState({ ...ok, sourcesReporting: 3 })
  assert.equal(missing.state, 'Insufficient data')
  assert.match(missing.reason, /3 of 4 sources/)

  // an input that could not be calculated at all
  assert.equal(riskState({ ...ok, attentionMultiple: null }).state, 'Insufficient data')

  // and the fixture's own thin instrument reaches the same verdict
  const qntl = byTicker('QNTL')
  assert.equal(qntl.risk_state, 'Insufficient data')
  assert.equal(qntl.coverage.sources_reporting, 3)
})

/* ------------------------------------------ 4. Elevated versus Watch ----- */

test('Elevated needs both rules, Watch needs either, Stable needs neither', () => {
  const at = (mult: number, cons: number) =>
    riskState({
      attentionMultiple: mult,
      consensusPercent: cons,
      coveragePercent: 72,
      classifiedItems: 500,
      sourcesReporting: 4,
      sourcesExpected: 4,
    }).state

  // exactly on both Elevated thresholds
  assert.equal(at(RULES.elevated.attention_multiple, RULES.elevated.consensus_percent), 'Elevated')

  // one rule short of Elevated is Watch, not Elevated — in either direction
  assert.equal(at(1.9, 95), 'Watch')
  assert.equal(at(9.0, 69), 'Watch')

  // either Watch rule alone is enough for Watch
  assert.equal(at(RULES.watch.attention_multiple, 50), 'Watch')
  assert.equal(at(1.0, RULES.watch.consensus_percent), 'Watch')

  // below both Watch rules
  assert.equal(at(1.49, 64.9), 'Stable')

  // the fixture's demo tickers land where the demo script says they do
  assert.equal(byTicker('NVX').risk_state, 'Elevated')
  assert.equal(byTicker('MIN').risk_state, 'Watch')
  assert.equal(byTicker('CRSL').risk_state, 'Stable')
})

/* ------------------------------- 5. the API and the interface agree ------ */

test('API values match what src/lib/scoring.ts derives for the demo tickers', () => {
  for (const want of DEMO_READINGS) {
    const api = byTicker(want.ticker)
    const instrument = snapshot.instruments.find((i) => i.ticker === want.ticker)
    assert.ok(instrument, `${want.ticker} missing from the snapshot`)
    const ui = deriveSignal(instrument, DEMO_WINDOW)

    // the headline number on both sides, to the precision the interface prints
    const uiMultiple = uiAttentionMultiple(ui)
    assert.ok(uiMultiple !== null)
    assert.equal(api.attention.attention_multiple?.toFixed(1), uiMultiple.toFixed(1))
    assert.equal(api.attention.attention_multiple?.toFixed(1), want.multiple.toFixed(1))

    // direction and agreement
    assert.equal(api.consensus.dominant_direction, want.direction)
    assert.equal(Math.round(api.consensus.consensus_percent ?? 0), Math.round(want.share * 100))
    assert.equal(Math.round(ui.consensusShare * 100), Math.round(api.consensus.consensus_percent ?? 0))

    // the state the interface shows for the same ticker
    assert.equal(api.risk_state.toLowerCase(), toAlertState(ui.state))

    // the event named on both screens
    assert.equal(api.related_event?.label, want.event)
  }
})

/* ------------------------------------------------- 6. the routes answer -- */

test('the four routes answer, and an unknown ticker 404s', async () => {
  // the routes are the contract; their bodies are checked field by field below
  const body = async (r: Response): Promise<any> => r.json()
  const server = createApiServer().listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://localhost:${(server.address() as AddressInfo).port}`

  try {
    const health = await fetch(`${base}/api/health`)
    assert.equal(health.status, 200)
    assert.equal((await body(health)).status, 'ok')

    const list = await fetch(`${base}/api/signals`)
    assert.equal(list.status, 200)
    const listBody = await body(list)
    assert.equal(listBody.count, fixture.instruments.length)
    assert.equal(listBody.is_illustrative, true)
    assert.ok(listBody.method.rules.basis.includes('not an empirically validated'))

    const one = await fetch(`${base}/api/signals/NVX`)
    assert.equal(one.status, 200)
    const nvx = (await body(one)).signal
    assert.equal(nvx.risk_state, 'Elevated')
    assert.equal(nvx.attention.attention_multiple, 3.1)
    assert.equal(nvx.is_illustrative, true)
    assert.ok(nvx.source_breakdown.length > 0)
    assert.ok(nvx.limitations.length > 0)
    assert.ok(nvx.related_event)

    // lower case resolves too, so a typed URL in the demo cannot miss
    assert.equal((await fetch(`${base}/api/signals/nvx`)).status, 200)
    assert.equal((await fetch(`${base}/api/signals/ZZZ`)).status, 404)

    // the contract the interface reads, stamped with where it came from
    const snap = await fetch(`${base}/api/snapshot`)
    assert.equal(snap.status, 200)
    const served = await body(snap)
    assert.equal(served.instruments.length, snapshot.instruments.length)
    assert.match(served.data_status, /prototype API/)
  } finally {
    server.close()
  }
})
