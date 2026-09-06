/**
 * Runtime smoke test.
 *
 *  1. every instrument × every window derives to finite, in-range values
 *  2. the bundled snapshot still produces the readings the recorded demo needs
 *
 * Both run through src/lib/scoring.ts — the module the screens use — so a pass
 * means the data pipeline and the interface agree.
 */
import { readFileSync } from 'node:fs'
import { deriveSignal, WINDOWS } from '../src/lib/scoring.ts'
import { attentionMultiple, coverageTier, relatedEventLabel, toAlertState } from '../src/lib/attnshift.ts'
import { DEMO_READINGS, DEMO_WINDOW } from './demo-contract.ts'
import type { Snapshot } from '../src/types.ts'

const snap = JSON.parse(readFileSync(new URL('../src/data/snapshot.json', import.meta.url), 'utf8')) as Snapshot
let failures = 0

for (const w of WINDOWS) {
  const rows = snap.instruments.map((i) => deriveSignal(i, w))
  for (const s of rows) {
    const bad =
      !Number.isFinite(s.score) ||
      !Number.isFinite(s.attentionZ) ||
      !Number.isFinite(s.attentionPct) ||
      s.score < 0 ||
      s.score > 100 ||
      s.windowSeries.length === 0 ||
      s.components.some((c) => !Number.isFinite(c.points) || c.points < 0 || c.points > c.max) ||
      s.drivers.length === 0
    if (bad) {
      failures++
      console.error('FAIL', w, s.ticker, JSON.stringify({ score: s.score, z: s.attentionZ, n: s.windowSeries.length }))
    }
  }
  const counts = rows.reduce<Record<string, number>>((a, s) => ((a[s.state] = (a[s.state] ?? 0) + 1), a), {})
  console.log(
    `window ${String(w).padStart(2)}d →`,
    Object.entries(counts).map(([k, v]) => `${k}:${v}`).join('  '),
    '|',
    rows
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((s) => `${s.ticker} ${s.score.toFixed(0)}`)
      .join(', '),
  )
}
/* ------------------------------------------------- the demo contract ----- */

console.log(`\ndemo readings at ${DEMO_WINDOW}d:`)
for (const want of DEMO_READINGS) {
  const instrument = snap.instruments.find((i) => i.ticker === want.ticker)
  if (!instrument) {
    failures++
    console.error(`FAIL ${want.ticker} is not in the snapshot`)
    continue
  }
  const s = deriveSignal(instrument, DEMO_WINDOW)
  const got = {
    state: toAlertState(s.state),
    multiple: Number((attentionMultiple(s) ?? 0).toFixed(1)),
    share: Math.round(s.consensusShare * 100),
    direction: s.direction,
    coverage: coverageTier(instrument),
    event: relatedEventLabel(instrument),
  }
  const expected = { ...want, share: Math.round(want.share * 100) }
  const wrong = (Object.keys(got) as (keyof typeof got)[]).filter((k) => got[k] !== expected[k])
  if (wrong.length) {
    failures++
    console.error(`FAIL ${want.ticker} →`, wrong.map((k) => `${k}: got ${got[k]}, want ${expected[k]}`).join('; '))
  } else {
    console.log(
      `  ${want.ticker.padEnd(4)} ${got.state.padEnd(9)} ${got.multiple.toFixed(1)}×` +
        ` ${got.share}% ${got.direction}`.padEnd(15) +
        ` ${got.coverage.padEnd(7)} ${got.event}`,
    )
  }
}

console.log(failures === 0 ? '\nOK — derivations in range, demo readings match' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
