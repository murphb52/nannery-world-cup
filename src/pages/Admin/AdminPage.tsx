import { useState, useEffect } from 'react'
import AdminDraw from './AdminDraw'
import AdminPlayers from './AdminPlayers'
import AdminTeams from './AdminTeams'
import { getPat, setPat } from '../../lib/github'

const PASSPHRASE = 'nannery2026'
const ADMIN_TABS = ['Draw', 'Players', 'Teams'] as const
type AdminTab = typeof ADMIN_TABS[number]

function masked(token: string) {
  if (!token) return ''
  return token.slice(0, 7) + '••••••••••••••••' + token.slice(-4)
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<AdminTab>('Draw')
  const [overriding, setOverriding] = useState(false)
  const [overrideVal, setOverrideVal] = useState('')

  const bakedPat = import.meta.env.VITE_GITHUB_PAT as string | undefined
  const sessionPat = getPat() !== bakedPat ? getPat() : ''
  const activePat = getPat()

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

  function applyOverride() {
    setPat(overrideVal)
    setOverriding(false)
    setOverrideVal('')
  }

  function clearOverride() {
    if (bakedPat) setPat(bakedPat)
    else sessionStorage.removeItem('admin_pat')
    setOverriding(false)
    setOverrideVal('')
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

      {/* GitHub token */}
      <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`text-lg shrink-0 ${activePat ? 'text-green-400' : 'text-red-400'}`}>
              {activePat ? '✓' : '⚠'}
            </span>
            {overriding ? (
              <input
                type="password"
                value={overrideVal}
                onChange={e => setOverrideVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyOverride()}
                placeholder="ghp_xxxxxxxxxxxx"
                autoFocus
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 border border-yellow-400/30 text-white placeholder-white/30 text-sm focus:outline-none"
              />
            ) : (
              <div>
                <p className="text-sm text-white/70 font-medium">
                  {activePat ? masked(activePat) : 'No GitHub token set'}
                </p>
                <p className="text-xs text-white/30 mt-0.5">
                  {sessionPat ? 'Using session override' : bakedPat ? 'Baked in at build time' : 'Set a token to enable saves'}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            {overriding ? (
              <>
                <button onClick={applyOverride} className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs font-medium hover:bg-yellow-500/30 transition-all">Apply</button>
                <button onClick={() => { setOverriding(false); setOverrideVal('') }} className="px-3 py-1.5 rounded-lg border border-white/20 text-white/50 text-xs hover:text-white transition-all">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setOverriding(true)} className="px-3 py-1.5 rounded-lg border border-white/20 text-white/50 text-xs hover:text-white transition-all">
                  {activePat ? 'Override' : 'Set token'}
                </button>
                {sessionPat && (
                  <button onClick={clearOverride} className="px-3 py-1.5 rounded-lg border border-white/20 text-white/30 text-xs hover:text-white/60 transition-all">Clear override</button>
                )}
              </>
            )}
          </div>
        </div>
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
