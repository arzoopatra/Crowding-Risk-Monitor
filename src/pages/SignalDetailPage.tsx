/**
 * Signal detail — Figma frame 68:2.
 *
 * Above the fold the screen answers the design's four questions: how far
 * attention moved, why it moved, what evidence sits behind it, and what the
 * signal cannot tell you. Below that the app's own explainability panels —
 * the score arithmetic and the event timeline — stay available, and the
 * historical-evidence view (frame 10:4) keeps its deep link.
 */
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { deriveSignal, WINDOWS } from '../lib/scoring'
import type { WindowDays } from '../lib/scoring'
import {
  ALERT_LABEL,
  age,
  attentionMultiple,
  attentionPercentile,
  coverageTier,
  dataStatusLabel,
  evidenceItems,
  formatMultiple,
  limitationsFor,
  relatedEventContext,
  relatedEventLabel,
  sourcesFraction,
  toAlertState,
} from '../lib/attnshift'
import type { HistoricalCase, Instrument, Snapshot } from '../types'
import { dateTime, longDate, num, ordinal, pct, signedPct, signedPts } from '../lib/format'
import { originOf, PageHeader } from '../components/Shell'
import { AlertBadge, Bar, BarRow, MonoLabel, Panel, PanelSection, Summary, SummaryCell } from '../components/ui'
import { AttentionTrend } from '../components/AttentionTrend'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'

const MIX_COLORS = ['var(--mix-1)', 'var(--mix-2)', 'var(--mix-3)', 'var(--mix-4)']

