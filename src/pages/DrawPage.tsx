import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DrawCeremony from '../components/Draw/DrawCeremony'
import { loadPlayers, loadTeams, loadDraw } from '../data/loaders'
import type { Team, DrawResult, Player } from '../types'

type AppState = 'loading' | 'already-drawn' | 'mode-select' | 'drawing' | 'done'

const SPEEDS = [
  { label: '0.5×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '5×', value: 5 },
]

export default function DrawPage() {
  const navigate = useNavigate()
  const [appState, setAppState] = useState<AppState>('loading')
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [autoPlay, setAutoPlay] = useState(false)
  const [githubPat, setGithubPat] = useState('')
  const [showPatInput, setShowPatInput] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    Promise.all([loadPlayers(), loadTeams(), loadDraw()]).then(([p, t, draw]) => {
      setPlayers(p)
      setTeams(t)
      if (Object.keys(draw).length > 0) {
        setAppState('already-drawn')
      } else {
        setAppState('mode-select')
      }
    })
  }, [])

  async function saveDraw(result: DrawResult) {
    if (!isLiveMode) return
    setSaveStatus('saving')
    try {
      const content = btoa(JSON.stringify(result, null, 2))
      const repoOwner = 'murphb52'
      const repoName = 'nannery-world-cup'
      const path = 'data/draw.json'

      // Get current file SHA first
      const getRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`,
        { headers: { Authorization: `Bearer ${githubPat}`, Accept: 'application/vnd.github+json' } }
      )
      const current = await getRes.json()

      await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${githubPat}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'feat: save draw results',
            content,
            sha: current.sha,
          }),
        }
      )
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  function handleComplete(result: DrawResult) {
    saveDraw(result)
    setAppState('done')
    setTimeout(() => navigate('/groups'), 4000)
  }

  if (appState === 'loading') {
    return <PageCenter><div className="text-white/50 animate-pulse">Loading draw data…</div></PageCenter>
  }

  if (appState === 'already-drawn') {
    return (
      <PageCenter>
        <div className="text-center">
          <div className="text-5xl mb-4">🎲</div>
          <h2 className="text-2xl font-bold text-white mb-2">Draw already completed</h2>
          <p className="text-white/50 mb-6">The Nannery World Cup draw has been locked in.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/groups')} className="px-6 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:opacity-90 transition-all">
              View Groups
            </button>
            <button onClick={() => setAppState('mode-select')} className="px-6 py-3 rounded-xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all">
              Re-run Draw
            </button>
          </div>
        </div>
      </PageCenter>
    )
  }

  if (appState === 'mode-select') {
    return (
      <PageCenter>
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-6">🏆</div>
          <h1 className="text-3xl font-bold text-white mb-2">Nannery World Cup Draw</h1>
          <p className="text-white/50 mb-8">2026 FIFA World Cup · 48 Teams · 48 Players</p>

          <div className="grid grid-cols-2 gap-4 mb-8">
            {[
              { live: false, title: 'Test Mode', desc: 'Full ceremony, results not saved', icon: '🧪' },
              { live: true, title: 'Live Mode', desc: 'Ceremonial draw, results saved to repo', icon: '🎬' },
            ].map(({ live, title, desc, icon }) => (
              <button
                key={String(live)}
                onClick={() => { setIsLiveMode(live); setShowPatInput(live) }}
                className={`p-5 rounded-2xl border-2 text-left transition-all ${
                  isLiveMode === live && (live ? true : !showPatInput)
                    ? 'border-yellow-400 bg-yellow-400/10'
                    : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="text-3xl mb-2">{icon}</div>
                <div className="font-bold text-white">{title}</div>
                <div className="text-xs text-white/50 mt-1">{desc}</div>
              </button>
            ))}
          </div>

          {showPatInput && (
            <div className="mb-6 text-left">
              <label className="block text-sm text-white/60 mb-2">
                GitHub Personal Access Token <span className="text-white/30">(repo write access)</span>
              </label>
              <input
                type="password"
                value={githubPat}
                onChange={e => setGithubPat(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-yellow-400/50"
              />
              <p className="text-xs text-white/30 mt-2">Held in memory only — never stored or transmitted except to GitHub API</p>
            </div>
          )}

          {/* Speed */}
          <div className="mb-6">
            <p className="text-sm text-white/50 mb-3">Auto-advance speed</p>
            <div className="flex gap-2 justify-center">
              {SPEEDS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSpeed(s.value)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                    speed === s.value ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30' : 'border border-white/20 text-white/60 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setAutoPlay(false); setAppState('drawing') }}
              disabled={isLiveMode && !githubPat}
              className="flex-1 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-black font-bold text-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              🎲 Manual Draw
            </button>
            <button
              onClick={() => { setAutoPlay(true); setAppState('drawing') }}
              disabled={isLiveMode && !githubPat}
              className="flex-1 py-4 rounded-xl border border-white/20 text-white font-bold text-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              ▶ Auto Play
            </button>
          </div>
        </div>
      </PageCenter>
    )
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">
          {isLiveMode ? '🎬 Live Draw' : '🧪 Test Draw'}
        </h2>
        <div className="flex items-center gap-3">
          {saveStatus === 'saving' && <span className="text-yellow-400 text-sm animate-pulse">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-green-400 text-sm">✓ Saved</span>}
          {saveStatus === 'error' && <span className="text-red-400 text-sm">⚠ Save failed</span>}
          <button
            onClick={() => setAutoPlay(p => !p)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
              autoPlay ? 'border-yellow-400/50 text-yellow-400 bg-yellow-400/10' : 'border-white/20 text-white/60 hover:text-white'
            }`}
          >
            {autoPlay ? '⏸ Pause' : '▶ Auto Play'}
          </button>
          <div className="flex gap-1">
            {SPEEDS.map(s => (
              <button
                key={s.value}
                onClick={() => setSpeed(s.value)}
                className={`px-2 py-1 rounded text-xs transition-all ${speed === s.value ? 'text-yellow-400' : 'text-white/30 hover:text-white/60'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <DrawCeremony
        players={players}
        teams={teams}
        onComplete={handleComplete}
        isLiveMode={isLiveMode}
        speedMultiplier={speed}
        autoPlay={autoPlay}
      />
    </div>
  )
}

function PageCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      {children}
    </div>
  )
}
