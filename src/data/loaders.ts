import type { Team, DrawResult, ScoresData } from '../types'

// Data files are served from public/data/ (symlinked to /data/ at repo root)
async function fetchJson<T>(path: string): Promise<T> {
  const base = import.meta.env.BASE_URL
  const r = await fetch(`${base}data/${path}`)
  if (!r.ok) throw new Error(`Failed to load ${path}`)
  return r.json()
}

export const loadPlayers = () => fetchJson<string[]>('players.json')
export const loadTeams = () => fetchJson<Team[]>('teams.json')
export const loadDraw = () => fetchJson<DrawResult>('draw.json')
export const loadScores = () => fetchJson<ScoresData>('scores.json')