export function SignalDetailPage() {
  const { ticker = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Which list opened this signal. Popping is what returns you to that list
  // with its filters and scroll intact, where navigating to the route afresh
  // would reset them — but only a signal one of the lists pushed has a list
  // entry behind it to pop to. A cold deep link navigates instead. (The test
  // is the stamped origin rather than location.key, because switching tabs
  // below replaces the entry and hands it a fresh key.)
  const origin = originOf(location.state)
  const goBack = () => (origin.fromList ? navigate(-1) : navigate(origin.to))
  const { status, snapshot, error, reload, windowDays, setWindowDays, investigations, saveInvestigation } =
    useAppState()

  const tab = params.get('tab') === 'history' ? 'history' : 'detail'
  const [note, setNote] = useState('')

  const instrument = snapshot?.instruments.find((i) => i.ticker.toLowerCase() === ticker.toLowerCase()) ?? null
  const signal = useMemo(
    () => (instrument ? deriveSignal(instrument, windowDays) : null),
    [instrument, windowDays],
  )

  if (status === 'loading') return <LoadingState />
  if (status === 'error' || !snapshot) return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />
  if (!instrument || !signal) {
    return (
      <div className="page">
        <div className="panel">
          <EmptyState
            title={`No instrument called "${ticker}"`}
            body="The ticker is not in this snapshot. Return to the monitor to pick one from the watchlist."
            action={
              <button type="button" className="btn" onClick={() => navigate('/')}>
                Back to monitor
              </button>
            }
          />
        </div>
      </div>
    )
  }

  const state = toAlertState(signal.state)
  const multiple = attentionMultiple(signal)
  const tier = coverageTier(instrument)
  const flagged = investigations[instrument.ticker]
  const evidence = evidenceItems(instrument)
  const mix = [...instrument.source_mix].sort((a, b) => b.share - a.share)
  const eventDate = instrument.event_flag.present ? instrument.event_flag.date : undefined

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <button type="button" className="btn-back" onClick={goBack}>
            ← Back to {origin.label}
          </button>
        }
        title={`${instrument.ticker} — ${instrument.name}`}
        sub={`Public-attention signal detail · ${instrument.sector} · ${dataStatusLabel(snapshot)}`}
        stamp={`Updated ${dateTime(instrument.last_updated)}`}
        actions={
          <>
            <button type="button" className="btn btn--primary btn--sentence" onClick={() => navigate('/method')}>
              Method &amp; limitations
            </button>
            <AlertBadge state={state} variant={state === 'elevated' ? 'solid' : 'tint'} />
          </>
        }
      />

      <div className="tabs">
        <button
          type="button"
          className={tab === 'detail' ? 'is-active' : ''}
          onClick={() => setParams({}, { replace: true, state: location.state })}
        >
          Signal detail
        </button>
        <button
          type="button"
          className={tab === 'history' ? 'is-active' : ''}
          onClick={() => setParams({ tab: 'history' }, { replace: true, state: location.state })}
        >
          Historical evidence
        </button>
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

      {signal.thinWindow && (
        <div className="notice" style={{ marginBottom: 14 }}>
          Only {signal.baselineDays} sessions sit in this baseline. A short baseline makes the multiple unstable —
          read the {windowDays}d view as indicative and compare against 30d before acting on it.
        </div>
      )}

      {tab === 'detail' ? (
        <>
          <Summary tall>
            <SummaryCell
              label={`Attention vs ${windowDays}d avg`}
              value={formatMultiple(multiple)}
              note={`${ordinal(attentionPercentile(signal))} percentile in window`}
              tone={state === 'elevated' ? 'elevated' : state === 'watch' ? 'watch' : 'default'}
            />
            <SummaryCell
              label="Directional consensus"
              value={`${Math.round(signal.consensusShare * 100)}% ${signal.direction}`}
              note={`${num(instrument.consensus.directional_mentions)} classified items`}
              tone="accent"
            />
            <SummaryCell
              label="Data coverage"
              value={tier === 'high' ? 'High' : tier === 'medium' ? 'Medium' : 'Low'}
              note={`${sourcesFraction(instrument)} source groups`}
              tone={tier === 'high' ? 'stable' : tier === 'medium' ? 'watch' : 'muted'}
            />
            <SummaryCell
              label="Related event"
              value={relatedEventLabel(instrument)}
              note={relatedEventContext(instrument)}
              tone={instrument.event_flag.present ? 'watch' : 'default'}
            />
          </Summary>

          <div className="grid grid--detail" style={{ marginTop: 16 }}>
            <Panel
              label={`Attention trend · last ${signal.windowUsed} days`}
              sub="Relative public-attention volume"
              actions={<span className="trend__current">Current {formatMultiple(multiple)}</span>}
            >
              <AttentionTrend
                series={signal.windowSeries}
                baselineMean={signal.baselineMean}
                eventDate={eventDate}
                eventLabel={instrument.event_flag.type}
              />
            </Panel>

            <Panel flush>
              <PanelSection label="Why this changed">
                <ul className="bullets">
                  {signal.drivers.slice(0, 3).map((d) => (
                    <li key={d.key}>{d.detail}</li>
                  ))}
                </ul>
              </PanelSection>
              <PanelSection label={`Source mix · n=${num(signal.mentionsToday)}`}>
                <div style={{ marginTop: 8 }}>
                  {mix.map((s, i) => (
                    <BarRow
                      key={s.source_id}
                      label={s.label}
                      value={s.share}
                      max={1}
                      display={pct(s.share)}
                      color={MIX_COLORS[i % MIX_COLORS.length]}
                    />
                  ))}
                </div>
              </PanelSection>
            </Panel>
          </div>

          <div className="grid grid--detail" style={{ marginTop: 16 }}>
            <Panel
              label="Evidence items"
              sub={`${evidence.length} related event${evidence.length === 1 ? '' : 's'} · most recent first`}
              flush
            >
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Observed change</th>
                      <th>Context</th>
                      <th>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.map((item, i) => (
                      <tr key={`${item.date}-${i}`}>
                        <td className="cell-strong">{item.source}</td>
                        <td>{item.observed}</td>
                        <td className={item.confounder ? 'v-watch cell-strong' : 'v-accent cell-strong'}>
                          {item.context}
                        </td>
                        <td className="cell-time">{age(item.date, snapshot.generated_at)}</td>
                      </tr>
                    ))}
                    {evidence.length === 0 && (
                      <tr>
                        <td colSpan={4} className="cell-muted">
                          No related events were recorded in this window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel flush>
              <PanelSection label="Interpretation">
                <div className="panel__text">{signal.stateReason}</div>
              </PanelSection>
              <PanelSection label="Limit">
                <div className="panel__text panel__text--sm">
                  The signal cannot identify who is positioned or whether the attention shift will persist.
                </div>
                {limitationsFor(instrument).length > 0 && (
                  <ul className="bullets">
                    {limitationsFor(instrument).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
              </PanelSection>
              <PanelSection label="Next checks">
                <ol className="checklist">
                  <li>
                    <span className="checklist__n">1</span> Review the {evidence.length} source item
                    {evidence.length === 1 ? '' : 's'} behind the change
                  </li>
                  <li>
                    <span className="checklist__n">2</span> Compare against price and volume outside this tool
                  </li>
                  <li>
                    <span className="checklist__n">3</span>{' '}
                    {instrument.event_flag.present
                      ? `Check the ${instrument.event_flag.label} event window`
                      : 'Confirm no unrecorded event explains the move'}
                  </li>
                </ol>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  style={{ marginTop: 14 }}
                  onClick={() => navigate('/method')}
                >
                  Method &amp; limitations
                </button>
              </PanelSection>
            </Panel>
          </div>

          <div style={{ marginTop: 16 }}>
            <Panel label="Score breakdown" sub={`Every term of the ${windowDays}-day proxy score, shown in full`}>
              <div>
                {signal.components.map((c) => (
                  <div className="brow" key={c.key}>
                    <div>
                      <div className="brow__label">{c.label}</div>
                      <div className="brow__cap">max {c.max} pts</div>
                    </div>
                    <div>
                      <div className="brow__detail">{c.detail}</div>
                      <div className="brow__formula">{c.formula}</div>
                      <div style={{ marginTop: 6 }}>
                        <Bar value={c.points} max={c.max} />
                      </div>
                    </div>
                    <div className="brow__pts">{c.points.toFixed(1)}</div>
                  </div>
                ))}
                {signal.adjustments.map((a) => (
                  <div className="brow" key={a.key}>
                    <div>
                      <div className="brow__label">{a.label}</div>
                    </div>
                    <div className="brow__detail">{a.detail}</div>
                    <div className="brow__pts brow__pts--neg">{signedPts(a.points)}</div>
                  </div>
                ))}
                <div className="btotal">
                  <div className="brow__label">Proxy score · {ALERT_LABEL[state]}</div>
                  <div className="brow__detail">{signal.stateReason}</div>
                  <div className="btotal__pts">{signal.score.toFixed(0)}</div>
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid grid--detail" style={{ marginTop: 16 }}>
            <Panel label="Event timeline" sub="Public events recorded inside the window">
              <div className="events">
                {instrument.related_events.map((e, i) => (
                  <div className="event" key={`${e.date}-${i}`}>
                    <div className="event__date">{longDate(e.date)}</div>
                    <div>
                      <div className="event__headline">{e.headline}</div>
                      <div className="event__meta">
                        <span>{e.source}</span>
                        <span>·</span>
                        <span>{e.label}</span>
                        <span>·</span>
                        <span className={e.confounder ? 'v-watch' : ''}>
                          {e.confounder ? 'coincided · possible confounder' : 'coincided with the change'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {instrument.related_events.length === 0 && (
                  <div className="cell-muted">No events recorded in this window.</div>
                )}
              </div>
            </Panel>

            <Panel label="Research note" sub="Stored in this browser only">
              {flagged ? (
                <>
                  <div className="panel__text panel__text--sm">{flagged.note}</div>
                  <div className="panel__note">
                    Flagged {dateTime(flagged.savedAt)} · state at save: {flagged.stateAtSave} ·{' '}
                    score {flagged.scoreAtSave.toFixed(0)}
                  </div>
                </>
              ) : (
                <>
                  <textarea
                    className="textarea"
                    placeholder="What would you check next?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    aria-label="Research note"
                  />
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    style={{ marginTop: 10 }}
                    disabled={!note.trim()}
                    onClick={() =>
                      saveInvestigation({
                        ticker: instrument.ticker,
                        note: note.trim(),
                        savedAt: new Date().toISOString(),
                        stateAtSave: ALERT_LABEL[state],
                        scoreAtSave: signal.score,
                      })
                    }
                  >
                    Investigate further
                  </button>
                </>
              )}
            </Panel>
          </div>
        </>
      ) : (
        <HistoricalEvidenceView instrument={instrument} snapshot={snapshot} />
      )}
    </div>
  )
}

/* ------------------------------------------------- historical evidence -- */
/** Modelled on Figma frame 10:4 ("Historical Evidence"). */
function HistoricalEvidenceView({ instrument, snapshot }: { instrument: Instrument; snapshot: Snapshot }) {
  const h = instrument.historical
  const cases: HistoricalCase[] = [...h.supporting_cases, ...h.counterexamples].sort((a, b) =>
    a.date < b.date ? 1 : -1,
  )

  return (
    <>
      <div className="notice" style={{ marginBottom: 16 }}>
        <strong>Small-sample exploratory results.</strong> These observed outcomes do not establish prediction or
        causation. Directional reversals remain visible in the same cohort.
      </div>

      <Summary tall>
        <SummaryCell
          label="Sample size"
          value={`${h.sample_size} periods`}
          note={`${longDate(h.date_range.start)} – ${longDate(h.date_range.end)}`}
        />
        <SummaryCell
          label="Alert cohort · 5d mean"
          value={signedPct(h.high_signal_mean_pct.d5, 1)}
          note="mean move after an alert"
          tone={h.high_signal_mean_pct.d5 >= 0 ? 'stable' : 'elevated'}
        />
        <SummaryCell
          label="Ordinary cohort · 5d mean"
          value={signedPct(h.ordinary_mean_pct.d5, 1)}
          note="mean move on ordinary days"
          tone="muted"
        />
        <SummaryCell label="Data status" value={dataStatusLabel(snapshot)} note={h.definition} />
      </Summary>

      <div style={{ marginTop: 16 }}>
        <Panel label="Observed periods" sub="Sorted by most recent · outcome describes direction after the alert" flush>
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Context</th>
                  <th>Attention</th>
                  <th>Consensus</th>
                  <th>5-day move</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-time">{longDate(c.date)}</td>
                    <td>{c.event_flagged ? 'Event in window' : 'No flagged event'}</td>
                    <td className="cell-mono">{c.attention_z.toFixed(1)}σ</td>
                    <td>{pct(c.consensus_share)}</td>
                    <td className={`cell-mono ${c.forward_5d_pct >= 0 ? 'v-stable' : 'v-elevated'}`}>
                      {signedPct(c.forward_5d_pct, 1)}
                    </td>
                    <td>
                      <span
                        className={`coverage coverage--${
                          c.outcome === 'continuation' ? 'high' : c.outcome === 'weakening' ? 'medium' : 'low'
                        }`}
                      >
                        {c.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid grid--detail" style={{ marginTop: 16 }}>
        <Panel label="Outcome split" sub={`Across ${h.sample_size} observed periods`}>
          <div style={{ marginTop: 6 }}>
            <BarRow
              wide
              label="Continuation"
              value={h.outcome_split.continuation}
              max={h.sample_size}
              display={h.outcome_split.continuation}
              color="var(--stable)"
            />
            <BarRow
              wide
              label="Weakening"
              value={h.outcome_split.weakening}
              max={h.sample_size}
              display={h.outcome_split.weakening}
              color="var(--watch)"
            />
            <BarRow
              wide
              label="Reversal"
              value={h.outcome_split.reversal}
              max={h.sample_size}
              display={h.outcome_split.reversal}
              color="var(--elevated)"
            />
          </div>
          <div className="panel__note">
            {pct(h.event_flagged_share)} of these periods coincided with a public company or market event.
            Coincidence is shown as context and is not treated as evidence of causation.
          </div>
        </Panel>

        <Panel label="Cohort means" sub="Alert days against ordinary days">
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th className="col-right">1d</th>
                  <th className="col-right">3d</th>
                  <th className="col-right">5d</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cell-strong">Alert</td>
                  <td className="col-right cell-mono">{signedPct(h.high_signal_mean_pct.d1, 1)}</td>
                  <td className="col-right cell-mono">{signedPct(h.high_signal_mean_pct.d3, 1)}</td>
                  <td className="col-right cell-mono">{signedPct(h.high_signal_mean_pct.d5, 1)}</td>
                </tr>
                <tr>
                  <td className="cell-strong">Ordinary</td>
                  <td className="col-right cell-mono">{signedPct(h.ordinary_mean_pct.d1, 1)}</td>
                  <td className="col-right cell-mono">{signedPct(h.ordinary_mean_pct.d3, 1)}</td>
                  <td className="col-right cell-mono">{signedPct(h.ordinary_mean_pct.d5, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel label="Cases" sub="Supporting periods and counterexamples, side by side">
          <div className="cases">
            {h.supporting_cases.map((c) => (
              <CaseCard key={c.id} c={c} kind="support" />
            ))}
            {h.counterexamples.map((c) => (
              <CaseCard key={c.id} c={c} kind="counter" />
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}

function CaseCard({ c, kind }: { c: HistoricalCase; kind: 'support' | 'counter' }) {
  return (
    <div className={`case case--${kind}`}>
      <div className="case__top">
        <span className="case__date">{longDate(c.date)}</span>
        <span className="case__id">{c.id}</span>
      </div>
      <div className="case__stats">
        <span>attention {c.attention_z.toFixed(1)}σ</span>
        <span>consensus {pct(c.consensus_share)}</span>
        <span className={c.forward_5d_pct >= 0 ? 'v-stable' : 'v-elevated'}>5d {signedPct(c.forward_5d_pct, 1)}</span>
      </div>
      <div className="case__note">{c.note}</div>
    </div>
  )
}
