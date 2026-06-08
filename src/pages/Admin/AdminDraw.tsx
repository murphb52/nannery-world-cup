import { useState, useEffect } from 'react'
import { loadTeams, loadDraw, loadPlayers } from '../../data/loaders'
import { githubCommit, getPat } from '../../lib/github'
import DrawCeremony from '../../components/Draw/DrawCeremony'
import type { Team, DrawResult } from '../../types'

type View = 'dashboard' | 'ceremony'

export default function AdminDraw() {
  const [view, setView] = useState<View>('dashboard')
  const [players, setPlayers] = useState<string[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [editPairing, setEditPairing] = useState<{ teamId: string; player: string } | null>(null)

  useEffect(() => {
    Promise.all([loadPlayers(), loadTeams(), loadDraw()]).then(([p, t, d]) => {
      setPlayers(p)
      setTeams(t)
      setDraw(d)
      setLoading(false)
    })
  }, [])

  async function save(data: DrawResult, msg: string) {
    const pat = getPat()
    if (!pat) { setSaveMsg('⚠ No GitHub PAT set above'); return }
    setSaving(true)
    setSaveMsg('')
    try {
      await githubCommit(pat, 'data/draw.json', data, msg)
      setDraw(data)
      setSaveMsg('✓ Saved to GitHub')
    } catch (e: unknown) {
      setSaveMsg(`⚠ ${e instanceof Error ? e.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  async function clearDraw() {
    if (!confirm('Clear all draw results? This cannot be undone.')) return
    await save({}, 'chore: clear draw results')
  }

  async function applyEdit() {
    if (!editPairing) return
    const updated = { ...draw, [editPairing.teamId]: editPairing.player }
    await save(updated, `chore: reassign ${editPairing.teamId} to ${editPairing.player}`)
    setEditPairing(null)
  }

  async function handleDrawComplete(result: DrawResult) {
    await save(result, 'feat: save live draw results')
    setView('dashboard')
  }

  if (loading) return <div className="text-white/40 animate-pulse">Loading…</div>

  const drawDone = Object.keys(draw).length > 0
  const unassigned = players.filter(p => !Object.values(draw).includes(p))

  if (view === 'ceremony') {
    return (
      <div>
        <button onClick={() => setView('dashboard')} className="mb-6 text-white/50 hover:text-white text-sm flex items-center gap-2 transition-colors">
          ← Back to Draw admin
        </button>
        <DrawCeremony
          players={players}
          teams={teams}
          onComplete={handleDrawComplete}
          isLiveMode={true}
          speedMultiplier={1}
          autoPlay={false}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status + actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Teams', value: teams.length },
          { label: 'Players', value: players.length },
          { label: 'Assigned', value: Object.keys(draw).length },
          { label: 'Unassigned', value: Math.max(0, players.length - Object.keys(draw).length) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-white/40 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setView('ceremony')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-black font-bold text-sm hover:opacity-90 transition-all"
        >
          🎲 {drawDone ? 'Re-run Draw Ceremony' : 'Run Draw Ceremony'}
        </button>
        {drawDone && (
          <button
            onClick={clearDraw}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 disabled:opacity-40 transition-all"
          >
            🗑 Clear Draw
          </button>
        )}
        {saveMsg && <span className={`self-center text-sm ${saveMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{saveMsg}</span>}
      </div>

      {/* Draw table */}
      {drawDone ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Draw Results</h3>
            <span className="text-xs text-white/40">{Object.keys(draw).length} pairings</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="text-white/30 text-xs uppercase border-b border-white/10">
                  <th className="text-left px-4 py-2">Team</th>
                  <th className="text-left px-4 py-2">Group</th>
                  <th className="text-left px-4 py-2">Player</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {Object.entries(draw).map(([teamId, player]) => {
                  const team = teams.find(t => t.id === teamId)
                  return (
                    <tr key={teamId} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {team && <img src={team.flag} alt="" className="w-7 h-4 object-cover rounded" />}
                          <span className="text-white">{team?.name ?? teamId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-white/50">Group {team?.group ?? '?'}</td>
                      <td className="px-4 py-2.5">
                        {editPairing?.teamId === teamId ? (
                          <select
                            value={editPairing.player}
                            onChange={e => setEditPairing({ teamId, player: e.target.value })}
                            className="bg-gray-800 border border-yellow-400/30 rounded px-2 py-1 text-white text-sm focus:outline-none"
                          >
                            {players.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        ) : (
                          <span className="text-yellow-400">{player}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {editPairing?.teamId === teamId ? (
                          <div className="flex gap-2 justify-end">
                            <button onClick={applyEdit} disabled={saving} className="text-green-400 text-xs hover:text-green-300">Save</button>
                            <button onClick={() => setEditPairing(null)} className="text-white/30 text-xs hover:text-white/60">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditPairing({ teamId, player })} className="text-white/30 text-xs hover:text-yellow-400 transition-colors">Edit</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/20 p-8 text-center text-white/30">
          No draw results yet — run the Draw Ceremony to assign teams to players.
        </div>
      )}

      {/* Unassigned players */}
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-yellow-400 text-sm font-medium mb-2">⚠ Unassigned players ({unassigned.length})</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(p => <span key={p} className="px-2 py-1 rounded bg-white/10 text-white/60 text-xs">{p}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
