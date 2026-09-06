# Data contract — Backend → Frontend

One file, one shape. Replace `src/data/snapshot.json` (or serve the same JSON from a
backend) and the whole app updates. Nothing else needs to change.

TypeScript definitions: [`src/types.ts`](../src/types.ts) — that file is the authority.

## What each screen field is called here

The interface names a field the way a researcher reads it; the export names it the way the
pipeline produces it. This is the whole mapping.

| Screen field | Comes from | Notes |
|---|---|---|
| `ticker` | `instrument.ticker` | Route key: `#/signal/NVX`. |
| `company_name` | `instrument.name` | |
| `alert_state` | **derived**, not exported | `deriveSignal(...).state` → Elevated / Watch / Stable / Insufficient data. See the rule below. |
| `attention_multiple` | **derived** from `series` | `mentions today ÷ mean(baseline window)`, shown as `3.1×`. |
| `baseline_window_days` | `snapshot.baseline_window_days`, echoed on `attention.baseline_window_days` | Sets which look-back the app opens on. The alert is read against this average. |
| `consensus_direction` | `consensus.dominant_direction` | |
| `consensus_percent` | `consensus.share` × 100 | Share of *directional* mentions, not of all mentions. |
| `classified_item_count` | `consensus.directional_mentions` | Shown next to every consensus figure — the percentage is never published without its n. |
| `coverage_state` | **derived** from `coverage.*` | High / Medium / Low. A data-availability label, never a certainty label. |
| `source_mix` | `source_mix[]` | |
| `related_event` | `event_flag.label`, else the newest `related_events[].label` | |
| `event_is_possible_confounder` | `related_events[].confounder`, summarised on `event_flag.present` | `true` means the event could account for the change **on its own** — never that it caused the signal. |
| `updated_at` | `instrument.last_updated`, and `snapshot.generated_at` for the board | Always rendered from the export. No screen carries a fixed date. |
| `data_status` | `snapshot.data_status` | Falls back to a phrase derived from `is_synthetic` if omitted. |
| `limitations` | `instrument.limitations[]` | Falls back to `coverage.note` if omitted. |

## The rule that matters

**The export carries measured inputs only. It must not carry a score or a risk level.**

The score and the state are derived in the browser by [`src/lib/scoring.ts`](../src/lib/scoring.ts)
and every term is rendered on screen. This is what lets the product claim it has no black-box
score, and it is why the look-back window can be changed live without asking the backend to
recompute anything.

## Two ways to deliver it

1. **File swap (default, and what the demo uses).** Overwrite `src/data/snapshot.json`.
   Bundled at build time, so the demo cannot fail on a network call.
2. **HTTP.** Create `.env.local` with `VITE_API_BASE=http://localhost:8000`. The app then
   GETs `${VITE_API_BASE}/snapshot.json`. Same shape, same field names.

## Top level

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | Bump on any breaking change. Shown in the footer. |
| `dataset` | string | Free-text label for the export. |
| `is_synthetic` | boolean | `true` shows a **Demo snapshot** pill in the header. Set `false` only for real data. |
| `data_status` | string | Optional. Rendered verbatim wherever a screen states where its numbers came from. Omit and the UI writes *Illustrative interface data* / *Backend export* from `is_synthetic`. |
| `disclaimer` | string | Shown verbatim on Method & limitations. |
| `generated_at` | ISO 8601 | Snapshot time. Every "last updated" and "x min ago" on screen is read from this or from `last_updated` — nothing is hardcoded, so a stale export shows as stale. |
| `data_window` | `{start, end}` | ISO dates, inclusive. |
| `baseline_window_days` | number | Default baseline, currently 30. |
| `sources` | `SourceDefinition[]` | `{id, label, note}`. The `note` is user-facing — it is where a source's population bias gets stated. |
| `instruments` | `Instrument[]` | One row per tracked stock. |

## Instrument

