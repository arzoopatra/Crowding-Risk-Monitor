import type { DriverNote } from '../lib/scoring'

const ICON: Record<DriverNote['effect'], string> = { raises: '↑', lowers: '↓', context: '•' }

/** "Why this changed" — the trigger behind the warning, in plain language. */
export function Drivers({ drivers }: { drivers: DriverNote[] }) {
  return (
    <div className="drivers">
      {drivers.map((d) => (
        <div className="driver" key={d.key}>
          <span className={`driver__icon driver__icon--${d.effect}`} aria-hidden>{ICON[d.effect]}</span>
          <div>
            <div className="driver__label">{d.label}</div>
            <div className="driver__detail">{d.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
