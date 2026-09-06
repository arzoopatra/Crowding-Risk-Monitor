/**
 * "Attention trend · last 30 days" — the bar chart on the signal detail screen.
 *
 * Bars are drawn as a multiple of the baseline mean, so the y-axis reads 0×,
 * 1×, 2×, 3× exactly as in the design. Bars tint upward through the alert
 * thresholds (base → accent → peak) and a confounding event is marked with a
 * vertical rule and a label under the axis.
 */
import type { SeriesPoint } from '../types'
import { useMeasure } from './useMeasure'
import { shortDate } from '../lib/format'

const AXIS_W = 34
const ROW_H = 38
const TOP_PAD = 12
const AXIS_PAD_B = 46

export function AttentionTrend({
  series,
  baselineMean,
  eventDate,
  eventLabel,
}: {
  series: SeriesPoint[]
  baselineMean: number
  eventDate?: string
  eventLabel?: string
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()

  const multiples = series.map((p) => (baselineMean > 0 ? p.mentions / baselineMean : 0))
  const peak = Math.max(1, ...multiples)
  // round the axis up to a whole multiple so the gridlines land on 1×, 2×, 3× …
  const topMultiple = Math.max(2, Math.ceil(peak))
  const plotH = topMultiple * ROW_H
  const height = TOP_PAD + plotH + AXIS_PAD_B
  const zeroY = TOP_PAD + plotH

  const plotW = Math.max(0, width - AXIS_W - 8)
  const step = series.length ? plotW / series.length : 0
  const barW = Math.max(2, Math.min(22, step * 0.6))

  const eventIndex = eventDate ? series.findIndex((p) => p.date === eventDate) : -1
  const tickIndexes = tickPositions(series.length)

  return (
    <div className="trend" ref={ref}>
      {width > 0 && (
        <svg height={height} role="img" aria-label="Relative public-attention volume over the window">
          {Array.from({ length: topMultiple + 1 }, (_, i) => {
            const y = zeroY - i * ROW_H
            return (
              <g key={i}>
                <line
                  x1={AXIS_W}
                  x2={AXIS_W + plotW}
                  y1={y}
                  y2={y}
                  className={i === 0 ? 'trend__baseline' : 'trend__gridline'}
                />
                <text x={0} y={y + 3} className="trend__tick">
                  {i}×
                </text>
              </g>
            )
          })}

          {series.map((point, i) => {
            const m = multiples[i]
            const h = Math.max(1, (m / topMultiple) * plotH)
            const x = AXIS_W + i * step + (step - barW) / 2
            const cls = m >= 2 ? 'trend__bar trend__bar--peak' : m >= 1.35 ? 'trend__bar trend__bar--mid' : 'trend__bar'
            return (
              <rect key={point.date} x={x} y={zeroY - h} width={barW} height={h} rx={1} className={cls}>
                <title>{`${shortDate(point.date)} · ${m.toFixed(2)}× baseline · ${point.mentions.toLocaleString()} mentions`}</title>
              </rect>
            )
          })}

          {eventIndex >= 0 && (
            <>
              <line
                x1={AXIS_W + eventIndex * step + step / 2}
                x2={AXIS_W + eventIndex * step + step / 2}
                y1={TOP_PAD}
                y2={zeroY + 8}
                className="trend__event"
              />
              <text
                x={AXIS_W + eventIndex * step + step / 2}
                y={zeroY + 26}
                textAnchor="middle"
                className="trend__eventlabel"
              >
                {(eventLabel ?? 'EVENT').toUpperCase()}
              </text>
            </>
          )}

          {tickIndexes.map((i) => (
            <text key={i} x={AXIS_W + i * step} y={zeroY + 40} className="trend__tick">
              {shortDate(series[i].date)}
            </text>
          ))}
        </svg>
      )}

      <div className="trend__key">
        <span>
          <i className="trend__swatch" /> below 1.35×
        </span>
        <span>
          <i className="trend__swatch trend__swatch--mid" /> 1.35× and above
        </span>
        <span>
          <i className="trend__swatch trend__swatch--peak" /> 2× and above
        </span>
      </div>
    </div>
  )
}

/** Four evenly spaced date ticks, as drawn in the design. */
function tickPositions(length: number): number[] {
  if (length <= 1) return length ? [0] : []
  const wanted = Math.min(4, length)
  const out = new Set<number>()
  for (let i = 0; i < wanted; i++) out.add(Math.round((i * (length - 1)) / (wanted - 1)))
  return [...out]
}