| Field | Type | Notes |
|---|---|---|
| `ticker`, `name`, `sector` | string | `ticker` is the route key: `#/signal/NVX`. |
| `last_updated` | ISO 8601 | Per-instrument freshness. |
| `attention.mentions_today` | number | Relevant mentions in the latest session. |
| `attention.baseline_mean` / `baseline_sd` | number | Trailing baseline excluding the latest session. |
| `attention.z_score`, `pct_vs_baseline`, `days_above_baseline` | number | Convenience summaries at the 30-session default. **Recomputed client-side per window** — supply them for other consumers, but the UI does not depend on them. |
| `consensus.dominant_direction` | `bullish\|bearish\|mixed` | |
| `consensus.share` | 0–1 | Share of *directional* mentions pointing the same way. `0.5` = even split. |
| `consensus.baseline_share` | 0–1 | Same measure over the baseline period. |
| `coverage.completeness` | 0–1 | Share of expected records that arrived. **Below `0.5` the UI refuses to state a risk level** and shows *Insufficient data*. |
| `coverage.sources_available` / `sources_expected` | number | Drives the coverage dots. |
| `coverage.note` | string | User-facing sentence about what is missing. |
| `event_flag` | `{present, date?, type?, label?}` | `present: true` applies a −10 point confounder discount. Set it whenever a scheduled or major event could explain the attention change **on its own**. The UI describes such an event as having *coincided* with the change and as a *possible confounder*; it never states that the event produced the signal, so an event that merely happened nearby belongs in `related_events` with `confounder: false`. |
| `limitations` | `string[]` | Optional. What this particular signal cannot tell you, rendered under **Limit** on the signal screen. The product-level limit sentence is always shown as well. |
| `source_mix` | `SourceMixEntry[]` | `{source_id, label, share, mentions, available, note}`. Shares should sum to ~1. |
| `related_events` | `RelatedEvent[]` | `{date, type, label, headline, source, confounder}`. `confounder: true` draws an amber marker on the chart. |
| `series` | `SeriesPoint[]` | **Required, ascending by date.** See below. |
| `historical` | `HistoricalEvidence` | See below. |

### `series` — the important one

At least 90 points, oldest first, one per trading session:

```json
{ "date": "2026-08-21", "mentions": 1389, "baseline_mean": 298.4, "baseline_sd": 165.2,
  "attention_z": 6.6, "consensus_share": 0.854, "dominant_direction": "bullish" }
```

Everything on the screen is recomputed from this array for the selected window (7 / 30 / 90),
so gaps or unsorted dates will show up directly in the charts. `attention_z` and the baseline
fields inside a point are informational; the UI derives its own from `mentions` over the window.

### `historical`

```json
{ "sample_size": 27, "date_range": {"start": "...", "end": "..."},
  "definition": "Historical days where attention z >= 2.5 and dominant-direction share >= 0.70",
  "high_signal_mean_pct": {"d1": 0.15, "d3": -1.01, "d5": -2.12},
  "ordinary_mean_pct":    {"d1": 0.01, "d3":  0.01, "d5":  0.02},
  "outcome_split": {"continuation": 38, "weakening": 40, "reversal": 22},
  "event_flagged_share": 0.51,
  "supporting_cases": [ ... ], "counterexamples": [ ... ] }
```

- `d1/d3/d5` are **cumulative** forward percentage moves, so `d5` builds on `d3`.
- `outcome_split` values are percentages and should total 100.
- `supporting_cases` and `counterexamples` are both required and are shown with equal weight.
  An export with no counterexamples will render an evidence panel that overstates the signal —
  if the sample genuinely has none, send an empty array and say so in `definition`.

## Regenerating the demo snapshot

```bash
npm run mock                                        # dated at run time
MOCK_AS_OF=2026-08-21T09:30:00Z npm run mock        # pinned, byte-identical
npm run smoke                                       # re-checks whatever is bundled
```

The series shapes are seeded, so they are identical on every machine. The **dates** come from
the clock, so "last updated" is always a real timestamp rather than a date left over from a
design file. Pin `MOCK_AS_OF` when a byte-identical snapshot matters.

`scripts/generate-mock.ts` derives its own output through `src/lib/scoring.ts` — the same module
the screens use — and **refuses to write a snapshot** whose demo tickers do not read exactly as
[`scripts/demo-contract.ts`](../scripts/demo-contract.ts) declares. `npm run smoke` then re-checks
the bundled file, so the data pipeline and the interface cannot disagree.
