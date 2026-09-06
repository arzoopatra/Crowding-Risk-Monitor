/** Loading, error and empty screens, in the AttnShift panel language. */
import type { ReactNode } from 'react'

export function LoadingState({ label = 'Loading the data snapshot…' }: { label?: string }) {
  return (
    <div className="page">
      <div className="panel">
        <div className="state">
          <div className="skeleton" style={{ width: 220, height: 10 }} />
          <div className="skeleton" style={{ width: 320, height: 10 }} />
          <div className="state__body" style={{ marginTop: 6 }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="page">
      <div className="panel">
        <div className="state">
          <div className="state__title">The data snapshot could not be loaded</div>
          <div className="state__body">{message}</div>
          <div className="state__body">
            The app falls back to the bundled snapshot when no backend is configured, so this usually means
            VITE_API_BASE points somewhere unreachable.
          </div>
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmptyState({
  title = 'No tickers match these filters',
  body = 'Widen the alert-state filters or clear the search to bring the universe back.',
  onReset,
  action,
}: {
  title?: string
  body?: string
  onReset?: () => void
  action?: ReactNode
}) {
  return (
    <div className="state">
      <div className="state__title">{title}</div>
      <div className="state__body">{body}</div>
      {onReset && (
        <button type="button" className="btn" onClick={onReset}>
          Reset filters
        </button>
      )}
      {action}
    </div>
  )
}
