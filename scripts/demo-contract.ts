/**
 * The readings the recorded demo depends on.
 *
 * `generate-mock.ts` solves for a series that derives to these and refuses to
 * write a snapshot that does not; `smoke.ts` re-checks the snapshot that is
 * actually bundled. Both derive through src/lib/scoring.ts, so this table is
 * the one place the demo script and the interface have to agree.
 */
import type { CoverageTier, AlertState } from '../src/lib/attnshift.ts'
import type { Direction } from '../src/types.ts'

export interface DemoReading {
  ticker: string
  state: AlertState
  multiple: number
  share: number
  direction: Direction
  coverage: CoverageTier
  event: string
}

export const DEMO_READINGS: DemoReading[] = [
  { ticker: 'NVX', state: 'elevated', multiple: 3.1, share: 0.78, direction: 'bullish', coverage: 'high', event: 'Earnings' },
  { ticker: 'MIN', state: 'watch', multiple: 1.8, share: 0.61, direction: 'bullish', coverage: 'high', event: 'Analyst upgrade' },
  { ticker: 'QGG', state: 'watch', multiple: 1.6, share: 0.57, direction: 'bearish', coverage: 'medium', event: 'Media coverage' },
]

/** The look-back the demo is recorded at, and the app's default. */
export const DEMO_WINDOW = 30
