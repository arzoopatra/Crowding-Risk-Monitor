import { useEffect, useState } from 'react'
import type { Snapshot } from '../types'
import { loadSnapshot } from './client'

type State =
  | { status: 'loading'; snapshot: null; error: null }
  | { status: 'ready'; snapshot: Snapshot; error: null }
  | { status: 'error'; snapshot: null; error: string }

export function useSnapshot(): State & { reload: () => void } {
  const [state, setState] = useState<State>({ status: 'loading', snapshot: null, error: null })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let live = true
    loadSnapshot(controller.signal)
      .then((snapshot) => {
        if (live) setState({ status: 'ready', snapshot, error: null })
      })
      .catch((err: unknown) => {
        if (!live || controller.signal.aborted) return
        setState({
          status: 'error',
          snapshot: null,
          error: err instanceof Error ? err.message : 'Could not load the data snapshot.',
        })
      })
    return () => {
      live = false
      controller.abort()
    }
  }, [nonce])

  const reload = () => {
    setState({ status: 'loading', snapshot: null, error: null })
    setNonce((n) => n + 1)
  }

  return { ...state, reload }
}
