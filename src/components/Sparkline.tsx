import type { SeriesPoint } from '../types'

/** Compact 30-session shape for the monitor table. No axes, no interaction. */
export function Sparkline({
  series,
  baseline,
  tone,
  width = 74,
  height = 24,
}: {
  series: SeriesPoint[]
  baseline: number
  tone: 'elevated' | 'watch' | 'normal' | 'insufficient'
  width?: number
  height?: number
}) {
  const points = series.slice(-30)
  if (points.length < 2) return <span className="hint">—</span>

  const values = points.map((p) => p.mentions)
  const max = Math.max(...values, baseline) * 1.06
  const min = Math.min(...values, baseline) * 0.94
  const span = Math.max(max - min, 1)
  const x = (i: number) => (i / (points.length - 1)) * (width - 2) + 1
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4)

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`
  const stroke = `var(--${tone}-mark)`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
      <path d={area} fill={stroke} opacity={0.1} />
      <line x1={0} x2={width} y1={y(baseline)} y2={y(baseline)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="2 2" />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.2} fill={stroke} />
    </svg>
  )
}
