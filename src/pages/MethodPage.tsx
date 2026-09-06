/**
 * Method & Limitations — Figma frame 74:2 ("Data & Methodology").
 *
 * The screen the sidebar footer and every "Method & limitations" button lead to:
 * what the signal is, how it is built, what the coverage labels mean, and what
 * the product explicitly does not claim.
 *
 * Below the designed fold the app keeps the parts that make the claim checkable
 * — the definitions, the full arithmetic, and the known confounders.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { CAPS, PENALTIES, THRESHOLDS, WEIGHTS } from '../lib/scoring'
import { COVERAGE_LABEL, PRODUCT_VERSION } from '../lib/attnshift'
import { dateTime, longDate } from '../lib/format'
import { PageHeader } from '../components/Shell'
import { MonoLabel, Panel, PanelSection } from '../components/ui'
import { ErrorState, LoadingState } from '../components/StateViews'

const PIPELINE = [
  { step: 'Public sources', lines: ['Financial media', 'Social discussion', 'News wires'] },
  { step: 'Classify', lines: ['Attention volume', 'Directional language', 'Source group'] },
  { step: 'Compare', lines: ["Against the ticker's", 'baseline', 'and prior cycles'] },
  { step: 'Surface', lines: ['Alert state', 'Coverage label', 'Reasons and context'], surface: true },
]

const MEASURES = [
  'Relative public-attention intensity',
  'Directional language in classified items',
  'Cross-source coverage and composition',
  'Coinciding public events for context',
]

const NOT_MEASURES = [
  'Institutional holdings or positioning',
  'True trade crowding',
  'Future return, risk or liquidity',
  'Causal effect of a related event',
]

const COVERAGE_ROWS = [
  {
    tier: 'high' as const,
    meaning: 'All configured source groups returned usable items.',
    behaviour: 'Show signal and full source mix.',
  },
  {
    tier: 'medium' as const,
    meaning: 'One or more groups returned partial usable coverage.',
    behaviour: 'Show signal with a coverage caution.',
  },
  {
    tier: 'low' as const,
    meaning: 'Available items are insufficient for interpretation.',
    behaviour: 'Suppress consensus and mark insufficient.',
  },
]

export function MethodPage() {
  const { status, snapshot, error, reload } = useAppState()
  const navigate = useNavigate()
  // react-router stamps the first entry of a session 'default', so this is
  // "did another screen send me here" rather than "is there browser history"
  const cameFromAScreen = useLocation().key !== 'default'

  if (status === 'loading') return <LoadingState />
  if (status === 'error' || !snapshot) return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />

  const baseline = snapshot.baseline_window_days
  const pipeline = PIPELINE.map((s) =>
    s.step === 'Compare' ? { ...s, lines: ["Against the ticker's", `${baseline}-day baseline`, 'and prior cycles'] } : s,
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <button
            type="button"
            className="btn-back"
            onClick={() => (cameFromAScreen ? navigate(-1) : navigate('/'))}
          >
            ← {cameFromAScreen ? 'Back' : 'Back to monitor'}
          </button>
        }
        title="Method &amp; Limitations"
        actions={
          <button type="button" className="btn btn--primary btn--sentence" onClick={() => navigate('/')}>
            Back to monitor
          </button>
        }
      />

      <div className="callout">
        <div className="callout__body">
          <MonoLabel>Exploratory proxy</MonoLabel>
          <p className="callout__statement">
            AttnShift highlights unusual changes in public attention so a researcher can decide what to investigate
            next.
          </p>
        </div>
        <p className="callout__caveat">
          It does not measure institutional holdings and does not provide a trading recommendation.
        </p>
      </div>

      <div className="grid grid--detail" style={{ marginTop: 16 }}>
        <div className="stack">
          <Panel
            label="How the signal is built"
            sub="Conceptual workflow; implementation rules remain under validation."
          >
            <div className="pipeline">
              {pipeline.map((stage, i) => (
                <div key={stage.step} style={{ display: 'contents' }}>
                  {i > 0 && (
                    <div className="pipeline__link" aria-hidden>
                      <i />
                    </div>
                  )}
                  <div className={stage.surface ? 'stage stage--surface' : 'stage'}>
                    <div className="stage__step">
                      {i + 1}&nbsp;&nbsp;{stage.step}
                    </div>
                    <div className="stage__lines">
                      {stage.lines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="outputrow">
              <MonoLabel>Product output</MonoLabel>
              <div className="outputrow__value">
                Attention multiple · directional consensus with sample count · coverage · source mix · possible
                related event
              </div>
            </div>
          </Panel>

          <Panel
            label="Coverage labels"
            sub="Coverage describes data availability, not predictive certainty."
            flush
          >
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Operational meaning</th>
                    <th>Product behaviour</th>
                  </tr>
                </thead>
                <tbody>
                  {COVERAGE_ROWS.map((row) => (
                    <tr key={row.tier}>
                      <td>
                        <span className={`cell-ticker alerttext--${row.tier === 'high' ? 'stable' : row.tier === 'medium' ? 'watch' : 'insufficient'}`}>
                          {COVERAGE_LABEL[row.tier]}
                        </span>
                      </td>
                      <td>{row.meaning}</td>
                      <td>{row.behaviour}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel flush>
          <PanelSection label="What it measures">
            <ul className="bullets">
              {MEASURES.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </PanelSection>

          <PanelSection label="What it does not measure">
            <ul className="bullets">
              {NOT_MEASURES.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </PanelSection>

          <PanelSection label="Known limitations">
            <p className="panel__text panel__text--sm">
              Public sources can be noisy, duplicated or uneven across tickers. Directional classification may miss
              nuance. A {baseline}-day baseline can be unstable around major events.
            </p>
          </PanelSection>

          <PanelSection label="Validation status">
            <p className="panel__text panel__text--sm">
              {snapshot.is_synthetic
                ? 'Prototype workflow tested with illustrative interface data. User survey distribution and longitudinal signal checks remain future work.'
                : 'Running against a backend export. User survey distribution and longitudinal signal checks remain future work.'}
            </p>
            <p className="panel__note" style={{ fontFamily: 'var(--mono)' }}>
              Version {PRODUCT_VERSION} · schema v{snapshot.schema_version} · updated{' '}
              {longDate(snapshot.generated_at)}
            </p>
          </PanelSection>
        </Panel>
      </div>

      {/* --------- the checkable detail the designed screen summarises --------- */}

      <div className="stack" style={{ marginTop: 16, maxWidth: 980 }}>
        {snapshot.is_synthetic && (
          <div className="notice">
            <strong>Demonstration snapshot.</strong> {snapshot.disclaimer} The interface, the calculation and the
            limitation language are the parts under test here — not the numbers.
          </div>
        )}

        <Panel label="Definitions">
          <dl className="deflist" style={{ marginTop: 8 }}>
            <dt>Attention</dt>
            <dd>
              The number of relevant mentions of an instrument in one session, counted across the configured public
              sources.
            </dd>
            <dt>Attention vs baseline</dt>
            <dd>
              The latest session against the mean of the look-back window. The screens show it as a multiple ("3.1×
              avg"); the score uses the z-score against the window's standard deviation.
            </dd>
            <dt>Directional consensus</dt>
            <dd>
              The share of directional mentions pointing the same way. 50% is an even split; it is a measure of
              agreement, not of conviction, volume or accuracy.
            </dd>
            <dt>Public attention proxy</dt>
            <dd>
              A documented combination of unusually high attention, one-sided discussion and persistence, discounted
              for missing sources and for events that could explain the change on their own.
            </dd>
            <dt>Historical association</dt>
            <dd>
              What happened after comparable historical sessions on the same measures. An association on a small
              sample. Not a prediction and not a causal claim.
            </dd>
          </dl>
        </Panel>

        <Panel label="Data sources and coverage">
          <dl className="deflist" style={{ marginTop: 8 }}>
            {snapshot.sources.map((s) => (
              <div key={s.id} style={{ display: 'contents' }}>
                <dt>{s.label}</dt>
                <dd>{s.note}</dd>
              </div>
            ))}
          </dl>
          <p className="panel__note">
            Data window {longDate(snapshot.data_window.start)} – {longDate(snapshot.data_window.end)}. Default
            baseline {baseline} sessions. Platforms cover different user populations, so the source mix is shown on
            every signal rather than merged into one number. Where an instrument falls below{' '}
            {THRESHOLDS.minCoverage * 100}% coverage, the monitor states <strong>Insufficient data</strong> instead
            of an alert state. Snapshot generated {dateTime(snapshot.generated_at)}.
          </p>
        </Panel>

        <Panel label="The calculation, in full" sub="No model, no hidden weights">
          <div className="formula" style={{ marginTop: 8 }}>{`attention   = min(z / ${CAPS.attentionZ}, 1)                     × ${WEIGHTS.attention}
consensus   = min((share − 0.50) / ${(CAPS.consensusShare - 0.5).toFixed(2)}, 1)        × ${WEIGHTS.consensus}
persistence = min(sessions_above_2σ / ${CAPS.persistenceDays}, 1)        × ${WEIGHTS.persistence}

raw         = attention + consensus + persistence

− coverage penalty   = (1 − coverage) × ${PENALTIES.incompleteCoverage}
− event discount     = ${PENALTIES.eventConfounder} if a confounding event sits in the window

score       = clamp(raw − penalties, 0, 100)

state       = Elevated  if score ≥ ${THRESHOLDS.elevated}
              Watch     if score ≥ ${THRESHOLDS.watch}
              Stable    otherwise
              Insufficient data if coverage < ${THRESHOLDS.minCoverage * 100}%`}</div>
          <p className="panel__note">
            The weights are a stated editorial choice, not an estimated model: attention carries the most because
            unusual volume is the most reliably measured input, and persistence carries the least because a short
            window can only observe a few sessions of it. Changing the look-back window changes the baseline and
            therefore the score — the screens recompute rather than re-labelling.
          </p>
        </Panel>

        <Panel label="Known gaps and confounders">
          <div className="prose" style={{ marginTop: 8 }}>
            <ul>
              <li>
                <strong>News moves both attention and price.</strong> A scheduled result or disclosure can produce
                the whole signal, so events in the window are flagged and discounted by {PENALTIES.eventConfounder}{' '}
                points rather than left invisible.
              </li>
              <li>
                <strong>Platform composition is not the market.</strong> A forum-led spike measures a retail-heavy
                population; a wire-led spike measures editorial attention. Neither measures positioning.
              </li>
              <li>
                <strong>Sentiment classification is imperfect.</strong> Sarcasm, hedging and mixed posts are misread
                by any classifier, so agreement should be read as approximate.
              </li>
              <li>
                <strong>Coverage is uneven across the universe.</strong> Thinly covered instruments produce unstable
                z-scores, which is why a coverage floor exists.
              </li>
              <li>
                <strong>Small historical samples.</strong> Historical panels run to tens of sessions, not thousands.
                No significance is claimed and counterexamples are always shown alongside supporting cases.
              </li>
              <li>
                <strong>Survivorship and look-ahead in any backtest.</strong> The historical view is illustrative of
                association only, and was not built as a tradable backtest.
              </li>
            </ul>
          </div>
        </Panel>

        <Panel label="What confirming actual crowding would require">
          <div className="prose" style={{ marginTop: 8 }}>
            <p>
              Professional crowding measurement uses data this product does not have: institutional holdings and
              positioning, short interest and borrow, factor exposure, order flow and liquidity. Those measures
              observe who holds what. This product observes who is talking, and how one-sidedly.
            </p>
            <p>
              That boundary is the product, not a shortcoming to be worked around. The screen is designed to answer
              one question — <em>is public attention or directional agreement changing unusually quickly?</em> — and
              to hand the researcher an explicit list of what to check next with better data.
            </p>
          </div>
        </Panel>

        <div className="notice notice--neutral">
          <strong>Not investment advice.</strong> This is a research screening prototype. It does not detect
          institutional crowding, confirm alpha decay, predict prices or recommend positions, and nothing in it
          should be used as the basis of a trading decision.
        </div>
      </div>
    </div>
  )
}
