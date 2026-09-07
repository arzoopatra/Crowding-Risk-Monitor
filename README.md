# AttnShift — Public Attention Monitor

An explainable public-attention screen for resource-constrained quant researchers.
Built for Code by Groww

The interface is a direct port of the **AttnShift** frames in
[the Figma file](https://www.figma.com/design/TckDMOdoirIwUmFY1miIaD/Public-Crowding-Risk-Monitor)
— the direction the file marks as preferred. Design tokens, spacing and type live in
[`src/index.css`](src/index.css); every value there is the Figma value.

> The product answers one question: **is public attention or directional agreement around
> an idea changing unusually quickly?** It does not detect institutional crowding, confirm
> alpha decay, predict prices or recommend positions.

## Run it

**Live: <https://arzoopatra.github.io/Crowding-Risk-Monitor/>** — nothing to install, opens on any
device. Deployed from `main` on every push by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

```bash
npm install
npm run dev        # http://localhost:5173/crowding-risk-monitor/
```

Desktop, 1440 px wide. No login, and no backend required — the snapshot is bundled. (A prototype
API is available for the data path; see [Backend integration](#backend-integration).) The one network call is
Google Fonts (Inter / DM Mono / Space Grotesk, linked from `index.html`); offline the page falls
back to system faces and the layout holds, but the typography is not the Figma typography. Self-host
the three families if the demo has to run without a connection.

```bash
npm run build && npm run preview   # what you should record the demo against
```

## What is built

| Route | Screen | Figma frame |
|---|---|---|
| `#/` | **Monitor** — watchlist table, filters, pinned detail panel | `51:2` |
| `#/signal/:ticker` | **Signal Detail** — trend, why-this-changed, evidence, interpretation, score breakdown | `68:2` |
| `#/signal/:ticker?tab=history` | **Historical Evidence** — cohort comparison, supporting cases, counterexamples | `10:4` |
| `#/alerts` | **Alert History** — cross-ticker change log, filters, change summary, CSV export | `68:36` |
| `#/watchlist` | **Watchlist** — monitoring universe, coverage readiness, board settings | `68:70` |
| `#/method` | **Method & Limitations** — proxy statement, signal pipeline, coverage labels, limits | `74:2` |

The signal and its historical evidence share a route as two tabs, because a researcher moves
between them constantly. The history tab is deep-linkable (`?tab=history`).

Navigation between the three explanation screens closes: **Method & limitations** sits in the
signal header, so it is reachable from the detail tab and the history tab alike; the method screen
carries a **← Back** crumb that returns to whichever screen sent you, and a **Back to monitor**
action for when it was opened cold; and the signal header's crumb goes straight back to the
monitor. No screen is a dead end.

### Monitor
Ticker, attention alert, attention as a multiple of the baseline, directional consensus, data
coverage and the related event. Filters: **search** (ticker, company or sector), **alert state**
buttons with live counts, **flagged-only**, and the **look-back window** (7 / 30 / 90 sessions).
Every column header sorts. Selecting a row fills the pinned right-hand panel — why it triggered,
the possible confounder, the headline measures and the source mix — so the screen answers
"which ticker, and why" without a navigation step.

Selecting a row is the demo: one component and one template, filled from the selected ticker's
data — there is no per-ticker page anywhere in the app.

The look-back window is not a display setting. It sets the baseline every reading is compared
against, so the multiple, the score and the ranking genuinely recompute — ORBX scores 67 at 7
sessions, 88 at 30 and 92 at 90. The window opens on whatever `baseline_window_days` the export
declares (30 here), so the headline reading is *attention against the 30-day average*.

Every consensus figure carries its sample: the table shows `61% bullish · n=369 classified`, and
the percentage is never published without the count behind it.

The related-event column states the event and how it relates — *coincided with the change*, or
*coincided · possible confounder* when the event could account for the change on its own. Nothing
in the product says an event produced a signal.

### Signal Detail
The four headline measures, an **attention trend** chart drawn as multiples of the baseline
(tinted through the alert thresholds, with any confounding event marked on the axis),
**why this changed**, the **source mix**, an **evidence items** table built from the recorded
events, and an **interpretation / limit / next checks** panel. Below the fold the app's own
explainability panels stay available: the **full score breakdown** with the arithmetic for every
term, the event timeline, and the **Investigate further** research note, which flags the idea
back on the monitor.

### Alert History
The change log is not stored anywhere. It is derived by replaying `deriveSignal` across the tail
of every series, so a row here always matches what the monitor would have shown that day. An
event counts as *coinciding* when it falls within three days of the change — shown as context,
never as cause. The visible rows export to CSV.

### Watchlist
The monitoring universe comes from the snapshot, so the design's "add a ticker" affordance is
wired to the capability this prototype actually has: **tracking** a ticker into the local
workspace, which the monitor can then filter on.

### Method & Limitations
Leads with the exploratory-proxy statement and its caveat, then the four-stage signal pipeline,
the coverage-label table, and the what-it-measures / what-it-does-not-measure / limitations /
validation column. Below that the page keeps the parts that make the claim checkable: the
definitions, the **full arithmetic**, and the known confounders. The sidebar footer is one entry
point and lights up on this route; the signal header is the other.

The prototype version (`PRODUCT_VERSION` in `src/lib/attnshift.ts`) is deliberately separate
from `snapshot.schema_version` — one versions the product, the other the data contract.

## The Calculation

No model, no hidden weights. All of it lives in [`src/lib/scoring.ts`](src/lib/scoring.ts) and
all of it is rendered on screen:

```
attention   = min(z / 6, 1)                        × 45
consensus   = min((share − 0.50) / 0.35, 1)        × 35
persistence = min(sessions_above_2σ / 5, 1)        × 20
                                                   ────
raw         = attention + consensus + persistence

− coverage penalty = (1 − coverage) × 20
− event discount   = 10 if a confounding event sits in the window

score = clamp(raw − penalties, 0, 100)
state = Elevated ≥ 60 · Watch ≥ 35 · Stable below · Insufficient data if coverage < 50%
```

The backend supplies **measured inputs only**. Deriving the score in the browser is what makes
"every warning explains its trigger" true rather than aspirational, and it is why the window
switcher can work at all.

## Backend Integration

See [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md). Three options, all zero-refactor:

1. Overwrite `src/data/snapshot.json` — the default, and what the demo runs on.
2. Run the prototype API — `npm run api`, then `npm run dev:api`.
3. Point at any other host — set `VITE_API_BASE` in `.env.local`; the app fetches
   `${VITE_API_BASE}/api/snapshot` and expects exactly `src/types.ts`.

Loading, error and empty states are already wired for all three.

### The Prototype API

A small Node process with no framework and no dependencies added, proving one path:
**saved fixture → transparent calculation → HTTP → the screens that already existed.**

```bash
npm run api        # http://localhost:8787
npm run dev:api    # the interface, reading from it
```

| Route | Answers |
|---|---|
| `GET /api/health` | is the process up, and which fixture did it load |
| `GET /api/signals` | all 12 instruments, calculated at request time, plus the rule table |
| `GET /api/signals/NVX` | one instrument |
| `GET /api/snapshot` | the full `src/types.ts` contract the interface reads |

```
attention_multiple = current_mentions / mean(previous 29 sessions)
consensus_percent  = dominant_direction_items / classified_items
coverage_percent   = classified_items / total_items

Insufficient data  < 50 classified items, or coverage < 50%, or a source did not report
Elevated           attention ≥ 2.0× AND consensus ≥ 70%
Watch              attention ≥ 1.5× OR  consensus ≥ 65%
Stable             neither
```

Those thresholds are **prototype heuristics, not empirically validated** — the API says so in
`method.caveat` on every response, and every reading carries the arithmetic that produced it.
The counts behind them are illustrative: [`server/data/fixture.json`](server/data/fixture.json)
holds raw counts generated from the demo snapshot, not collected data.

## Demo Data

12 instruments × 90 sessions, generated by
[`scripts/generate-mock.ts`](scripts/generate-mock.ts). The instruments are **fictional** —
attaching invented mention counts and invented forward outcomes to real listed companies would
misrepresent both. Every page header states *illustrative interface data* while `is_synthetic` is
true, and Method & limitations repeats it in full. Setting `is_synthetic: false` in the export
switches that wording to *backend export*.

The three tickers the recorded demo clicks through, and exactly what they must read:

| Ticker | Alert | Attention | Consensus | Coverage | Related event |
|---|---|---|---|---|---|
| **NVX** Novexa Semiconductor | Elevated | 3.1× | 78% bullish | High | Earnings · possible confounder |
| **MIN** Meridian Industrials | Watch | 1.8× | 61% bullish | High | Analyst upgrade · possible confounder |
| **QGG** Quantgrid Group | Watch | 1.6× | 57% bearish | Medium | Media coverage · coincided |

Those readings are not typed into the interface. They live in
[`scripts/demo-contract.ts`](scripts/demo-contract.ts); the generator **solves** for a series
that derives to them through `src/lib/scoring.ts` and refuses to write a snapshot that misses,
and `npm run smoke` re-checks the file that is actually bundled. The demo cannot drift from
the data.

The rest of the universe keeps the spread the screens need: a forum-driven extreme (ORBX), a
bearish build (KVRA), a filing-confounded rise the event discount pushes back down to Stable
(SLTR), quiet names (HRVS, CRSL), and one instrument below the coverage floor that refuses to
state a level at all (QNTL).

```bash
npm run mock                                   # regenerate, dated at run time
MOCK_AS_OF=2026-08-21T09:30:00Z npm run mock   # pinned, byte-identical
```

Series shapes are seeded and identical on every machine. The **dates** come from the clock, so
"last updated" is always a real timestamp read back out of the export — there is no design-file
date anywhere in the app.

## Checks

```bash
npm run verify    # typecheck + derivations over every instrument × window + the demo contract + the API tests
npm run api:test  # the six API calculation tests on their own
npm run e2e       # 56-step headless click-through of the demo path (needs the preview server)
```

`npm run e2e` drives real Chrome over the DevTools Protocol across all six screens: clicking
NVX / MIN / QGG and asserting every cell of the demo table against the panel beside it, filters,
search, empty state, sorting, window recomputation, tab deep-linking, the signal → history →
method → back → monitor round trip, the derived change log and its filters, watchlist tracking,
the methodology pipeline and coverage table, the research action and its persistence, the
unknown-ticker fallback, a check that the "last updated" stamp is one value read from the
snapshot, and a check that no uncaught errors occurred.

```bash
npm run build
npx vite preview --port 4178 --strictPort &
npm run e2e            # defaults to http://localhost:4178/crowding-risk-monitor
```

## Language Rules honoured in the UI

Used: *public attention risk, public consensus shift, public crowding-risk proxy, possible
crowding-risk signal, investigate further, early-warning screen, historical association.*

Never used: *actual crowding detected, institutional crowding confirmed, alpha decay confirmed,
guaranteed reversal,* buy/sell or position language, or any claim about returns. The monitor's
detail panel carries the screening-proxy note, every signal states its **limit** explicitly, and
the sidebar links to Method & limitations from every screen.

## Team

| Member | Owns |
|---|---|
| **Arzoo** | **End-to-end development and ownership** — product implementation, frontend and backend development, all six screens, AttnShift UI implementation, design tokens and responsive layout, signal derivations in [`src/lib/scoring.ts`](src/lib/scoring.ts), state management and routing, data generation and snapshot pipeline, prototype API, explainability and methodology screens, Alert History and Watchlist functionality, verification suite (`npm run verify`, `npm run e2e`), GitHub Pages deployment, research trail, demo video, and final integration of the complete project. |

The two tracks meet at the Figma tokens, copied into `src/index.css` rather than re-invented,
which is why design and code could run in parallel. Inside the build, backend meets frontend at
[`src/api/client.ts`](src/api/client.ts) — a single function reading one `snapshot.json`, whose
shape is fixed in [`src/types.ts`](src/types.ts). Either side can be rebuilt without touching the
other, and the frontend ships working with the bundled snapshot whether or not a backend is
reachable.
