import type { Team, DrawResult, ScoresData } from '../types'

// Data files are served from public/data/ (symlinked to /data/ at repo root).
// These JSON files live at stable URLs and change out-of-band from the hashed
// JS bundle (e.g. when the draw is run), so without cache-busting the browser
// keeps serving a stale copy. Append a per-load query param and bypass the
// HTTP cache so the latest data always shows after a deploy.
async function fetchJson<T>(path: string): Promise<T> {
  const base = import.meta.env.BASE_URL
  const r = await fetch(`${base}data/${path}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Failed to load ${path}`)
  return r.json()
}

export const loadPlayers = () => fetchJson<string[]>('players.json')
export const loadTeams = () => fetchJson<Team[]>('teams.json')
export const loadDraw = () => fetchJson<DrawResult>('draw.json')
export const loadScores = () => fetchJson<ScoresData>('scores.json')
