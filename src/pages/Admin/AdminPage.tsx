import { useState, useEffect } from 'react'
import AdminDraw from './AdminDraw'
import AdminPlayers from './AdminPlayers'
import AdminTeams from './AdminTeams'
import { getPat, setPat } from '../../lib/github'

const PASSPHRASE = 'nannery2026'
const ADMIN_TABS = ['Draw', 'Players', 'Teams'] as const
type AdminTab = typeof ADMIN_TABS[number]

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<AdminTab>('Draw')
  const [pat, setPatState] = useState(getPat())
  const [patSaved, setPatSaved] = useState(!!getPat())

  useEffect(() => {
    setAuthed(sessionStorage.getItem('admin_authed') === '1')
  }, [])

  function login() {
    if (input === PASSPHRASE) {
      sessionStorage.setItem('admin_authed', '1')
      setAuthed(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  function savePat(p: string) {
    setPat(p)
    setPatState(p)
    setPatSaved(true)
  }

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🔐</div>
            <h2 className="text-2xl font-bold text-white">Admin Access</h2>
            <p className="text-white/40 text-sm mt-1">Nannery World Cup</p>
          </div>
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="Enter passphrase"
            className={`w-full px-4 py-3 rounded-xl bg-white/10 border text-white placeholder-white/30 focus:outline-none mb-3 transition-colors ${
              error ? 'border-red-500/60' : 'border-white/20 focus:border-yellow-400/50'
            }`}
          />
          {error && <p className="text-red-400 text-sm mb-3">Incorrect passphrase</p>}
          <button
            onClick={login}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-black font-bold hover:opacity-90 transition-all"
          >
            Enter
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin</h1>
          <p className="text-white/40 text-sm mt-1">Nannery World Cup 2026</p>
        </div>
        <button
          onClick={() => { sessionStorage.removeItem('admin_authed'); setAuthed(false) }}
          className="px-4 py-2 rounded-lg border border-white/20 text-white/50 hover:text-white hover:border-white/40 text-sm transition-all"
        >
          Log out
        </button>
      </div>

      {/* GitHub PAT */}
      <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
        <p className="text-sm font-medium text-white/70 mb-2">GitHub Personal Access Token <span className="text-white/30">(required to save changes)</span></p>
        <div className="flex gap-2">
          <input
            type="password"
            value={pat}
            onChange={e => { setPatState(e.target.value); setPatSaved(false) }}
            placeholder="ghp_xxxxxxxxxxxx"
            className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-yellow-400/50"
          />
          <button
            onClick={() => savePat(pat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              patSaved ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
            }`}
          >
            {patSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-white/25 mt-1">Stored in session only — cleared when you close the tab</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-0">
        {ADMIN_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === t
                ? 'border-yellow-400 text-yellow-400'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Draw' && <AdminDraw />}
      {tab === 'Players' && <AdminPlayers />}
      {tab === 'Teams' && <AdminTeams />}
    </div>
  )
}
