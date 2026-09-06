import type { RelatedEvent } from '../types'
import { shortDate } from '../lib/format'

/**
 * News can move both attention and price, so any event that could explain the
 * change on its own is shown next to the signal rather than hidden behind it.
 */
export function EventTimeline({ events }: { events: RelatedEvent[] }) {
  if (events.length === 0) {
    return <p className="hint">No related events were found in this window from the configured sources.</p>
  }
  return (
    <div className="events">
      {events.map((e) => (
        <article className="event" key={`${e.date}-${e.label}`}>
          <div className="event__date">{shortDate(e.date)}</div>
          <div className="event__rail">
            <span className={`event__dot${e.confounder ? ' event__dot--confounder' : ''}`} />
          </div>
          <div>
            <div className="event__headline">{e.headline}</div>
            <div className="event__meta">
              <span>{e.source}</span>
              <span>·</span>
              <span>{e.label}</span>
              {e.confounder && <span className="pill" style={{ padding: '1px 7px' }}>Possible confounder</span>}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
