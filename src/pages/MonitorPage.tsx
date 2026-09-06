/**
 * Monitor — Figma frame 51:2 ("Preferred Visual Direction").
 *
 * Left: the watchlist table with search, alert-state filters and sorting.
 * Right: a persistent detail panel for the selected ticker, so the screen
 * answers "which ticker, and why" without a navigation step.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { deriveSignal, WINDOWS } from '../lib/scoring'
import type { DerivedSignal, WindowDays } from '../lib/scoring'
import type { Instrument } from '../types'
import {
  ALERT_LABEL,
  ALERT_RANK,
  ALERT_STATES,
  attentionMultiple,
  consensusLabel,
  coverageTier,
  formatMultiple,
  relatedEventContext,
  relatedEventLabel,
  sourcesFraction,
  toAlertState,
} from '../lib/attnshift'
import type { AlertState } from '../lib/attnshift'
import { dateTime, num, relativeTo } from '../lib/format'
import { AlertBadge, CoverageBadge, MonoLabel } from '../components/ui'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'

interface Row {
  instrument: Instrument
  signal: DerivedSignal
  state: AlertState
  multiple: number | null
}

type SortKey = 'attention' | 'ticker' | 'alert' | 'consensus' | 'coverage'

/** Stamped onto every signal opened from this screen, so the detail can name its way back. */
const OPENED_HERE = { state: { from: '/' } }

