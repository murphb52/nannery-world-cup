import { createContext, useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SWEEPSTAKES, type SweepstakesConfig } from '../config/sweepstakes'
import { loadPlayersFor, loadDrawFor } from '../data/loaders'
import type { Player, DrawResult } from '../types'

interface SweepstakesContextValue {
  config: SweepstakesConfig
  players: Player[]
  draw: DrawResult
  loading: boolean
}

const SweepstakesContext = createContext<SweepstakesContextValue | null>(null)

export function useSweepstakes(): SweepstakesContextValue {
  const ctx = useContext(SweepstakesContext)
  if (!ctx) throw new Error('useSweepstakes must be used inside SweepstakesProvider')
  return ctx
}

export function SweepstakesProvider({ children }: { children: React.ReactNode }) {
  const { sweepstakesId } = useParams<{ sweepstakesId: string }>()
  const config = sweepstakesId ? SWEEPSTAKES[sweepstakesId] : undefined

  const [players, setPlayers] = useState<Player[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!config) return
    setLoading(true)
    Promise.all([loadPlayersFor(config.dataDir), loadDrawFor(config.dataDir)]).then(([p, d]) => {
      setPlayers(p)
      setDraw(d)
      setLoading(false)
    })
  }, [config?.dataDir])

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4 text-center">
        <div>
          <div className="text-5xl mb-4">🤔</div>
          <h2 className="text-2xl font-bold text-white mb-2">Sweepstakes not found</h2>
          <p className="text-white/40 text-sm">
            Try <a href="#/nannery/groups" className="text-yellow-400 hover:underline">Nannery</a>{' '}
            or <a href="#/last-man-standing/groups" className="text-yellow-400 hover:underline">Last Man Standing</a>
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-white/50 animate-pulse">Loading…</div>
      </div>
    )
  }

  return (
    <SweepstakesContext.Provider value={{ config, players, draw, loading }}>
      {children}
    </SweepstakesContext.Provider>
  )
}
