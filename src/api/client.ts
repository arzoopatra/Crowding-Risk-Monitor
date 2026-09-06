/**
 * Single integration point with the Backend member's export.
 *
 * Default: the bundled demo snapshot (src/data/snapshot.json) — no network,
 * so the demo cannot fail on stage.
 *
 * To read from the prototype API instead, set VITE_API_BASE in .env.local:
 *   VITE_API_BASE=http://localhost:8787
 * The frontend then GETs `${VITE_API_BASE}/api/snapshot` and expects exactly
 * the shape in src/types.ts. Nothing else in the app changes — the screens
 * cannot tell the two apart, except that the served payload names itself as
 * API-served in `data_status`, which they display.
 *
 * Leaving the variable unset is the demo default and makes no network call.
 */
import snapshotJson from '../data/snapshot.json'
import type { Snapshot } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE as string | undefined

/** Small delay so loading and error states are real, not decorative. */
const MOCK_LATENCY_MS = 260

export const dataSourceLabel = API_BASE ? `Prototype API · ${API_BASE}` : 'Bundled demo snapshot'

export async function loadSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE.replace(/\/$/, '')}/api/snapshot`, { signal })
    if (!res.ok) throw new Error(`Prototype API returned HTTP ${res.status}`)
    return (await res.json()) as Snapshot
  }
  await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS))
  return snapshotJson as unknown as Snapshot
}