export function MonitorPage() {
  const { status, snapshot, error, reload, windowDays, setWindowDays, investigations, saveInvestigation } =
    useAppState()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [states, setStates] = useState<AlertState[]>([...ALERT_STATES])
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'attention', dir: 'desc' })
  const [selected, setSelected] = useState<string | null>(null)
  // The panel is dismissible, so "which row is selected" and "is the panel
  // showing" are two facts. Picking a row re-opens it — that is the way back
  // in, and it is the same gesture that filled the panel in the first place.
  const [panelOpen, setPanelOpen] = useState(true)

  const rows = useMemo<Row[]>(() => {
    if (!snapshot) return []
    return snapshot.instruments.map((instrument) => {
      const signal = deriveSignal(instrument, windowDays)
      return { instrument, signal, state: toAlertState(signal.state), multiple: attentionMultiple(signal) }
    })
  }, [snapshot, windowDays])

  const counts = useMemo(() => {
    const c: Record<AlertState, number> = { elevated: 0, watch: 0, stable: 0, insufficient: 0 }
    rows.forEach((r) => (c[r.state] += 1))
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = rows.filter((r) => {
      if (!states.includes(r.state)) return false
      if (flaggedOnly && !investigations[r.instrument.ticker]) return false
      if (!q) return true
      return (
        r.instrument.ticker.toLowerCase().includes(q) ||
        r.instrument.name.toLowerCase().includes(q) ||
        r.instrument.sector.toLowerCase().includes(q)
      )
    })

    const factor = sort.dir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      switch (sort.key) {
        case 'ticker':
          return a.instrument.ticker.localeCompare(b.instrument.ticker) * factor
        case 'alert':
          return (ALERT_RANK[a.state] - ALERT_RANK[b.state]) * factor
        case 'consensus':
          return (a.signal.consensusShare - b.signal.consensusShare) * factor
        case 'coverage':
          return (a.instrument.coverage.completeness - b.instrument.coverage.completeness) * factor
        default:
          return ((a.multiple ?? -1) - (b.multiple ?? -1)) * factor
      }
    })
  }, [rows, states, flaggedOnly, query, sort, investigations])

  if (status === 'loading') return <LoadingState />
  if (status === 'error' || !snapshot) return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />

  const toggleState = (s: AlertState) =>
    setStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const setSortKey = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))

  const sortMark = (key: SortKey) => (sort.key === key ? <span className="sort">{sort.dir === 'desc' ? '↓' : '↑'}</span> : null)

  const allOn = states.length === ALERT_STATES.length && !flaggedOnly
  const flaggedCount = rows.filter((r) => investigations[r.instrument.ticker]).length
  // derived, not stored: an explicit pick if it survived the filter, else the top row
  const selectedRow = filtered.find((r) => r.instrument.ticker === selected) ?? filtered[0] ?? null
  const pick = (ticker: string) => {
    setSelected(ticker)
    setPanelOpen(true)
  }

  const elevated = counts.elevated
  const watch = counts.watch
  const coverageReady = rows.filter((r) => r.instrument.coverage.completeness >= 0.5).length

  return (
    <div className="split">
      <section className="split__main">
        <div className="pagehead">
          <div className="pagehead__text">
            <h1>{num(rows.length)} tickers in watchlist</h1>
            <div className="pagehead__sub v-accent">Updated {dateTime(snapshot.generated_at)}</div>
          </div>
          <div className="pagehead__actions">
            <button type="button" className="linkbtn" onClick={() => navigate('/watchlist')}>
              Edit watchlist
            </button>
          </div>
        </div>

        <div style={{ marginTop: 4, marginBottom: 10 }}>
          <input
            className="input input--search"
            placeholder="Search ticker or company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search ticker or company"
          />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="filterbar">
            <button
              type="button"
              className={allOn ? 'is-on' : ''}
              onClick={() => {
                setStates([...ALERT_STATES])
                setFlaggedOnly(false)
              }}
            >
              All
            </button>
            {ALERT_STATES.map((s) => (
              <button key={s} type="button" className={states.includes(s) ? 'is-on' : ''} onClick={() => toggleState(s)}>
                {ALERT_LABEL[s]}
                <span className="filterbar__count">{counts[s]}</span>
              </button>
            ))}
            <button
              type="button"
              className={flaggedOnly ? 'is-on' : ''}
              onClick={() => setFlaggedOnly((v) => !v)}
              title="Show only tickers flagged for review in this workspace"
            >
              Flagged only
              <span className="filterbar__count">{flaggedCount}</span>
            </button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MonoLabel muted>Look-back</MonoLabel>
            <div className="segmented">
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={windowDays === w ? 'is-on' : ''}
                  onClick={() => setWindowDays(w as WindowDays)}
                >
                  {w}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          {filtered.length === 0 ? (
            <div className="panel">
              <EmptyState
                onReset={() => {
                  setQuery('')
                  setStates([...ALERT_STATES])
                  setFlaggedOnly(false)
                }}
              />
            </div>
          ) : (
            <>
              <div className="panel" style={{ borderBottom: 0 }}>
                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => setSortKey('ticker')}>
                          Ticker {sortMark('ticker')}
                        </th>
                        <th className="sortable" onClick={() => setSortKey('alert')}>
                          Attention alert {sortMark('alert')}
                        </th>
                        <th className="sortable" onClick={() => setSortKey('attention')}>
                          Attention vs {windowDays}d avg {sortMark('attention')}
                        </th>
                        <th className="sortable" onClick={() => setSortKey('consensus')}>
                          Directional consensus {sortMark('consensus')}
                        </th>
                        <th className="sortable" onClick={() => setSortKey('coverage')}>
                          Data coverage {sortMark('coverage')}
                        </th>
                        <th>Related event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => {
                        const isSelected = row.instrument.ticker === selectedRow?.instrument.ticker
                        return (
                          <tr
                            key={row.instrument.ticker}
                            tabIndex={0}
                            className={`is-clickable${isSelected ? ' is-selected' : ''}`}
                            onClick={() => pick(row.instrument.ticker)}
                            onDoubleClick={() => navigate(`/signal/${row.instrument.ticker}`, OPENED_HERE)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') navigate(`/signal/${row.instrument.ticker}`, OPENED_HERE)
                              if (e.key === ' ') {
                                e.preventDefault()
                                pick(row.instrument.ticker)
                              }
                            }}
                          >
                            <td>
                              <div className="tickercell__code">{row.instrument.ticker}</div>
                              <div className="tickercell__name">{row.instrument.name}</div>
                            </td>
                            <td>
                              <AlertBadge state={row.state} />
                            </td>
                            <td className={`cell-strong ${row.state === 'elevated' ? 'v-elevated' : ''}`}>
                              {formatMultiple(row.multiple)}
                            </td>
                            <td>
                              {row.state === 'insufficient' ? (
                                '—'
                              ) : (
                                <>
                                  <div>{consensusLabel(row.signal)}</div>
                                  <div className="cell-sub cell-muted">
                                    n={num(row.instrument.consensus.directional_mentions)} classified
                                  </div>
                                </>
                              )}
                            </td>
                            <td>
                              <CoverageBadge tier={coverageTier(row.instrument)} />
                            </td>
                            <td className="cell-muted">
                              <div>{relatedEventLabel(row.instrument)}</div>
                              <div
                                className={`cell-sub ${row.instrument.event_flag.present ? 'v-watch' : 'cell-muted'}`}
                              >
                                {relatedEventContext(row.instrument)}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="board">
                <div className="board__cell">
                  <MonoLabel>Board summary</MonoLabel>
                  <div className="board__value">{elevated + watch} active alerts</div>
                  <div className="board__note">
                    {elevated} elevated · {watch} watch
                  </div>
                </div>
                <div className="board__cell">
                  <MonoLabel>Coverage status</MonoLabel>
                  <div className="board__value">
                    {coverageReady} / {rows.length} complete
                  </div>
                  <div className="board__note">
                    {rows.length - coverageReady === 0
                      ? 'All tickers meet the coverage floor'
                      : `${rows.length - coverageReady} ticker${rows.length - coverageReady === 1 ? ' needs' : 's need'} more data`}
                  </div>
                </div>
                <div className="board__cell">
                  <MonoLabel>Latest ingest</MonoLabel>
                  <div className="board__value">{dateTime(snapshot.generated_at)}</div>
                  <div className="board__note">{snapshot.sources.length} source groups configured</div>
                </div>
              </div>

              <div className="addrow">
                <button type="button" className="linkbtn" onClick={() => navigate('/watchlist')}>
                  Add new ticker
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {panelOpen && (
        <SelectedPanel
          row={selectedRow}
          generatedAt={snapshot.generated_at}
          flagged={selectedRow ? !!investigations[selectedRow.instrument.ticker] : false}
          onClose={() => setPanelOpen(false)}
          onFlag={() => {
            if (!selectedRow) return
            saveInvestigation({
              ticker: selectedRow.instrument.ticker,
              note: 'Flagged from the monitor.',
              savedAt: new Date().toISOString(),
              stateAtSave: ALERT_LABEL[selectedRow.state],
              scoreAtSave: selectedRow.signal.score,
            })
          }}
          onOpen={() => selectedRow && navigate(`/signal/${selectedRow.instrument.ticker}`, OPENED_HERE)}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- panel -- */

function SelectedPanel({
  row,
  generatedAt,
  flagged,
  onClose,
  onFlag,
  onOpen,
}: {
  row: Row | null
  generatedAt: string
  flagged: boolean
  onClose: () => void
  onOpen: () => void
  onFlag: () => void
}) {
  const close = (
    <button type="button" className="selected__close" onClick={onClose} title="Close panel" aria-label="Close panel">
      ✕
    </button>
  )

  if (!row) {
    return (
      <aside className="selected">
        <div className="selected__bare">{close}</div>
        <div className="selected__empty">Select a ticker to see why it triggered.</div>
      </aside>
    )
  }

  const { instrument, signal, state, multiple } = row
  const tier = coverageTier(instrument)
  const raises = signal.drivers.filter((d) => d.effect === 'raises')
  const confounder = signal.drivers.find((d) => d.key === 'event' && d.effect === 'lowers')
  const mixColors = ['var(--mix-1)', 'var(--mix-2)', 'var(--mix-3)', 'var(--mix-4)']
  const topMix = [...instrument.source_mix].sort((a, b) => b.share - a.share)

  return (
    <aside className="selected">
      <div className="selected__head">
        <div className="selected__top">
          <div>
            <div className="selected__code">{instrument.ticker}</div>
            <div className="selected__name">{instrument.name}</div>
          </div>
          <div className="selected__actions">
            <AlertBadge state={state} variant="onblue" />
            {close}
          </div>
        </div>
        <div className="selected__stamp">
          Updated {relativeTo(instrument.last_updated, generatedAt)} · {instrument.sector}
        </div>
      </div>

      <div className="selected__body">
        <div>
          <MonoLabel>Why this triggered</MonoLabel>
          <ul className="selected__list">
            {(raises.length ? raises : signal.drivers).slice(0, 3).map((d) => (
              <li key={d.key}>{d.detail}</li>
            ))}
          </ul>
        </div>

        {confounder && (
          <div>
            <MonoLabel>Possible confounder</MonoLabel>
            <div className="panel__text panel__text--sm">{confounder.detail}</div>
          </div>
        )}

        <div className="defbox">
          <div className="defbox__cell">
            <div className="defbox__term">Attention vs {signal.windowDays}d avg</div>
            <div className="defbox__big">
              <em className={state === 'elevated' ? 'v-elevated' : 'v-accent'}>
                {multiple === null ? 'N/A' : multiple.toFixed(1)}
              </em>
              <span>{multiple === null ? '' : '× avg'}</span>
            </div>
          </div>
          <div className="defbox__cell">
            <div className="defbox__term">Consensus · n={num(instrument.consensus.directional_mentions)}</div>
            <div className="defbox__big">
              <em className="v-accent">{Math.round(signal.consensusShare * 100)}%</em>{' '}
              <span>{signal.direction}</span>
            </div>
          </div>

          <div className="defbox__cell defbox__cell--full">
            <div className="defbox__term">Source mix</div>
            <div style={{ marginTop: 6 }}>
              <div className="bar bar--xl" style={{ display: 'flex' }}>
                {topMix.map((s, i) => (
                  <span
                    key={s.source_id}
                    style={{ width: `${s.share * 100}%`, background: mixColors[i % mixColors.length] }}
                  />
                ))}
              </div>
            </div>
            <div className="defbox__lines">
              {topMix.map((s) => (
                <div key={s.source_id}>
                  {s.label} {Math.round(s.share * 100)}% · {num(s.mentions)} items
                </div>
              ))}
            </div>
          </div>

          <div className="defbox__cell defbox__cell--full">
            <div className="defbox__term">Related event</div>
            <div className="defbox__big">
              <em style={{ fontSize: 'var(--fs-19)' }}>{relatedEventLabel(instrument)}</em>
            </div>
            <div
              className="defbox__lines"
              style={{ fontWeight: 400, color: instrument.event_flag.present ? 'var(--watch)' : 'var(--text-muted)' }}
            >
              {relatedEventContext(instrument)}
            </div>
          </div>

          <div className="defbox__cell defbox__cell--full">
            <div className="defbox__term">Data coverage</div>
            <div className={`defbox__big v-${tier === 'high' ? 'stable' : tier === 'medium' ? 'watch' : 'muted'}`}>
              <em style={{ fontSize: 'var(--fs-19)' }}>{tier === 'high' ? 'High' : tier === 'medium' ? 'Medium' : 'Low'}</em>
            </div>
            <div className="defbox__lines" style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
              {num(signal.mentionsToday)} items · {sourcesFraction(instrument)} groups
            </div>
          </div>
        </div>

        <p className="limitnote">
          Public attention is a screening proxy—not institutional positioning or a trade recommendation.
        </p>

        <div className="selected__foot">
          <button type="button" className="btn-plain" onClick={onFlag} disabled={flagged}>
            {flagged ? 'Flagged' : 'Flag for review'}
          </button>
          <button type="button" className="btn btn--primary" style={{ marginLeft: 'auto' }} onClick={onOpen}>
            Open signal detail
          </button>
        </div>
      </div>
    </aside>
  )
}
