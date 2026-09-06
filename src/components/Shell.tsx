/**
 * App shell: the dark fixed sidebar and the page header block that every
 * screen repeats (mono eyebrow, 28px title, muted subtitle, right-hand
 * actions, hairline rule).
 */
import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { PRODUCT_VERSION, workspaceLabel } from '../lib/attnshift'

export const NAV = [
  // `short` is what the entry shows once the sidebar is collapsed to a rail:
  // navigation survives the collapse rather than disappearing with the labels.
  { to: '/', label: 'Monitor', short: 'M', end: true },
  { to: '/alerts', label: 'Alert History', short: 'AH', end: false },
  { to: '/watchlist', label: 'Watchlist', short: 'WL', end: false },
]

/**
 * A signal detail can be opened from any of the three lists, so the row that
 * opens one stamps its own route into the router state. Both the detail's back
 * control and the sidebar read the origin from here, which is what keeps the
 * two from disagreeing. Unknown or absent state (a cold deep link) falls back
 * to the monitor.
 */
export type SignalOrigin = { from?: string } | null

export function originOf(state: unknown) {
  const from = (state as SignalOrigin)?.from
  const match = NAV.find((item) => item.to === from)
  // fromList separates "a list sent me here" from "someone opened this URL
  // cold", which is what decides whether going back can pop history.
  return { ...(match ?? NAV[0]), fromList: Boolean(match) }
}

export function Sidebar() {
  const { snapshot } = useAppState()
  const location = useLocation()
  // Collapsing hands the width back to a wide table. Held here rather than in
  // the URL: it is a viewing preference, not somewhere you can navigate to.
  const [collapsed, setCollapsed] = useState(false)
  // the methodology screen lights its own footer entry rather than a nav item
  const onMethod = location.pathname === '/method'
  // A signal detail has no nav entry of its own. Rather than leaving the whole
  // sidebar dark — no answer to "where am I?" — it lights the list that opened
  // it, the same origin its back control names.
  const section = location.pathname.startsWith('/signal/') ? originOf(location.state).to : undefined
  return (
    <aside className={collapsed ? 'sidebar sidebar--collapsed' : 'sidebar'}>
      <button
        type="button"
        className="sidebar__toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '▶' : '◀'}
      </button>

      <div className="sidebar__brand">
        <div className="sidebar__mark">
          <img src={`${import.meta.env.BASE_URL}brand/attnshift-mark.svg`} alt="" width={36} height={36} />
          <span className="sidebar__name">AttnShift</span>
        </div>
        <div className="sidebar__tagline">Public attention monitor</div>
      </div>

      <nav className="sidebar__nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive || item.to === section ? 'is-active' : '')}
            title={item.label}
          >
            <span className="sidebar__full">{item.label}</span>
            <span className="sidebar__short">{item.short}</span>
          </NavLink>
        ))}
      </nav>

      <div className={onMethod ? 'sidebar__foot is-active' : 'sidebar__foot'}>
        <NavLink to="/method" title="Method & limitations">
          <span className="sidebar__full">METHOD &amp; LIMITATIONS</span>
          <span className="sidebar__short">M&amp;L</span>
        </NavLink>
        <div className="sidebar__full">
          {workspaceLabel(snapshot)} · v{PRODUCT_VERSION}
        </div>
      </div>
    </aside>
  )
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
  stamp,
}: {
  eyebrow: ReactNode
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  stamp?: ReactNode
}) {
  return (
    <>
      <div className="pagehead">
        <div className="pagehead__text">
          <div className="mono-label">{eyebrow}</div>
          <h1>{title}</h1>
          {sub && <div className="pagehead__sub">{sub}</div>}
        </div>
        {(actions || stamp) && (
          <div className="pagehead__actions">
            {stamp && <span className="pagehead__stamp">{stamp}</span>}
            {actions}
          </div>
        )}
      </div>
      <div className="rule" />
    </>
  )
}
