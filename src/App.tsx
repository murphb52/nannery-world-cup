import { HashRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import GroupsPage from './pages/GroupsPage'
import FixturesPage from './pages/FixturesPage'
import KnockoutPage from './pages/KnockoutPage'
import PrizesPage from './pages/PrizesPage'
import PlayersPage from './pages/PlayersPage'
import AdminPage from './pages/Admin/AdminPage'
import StatsPage from './pages/StatsPage'

function Nav() {
  const navigate = useNavigate()
  const [clicks, setClicks] = useState(0)

  function handleLogoClick() {
    const next = clicks + 1
    setClicks(next)
    if (next >= 5) { navigate('/admin'); setClicks(0) }
    setTimeout(() => setClicks(c => Math.max(0, c - 1)), 2000)
  }

  return (
    <nav className="border-b border-white/10 sticky top-0 z-50 backdrop-blur-md bg-black/40">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 h-14">
        <button
          onClick={handleLogoClick}
          className="text-base sm:text-xl font-bold mr-2 sm:mr-6 bg-gradient-to-r from-yellow-400 to-red-500 bg-clip-text text-transparent cursor-pointer select-none whitespace-nowrap shrink-0"
        >
          🏆 Nannery World Cup
        </button>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          {[
            { to: '/groups', label: 'Groups' },
            { to: '/fixtures', label: 'Fixtures' },
            { to: '/bracket', label: 'Bracket' },
            { to: '/players', label: 'Players' },
            { to: '/prizes', label: 'Prizes' },
            { to: '/stats', label: 'Stats' },
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
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1117 50%, #0a1628 100%)' }}>
        <Nav />

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<GroupsPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/fixtures" element={<FixturesPage />} />
            <Route path="/bracket" element={<KnockoutPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/prizes" element={<PrizesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>

        <footer className="border-t border-white/10 text-center text-white/30 text-xs py-4">
          Nannery World Cup 2026 · Data via football-data.org
        </footer>
      </div>
    </HashRouter>
  )
}
