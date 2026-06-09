import { useState, useEffect } from 'react'
import { loadPlayers } from '../../data/loaders'
import { githubCommit, getPat } from '../../lib/github'
import type { Player } from '../../types'

export default function AdminPlayers() {
  const [players, setPlayers] = useState<Player[]>([])
  const [edited, setEdited] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    loadPlayers().then(p => {
      setPlayers(p)
      setEdited([...p])
      setLoading(false)
    })
  }, [])

  function update(i: number, name: string) {
    const next = [...edited]
    next[i] = { ...next[i], name }
    setEdited(next)
    setDirty(true)
  }

  async function save() {
    const pat = getPat()
    if (!pat) { setMsg('⚠ No GitHub PAT set'); return }
    setSaving(true)
    setMsg('')
    try {
      await githubCommit(pat, 'data/players.json', edited, 'chore: update player list')
      setPlayers([...edited])
      setDirty(false)
      setMsg('✓ Saved to GitHub')
    } catch (e: unknown) {
      setMsg(`⚠ ${e instanceof Error ? e.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  function reset() { setEdited([...players]); setDirty(false); setMsg('') }

  if (loading) return <div className="text-white/40 animate-pulse">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Player List</h3>
          <p className="text-white/40 text-xs mt-0.5">{edited.length} players · IDs are fixed, names only</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-sm ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
          {dirty && <button onClick={reset} className="text-sm text-white/40 hover:text-white transition-colors">Reset</button>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-5 py-2 rounded-xl bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-sm font-medium hover:bg-yellow-500/30 disabled:opacity-40 transition-all"
          >
            {saving ? 'Saving…' : 'Save to GitHub'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {edited.map((player, i) => (
          <div key={player.id} className="flex items-center gap-2">
            <span className="text-white/20 text-xs w-6 text-right shrink-0">{i + 1}</span>
            <input
              type="text"
              value={player.name}
              onChange={e => update(i, e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-yellow-400/50 transition-colors"
            />
            <span className="text-white/20 text-xs shrink-0 font-mono">{player.id}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
