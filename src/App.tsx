import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import GroupsPage from './pages/GroupsPage'
import FixturesPage from './pages/FixturesPage'
import KnockoutPage from './pages/KnockoutPage'
import PrizesPage from './pages/PrizesPage'
import PlayersPage from './pages/PlayersPage'
import AdminPage from './pages/Admin/AdminPage'
import StatsPage from './pages/StatsPage'
import { SweepstakesProvider, useSweepstakes } from './contexts/SweepstakesContext'
import { SWEEPSTAKES } from './config/sweepstakes'

function SweepstakesSwitcher() {
  const { sweepstakesId } = useParams<{ sweepstakesId: string }>()
  const { config } = useSweepstakes()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const others = Object.values(SWEEPSTAKES).filter(s => s.id !== sweepstakesId)
  if (others.length === 0) return null

  // Preserve sub-path (e.g. /groups, /fixtures) when switching
  const subPath = location.pathname.replace(`/${sweepstakesId}`, '') || '/groups'

  return (
    <div ref={ref} className="relative ml-auto shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-all border border-white/10"
      >
        <span className="hidden sm:inline">{config.name}</span>
        <span className="sm:hidden">↔</span>
        <span className="text-white/30">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 min-w-44">
          <div className="px-3 py-2 text-xs text-white/30 border-b border-white/10">Switch sweepstakes</div>
          {Object.values(SWEEPSTAKES).map(s => (
            <a
              key={s.id}
              href={`#/${s.id}${subPath}`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                s.id === sweepstakesId
                  ? 'text-yellow-400 bg-yellow-400/10'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {s.id === sweepstakesId && <span className="text-yellow-400">✓</span>}
              {s.id !== sweepstakesId && <span className="w-4" />}
              {s.name}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function Nav() {
  const { sweepstakesId } = useParams<{ sweepstakesId: string }>()
  const { config } = useSweepstakes()
  const navigate = useNavigate()
  const [clicks, setClicks] = useState(0)

  function handleLogoClick() {
    const next = clicks + 1
    setClicks(next)
    if (next >= 5) { navigate(`/${sweepstakesId}/admin`); setClicks(0) }
    setTimeout(() => setClicks(c => Math.max(0, c - 1)), 2000)
  }

  const base = `/${sweepstakesId}`

  return (
    <nav className="border-b border-white/10 sticky top-0 z-50 backdrop-blur-md bg-black/40">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 h-14">
        <button
          onClick={handleLogoClick}
          className="text-base sm:text-xl font-bold mr-2 sm:mr-4 bg-gradient-to-r from-yellow-400 to-red-500 bg-clip-text text-transparent cursor-pointer select-none whitespace-nowrap shrink-0"
        >
          🏆 {config.name}
        </button>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 flex-1 min-w-0">
          {[
            { to: `${base}/groups`, label: 'Groups' },
            { to: `${base}/fixtures`, label: 'Fixtures' },
            { to: `${base}/bracket`, label: 'Bracket' },
            { to: `${base}/players`, label: 'Players' },
            { to: `${base}/prizes`, label: 'Prizes' },
            { to: `${base}/stats`, label: 'Stats' },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
        <SweepstakesSwitcher />
      </div>
    </nav>
  )
}

function SweepstakesLayout() {
  const { config } = useSweepstakes()
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1117 50%, #0a1628 100%)' }}>
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route index element={<Navigate to="groups" replace />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="fixtures" element={<FixturesPage />} />
          <Route path="bracket" element={<KnockoutPage />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="prizes" element={<PrizesPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Routes>
      </main>
      <footer className="border-t border-white/10 text-center text-white/30 text-xs py-4">
        {config.name} {config.year} · Data via football-data.org
      </footer>
    </div>
  )
}

function SweepstakesRoot() {
  return (
    <SweepstakesProvider>
      <SweepstakesLayout />
    </SweepstakesProvider>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/nannery/groups" replace />} />
        <Route path="/:sweepstakesId/*" element={<SweepstakesRoot />} />
      </Routes>
    </HashRouter>
  )
}
