import { useMemo, useState } from 'react'
import type { RelatedEvent, SeriesPoint } from '../types'
import { useMeasure } from './useMeasure'
import { num, shortDate } from '../lib/format'

/**
 * Two stacked panels on one shared time axis:
 *   top    — mention volume against its baseline mean and ±2σ band
 *   bottom — dominant-direction share, with the 50% even-split reference
 *
 * Events that could explain the attention change are drawn as vertical markers,
 * so a confounder is visible at the same moment as the spike it may explain.
 */
export function TrendChart({
  series,
  events,
  baselineMean,
  baselineSd,
}: {
  series: SeriesPoint[]
  events: RelatedEvent[]
  baselineMean: number
  baselineSd: number
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const H_TOP = 168
  const H_GAP = 26
  const H_BOT = 84
  const PAD_L = 48
  const PAD_R = 12
  const PAD_T = 10
  const AXIS_H = 20
  const height = PAD_T + H_TOP + H_GAP + H_BOT + AXIS_H
  const w = Math.max(width, 320)
  const innerW = Math.max(w - PAD_L - PAD_R, 40)

  const geom = useMemo(() => {
    const n = series.length
    const xAt = (i: number) => PAD_L + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)

    const upper = baselineMean + 2 * baselineSd
    const maxMentions = Math.max(...series.map((p) => p.mentions), upper) * 1.08
    const yTop = (v: number) => PAD_T + H_TOP - (v / Math.max(maxMentions, 1)) * H_TOP

    const shares = series.map((p) => p.consensus_share)
    const sMin = Math.min(0.45, ...shares) - 0.03
    const sMax = Math.max(0.75, ...shares) + 0.03
    const botTop = PAD_T + H_TOP + H_GAP
    const yBot = (v: number) => botTop + H_BOT - ((v - sMin) / Math.max(sMax - sMin, 0.01)) * H_BOT

    const line = (accessor: (p: SeriesPoint) => number, yFn: (v: number) => number) =>
      series
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yFn(accessor(p)).toFixed(1)}`)
        .join(' ')

    const mentionsLine = line((p) => p.mentions, yTop)
    const mentionsArea = `${mentionsLine} L${xAt(n - 1).toFixed(1)},${(PAD_T + H_TOP).toFixed(1)} L${xAt(0).toFixed(1)},${(PAD_T + H_TOP).toFixed(1)} Z`
    const consensusLine = line((p) => p.consensus_share, yBot)

    // x ticks: about six, always including the last session
    const tickCount = Math.min(6, n)
    const tickIdx = Array.from({ length: tickCount }, (_, k) =>
      Math.round((k / Math.max(tickCount - 1, 1)) * (n - 1)),
    )

    const yTicksTop = [0, maxMentions / 2, maxMentions].map((v) => ({ v, y: yTop(v) }))
    // always keep the 50% even-split reference; drop any tick that would collide with it
    const span = sMax - sMin
    const yTicksBot = [sMin + span * 0.05, 0.5, sMax - span * 0.05]
      .filter((v, _i, all) => v === 0.5 || Math.abs(v - 0.5) > span * 0.2 || !all.includes(0.5))
      .map((v) => ({ v, y: yBot(v) }))

    const dateIndex = new Map(series.map((p, i) => [p.date, i]))
    const markers = events
      .map((e) => ({ e, i: dateIndex.get(e.date) }))
      .filter((m): m is { e: RelatedEvent; i: number } => m.i !== undefined)

    return { xAt, yTop, yBot, mentionsLine, mentionsArea, consensusLine, tickIdx, yTicksTop, yTicksBot, upper, lower: Math.max(baselineMean - 2 * baselineSd, 0), botTop, markers, sMin, sMax }
  }, [series, events, baselineMean, baselineSd, innerW])

  const hoveredEvent = hover === null ? undefined : geom.markers.find((m) => m.i === hover)?.e
  const point = hover === null ? null : series[hover]

  const onMove = (evt: React.MouseEvent<SVGRectElement>) => {
    const rect = evt.currentTarget.getBoundingClientRect()
    const rel = (evt.clientX - rect.left) / Math.max(rect.width, 1)
    setHover(Math.max(0, Math.min(series.length - 1, Math.round(rel * (series.length - 1)))))
  }

  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(geom.xAt(hover) + 12, 8), Math.max(w - 190, 8))

  return (
    <div className="chart" ref={ref}>
      <div className="chart__legend">
        <span><i style={{ background: 'var(--accent)' }} />Mentions per session</span>
        <span><i style={{ background: 'var(--border-strong)' }} />Baseline mean</span>
        <span><i className="band" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} />Baseline ±2σ</span>
        <span><i style={{ background: 'var(--watch-mark)' }} />Related event</span>
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img"
        aria-label="Attention and directional-consensus timelines with related-event markers">
        {/* --- attention panel --- */}
        <rect x={PAD_L} y={geom.yTop(geom.upper)} width={innerW}
          height={Math.max(geom.yTop(geom.lower) - geom.yTop(geom.upper), 1)}
          fill="var(--surface-3)" />
        {geom.yTicksTop.map((t, i) => (
          <g key={`yt${i}`}>
            <line x1={PAD_L} x2={PAD_L + innerW} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD_L - 8} y={t.y + 3.5} textAnchor="end" fontSize={10.5} fill="var(--text-3)">{num(Math.round(t.v))}</text>
          </g>
        ))}
        <line x1={PAD_L} x2={PAD_L + innerW} y1={geom.yTop(baselineMean)} y2={geom.yTop(baselineMean)}
          stroke="var(--border-strong)" strokeWidth={1.25} strokeDasharray="4 3" />
        <path d={geom.mentionsArea} fill="var(--accent)" opacity={0.09} />
        <path d={geom.mentionsLine} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

        {/* --- consensus panel --- */}
        {geom.yTicksBot.map((t, i) => (
          <g key={`yb${i}`}>
            <line x1={PAD_L} x2={PAD_L + innerW} y1={t.y} y2={t.y}
              stroke={Math.abs(t.v - 0.5) < 0.001 ? 'var(--border-strong)' : 'var(--border)'}
              strokeWidth={1} strokeDasharray={Math.abs(t.v - 0.5) < 0.001 ? '4 3' : undefined} />
            <text x={PAD_L - 8} y={t.y + 3.5} textAnchor="end" fontSize={10.5} fill="var(--text-3)">{(t.v * 100).toFixed(0)}%</text>
          </g>
        ))}
        <path d={geom.consensusLine} fill="none" stroke="#2e8c68" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        <text x={PAD_L} y={geom.botTop - 8} fontSize={11} fontWeight={600} fill="var(--text-3)">Dominant-direction share</text>

        {/* --- event markers --- */}
        {geom.markers.map(({ e, i }) => (
          <g key={`${e.date}-${e.label}`}>
            <line x1={geom.xAt(i)} x2={geom.xAt(i)} y1={PAD_T} y2={geom.botTop + H_BOT}
              stroke={e.confounder ? 'var(--watch-mark)' : 'var(--border-strong)'}
              strokeWidth={1} strokeDasharray="3 3" opacity={e.confounder ? 0.9 : 0.6} />
            <polygon
              points={`${geom.xAt(i) - 4},${PAD_T - 1} ${geom.xAt(i) + 4},${PAD_T - 1} ${geom.xAt(i)},${PAD_T + 5}`}
              fill={e.confounder ? 'var(--watch-mark)' : 'var(--border-strong)'} />
          </g>
        ))}

        {/* --- x axis --- */}
        {geom.tickIdx.map((i) => (
          <text
            key={`x${i}`}
            x={geom.xAt(i)}
            y={height - 5}
            textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
            fontSize={10.5}
            fill="var(--text-3)"
          >
            {shortDate(series[i].date)}
          </text>
        ))}

        {/* --- hover --- */}
        {hover !== null && point && (
          <g pointerEvents="none">
            <line x1={geom.xAt(hover)} x2={geom.xAt(hover)} y1={PAD_T} y2={geom.botTop + H_BOT}
              stroke="var(--text-3)" strokeWidth={1} />
            <circle cx={geom.xAt(hover)} cy={geom.yTop(point.mentions)} r={3.5} fill="var(--accent)" stroke="#fff" strokeWidth={1.5} />
            <circle cx={geom.xAt(hover)} cy={geom.yBot(point.consensus_share)} r={3.5} fill="#2e8c68" stroke="#fff" strokeWidth={1.5} />
          </g>
        )}
        <rect x={PAD_L} y={PAD_T} width={innerW} height={H_TOP + H_GAP + H_BOT} fill="transparent"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ cursor: 'crosshair' }} />
      </svg>

      {hover !== null && point && (
        <div className="tooltip" style={{ left: tooltipLeft, top: 34 }}>
          <div className="tooltip__date">{shortDate(point.date)}</div>
          <div className="tooltip__row"><span>Mentions</span><span>{num(point.mentions)}</span></div>
          <div className="tooltip__row"><span>vs baseline</span><span>{(point.mentions - baselineMean) / baselineSd >= 0 ? '+' : '−'}{Math.abs((point.mentions - baselineMean) / baselineSd).toFixed(2)}σ</span></div>
          <div className="tooltip__row"><span>Direction share</span><span>{(point.consensus_share * 100).toFixed(0)}%</span></div>
          {hoveredEvent && <div className="tooltip__event">{hoveredEvent.label}</div>}
        </div>
      )}
    </div>
  )
}
