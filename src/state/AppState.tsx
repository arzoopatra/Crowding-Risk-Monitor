import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Snapshot } from '../types'
import { useSnapshot } from '../api/useSnapshot'
import { WINDOWS } from '../lib/scoring'
import type { WindowDays } from '../lib/scoring'

export interface Investigation {
  ticker: string
  note: string
  savedAt: string
  /** the proxy state at the moment it was flagged, so the note keeps its context */
  stateAtSave: string
  scoreAtSave: number
}

const STORAGE_KEY = 'crm.investigations.v1'

function readStored(): Record<string, Investigation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Investigation>) : {}
  } catch {
    return {}
  }
}

interface AppState {
  status: 'loading' | 'ready' | 'error'
  snapshot: Snapshot | null
  error: string | null
  reload: () => void
  windowDays: WindowDays
  setWindowDays: (d: WindowDays) => void
  investigations: Record<string, Investigation>
  saveInvestigation: (i: Investigation) => void
  removeInvestigation: (ticker: string) => void
}

const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { status, snapshot, error, reload } = useSnapshot()
  const [chosenWindow, setChosenWindow] = useState<WindowDays | null>(null)
  const [investigations, setInvestigations] = useState<Record<string, Investigation>>(readStored)

  // The look-back opens on whatever baseline the export declares, so the
  // headline reading is "attention vs the N-day average" the data was built
  // around. Held as null-until-chosen rather than copied into state, so a
  // researcher's own pick is never overwritten when the snapshot reloads.
  const declared = snapshot?.baseline_window_days
  const defaultWindow: WindowDays =
    declared !== undefined && (WINDOWS as readonly number[]).includes(declared) ? (declared as WindowDays) : 30
  const windowDays = chosenWindow ?? defaultWindow

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(investigations))
    } catch {
      /* private mode or blocked storage — the demo still works, notes just do not persist */
    }
  }, [investigations])

  const saveInvestigation = useCallback((i: Investigation) => {
    setInvestigations((prev) => ({ ...prev, [i.ticker]: i }))
  }, [])

  const removeInvestigation = useCallback((ticker: string) => {
    setInvestigations((prev) => {
      const next = { ...prev }
      delete next[ticker]
      return next
    })
  }, [])

  const value = useMemo<AppState>(
    () => ({
      status,
      snapshot,
      error,
      reload,
      windowDays,
      setWindowDays: setChosenWindow,
      investigations,
      saveInvestigation,
      removeInvestigation,
    }),
    [status, snapshot, error, reload, windowDays, investigations, saveInvestigation, removeInvestigation],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}
