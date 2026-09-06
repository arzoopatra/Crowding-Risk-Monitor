import type { Instrument } from '../types'
import { num, pct } from '../lib/format'

const COLOURS = ['#2f5aa8', '#5c8ad6', '#8fb4e8', '#c2d5f2']

/**
 * Platforms measure different populations, so the mix has to be inspectable:
 * a spike that is 63% one forum is a different fact from a broad-based rise.
 */
export function SourceMix({ instrument }: { instrument: Instrument }) {
  const mix = [...instrument.source_mix].sort((a, b) => b.share - a.share)
  return (
    <div>
      <div className="srcbar" role="img" aria-label="Share of today's mentions by source">
        {mix.map((s, i) => (
          <span key={s.source_id} style={{ width: `${s.share * 100}%`, background: COLOURS[i % COLOURS.length] }} />
        ))}
      </div>
      <div className="srclist">
        {mix.map((s, i) => (
          <div className="srcrow" key={s.source_id}>
            <span className="srcrow__swatch" style={{ background: COLOURS[i % COLOURS.length] }} />
            <div>
              <div className="srcrow__label">{s.label}</div>
              <div className="srcrow__note">{s.note}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="srcrow__v num">{pct(s.share)}</div>
              <div className="srcrow__note num">{num(s.mentions)}</div>
            </div>
          </div>
        ))}
      </div>
      {instrument.coverage.sources_available < instrument.coverage.sources_expected && (
        <p className="hint" style={{ marginTop: 12 }}>
          {instrument.coverage.sources_expected - instrument.coverage.sources_available} expected source
          {instrument.coverage.sources_expected - instrument.coverage.sources_available === 1 ? '' : 's'} returned
          no data for this window. {instrument.coverage.note}
        </p>
      )}
    </div>
  )
}
