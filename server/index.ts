/**
 * The prototype API.
 *
 * One Node process, no framework, no database, no network calls of its own: it
 * reads two saved files from disk and answers four routes.
 *
 *   GET /api/health          liveness plus what the process actually loaded
 *   GET /api/signals         every instrument, calculated at request time
 *   GET /api/signals/:ticker one instrument (the demo uses NVX)
 *   GET /api/snapshot        the full data contract the interface already reads
 *
 * The first three are calculated from server/data/fixture.json by
 * server/signals.ts. The fourth serves src/data/snapshot.json — the same file
 * the interface bundles — over HTTP, so the running app can take its data from
 * this process instead of from its own bundle. Its `data_status` is stamped on
 * the way out, which is what the screens display as their provenance line.
 *
 *   node server/index.ts        (PORT=8787 by default)
 */
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { buildSignal, buildSignals, methodBlock } from './signals.ts'
import type { Fixture } from './signals.ts'

const FIXTURE_URL = new URL('./data/fixture.json', import.meta.url)
const SNAPSHOT_URL = new URL('../src/data/snapshot.json', import.meta.url)

/** What the interface shows as its provenance line while the API is serving it. */
export const API_DATA_STATUS = 'Illustrative fixture · served by the prototype API'

const readJson = <T>(url: URL): T => JSON.parse(readFileSync(url, 'utf8')) as T

/** Read per request: editing the fixture and reloading the page is the point. */
const loadFixture = () => readJson<Fixture>(FIXTURE_URL)

function meta(fixture: Fixture) {
  return {
    dataset: fixture.dataset,
    fixture_version: fixture.fixture_version,
    generated_at: fixture.generated_at,
    generated_from: fixture.generated_from,
    as_of: fixture.as_of,
    is_illustrative: fixture.is_illustrative,
    disclaimer: fixture.disclaimer,
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    // the interface runs on the Vite dev origin, this process on another port
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  })
  res.end(json)
}

export function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
    })
    res.end()
    return
  }

  if (req.method !== 'GET') {
    send(res, 405, { error: 'method_not_allowed', detail: 'This prototype API is read-only.' })
    return
  }

  if (path === '/api/health') {
    const fixture = loadFixture()
    send(res, 200, {
      status: 'ok',
      service: 'crowding-risk-monitor prototype API',
      time: new Date().toISOString(),
      fixture: {
        loaded: true,
        ...meta(fixture),
        instruments: fixture.instruments.length,
        window_sessions: fixture.window_sessions,
      },
      endpoints: ['/api/health', '/api/signals', '/api/signals/:ticker', '/api/snapshot'],
    })
    return
  }

  if (path === '/api/signals') {
    const fixture = loadFixture()
    const signals = buildSignals(fixture)
    send(res, 200, {
      ...meta(fixture),
      method: methodBlock(fixture),
      count: signals.length,
      signals,
    })
    return
  }

  const match = /^\/api\/signals\/([A-Za-z0-9.-]+)$/.exec(path)
  if (match) {
    const fixture = loadFixture()
    const ticker = decodeURIComponent(match[1]).toUpperCase()
    const instrument = fixture.instruments.find((i) => i.ticker === ticker)
    if (!instrument) {
      send(res, 404, {
        error: 'unknown_ticker',
        ticker,
        detail: 'This fixture carries a fixed set of illustrative instruments.',
        available: fixture.instruments.map((i) => i.ticker),
      })
      return
    }
    send(res, 200, {
      ...meta(fixture),
      method: methodBlock(fixture),
      signal: buildSignal(instrument, fixture.sources_expected.length),
    })
    return
  }

  if (path === '/api/snapshot') {
    // The interface's own contract (src/types.ts), served over HTTP rather than
    // bundled. Only the provenance line is rewritten; no measurement is touched.
    const snapshot = readJson<Record<string, unknown>>(SNAPSHOT_URL)
    send(res, 200, { ...snapshot, data_status: API_DATA_STATUS, served_by: 'prototype API' })
    return
  }

  send(res, 404, {
    error: 'not_found',
    path,
    endpoints: ['/api/health', '/api/signals', '/api/signals/:ticker', '/api/snapshot'],
  })
}

export function createApiServer(): Server {
  return createServer((req, res) => {
    const started = Date.now()
    res.on('finish', () => {
      console.log(`${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started}ms)`)
    })
    try {
      handle(req, res)
    } catch (err) {
      console.error('request failed:', err)
      send(res, 500, { error: 'server_error', detail: err instanceof Error ? err.message : 'unknown' })
    }
  })
}

// Only listen when started directly, so the tests can bind their own port.
if (import.meta.filename === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8787)
  createApiServer().listen(port, () => {
    console.log(`prototype API on http://localhost:${port}`)
    console.log('  GET /api/health')
    console.log('  GET /api/signals')
    console.log('  GET /api/signals/NVX')
    console.log('  GET /api/snapshot   (the interface reads this one)')
  })
}
