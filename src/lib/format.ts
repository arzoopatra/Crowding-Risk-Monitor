/** Display helpers. Numbers in tables use tabular figures via CSS. */

export const num = (n: number) => n.toLocaleString('en-GB')

export const signedPct = (n: number, digits = 0) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th. */
export function ordinal(n: number) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export const signedPts = (n: number, digits = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`

export const z = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(2)}σ`

export function shortDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

export function longDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function dateTime(iso: string) {
  const d = new Date(iso)

  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`
}

/** "14 min ago" / "2 h ago" — relative to the snapshot time, not the wall clock. */
export function relativeTo(iso: string, referenceIso: string) {
  const diffMin = Math.round((new Date(referenceIso).getTime() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}
