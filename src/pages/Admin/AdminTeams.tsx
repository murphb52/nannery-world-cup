import { useState, useEffect } from 'react'
import { loadTeams } from '../../data/loaders'
import { githubCommit, getPat } from '../../lib/github'
import type { Team } from '../../types'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

export default function AdminTeams() {
  const [teams, setTeams] = useState<Team[]>([])
  const [edited, setEdited] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    loadTeams().then(t => {
      setTeams(t)
      setEdited(t.map(x => ({ ...x })))
      setLoading(false)
    })
  }, [])

  function update(i: number, field: keyof Team, value: string) {
    const next = edited.map((t, idx) => idx === i ? { ...t, [field]: value } : t)
    setEdited(next)
    setDirty(true)
  }

  async function save() {
    const pat = getPat()
    if (!pat) { setMsg('⚠ No GitHub PAT set'); return }
    setSaving(true)
    setMsg('')
    try {
      await githubCommit(pat, 'data/teams.json', edited, 'chore: update teams data')
      setTeams(edited.map(x => ({ ...x })))
      setDirty(false)
      setMsg('✓ Saved to GitHub')
    } catch (e: unknown) {
      setMsg(`⚠ ${e instanceof Error ? e.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  function reset() { setEdited(teams.map(x => ({ ...x }))); setDirty(false); setMsg('') }

  if (loading) return <div className="text-white/40 animate-pulse">Loading…</div>

  // Group teams by group for display
  const byGroup = GROUPS.map(g => ({ group: g, teams: edited.map((t, i) => ({ t, i })).filter(({ t }) => t.group === g) }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Teams & Groups</h3>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {byGroup.map(({ group, teams: groupTeams }) => (
          <div key={group} className="rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 bg-gradient-to-r from-yellow-500/20 to-red-500/20 border-b border-white/10">
              <span className="text-yellow-400 font-bold text-sm uppercase tracking-wider">Group {group}</span>
            </div>
            <div className="divide-y divide-white/5">
              {groupTeams.map(({ t, i }) => (
                <div key={t.id} className="px-3 py-2 flex items-center gap-2">
                  <img src={t.flag} alt="" className="w-8 h-5 object-cover rounded shrink-0" />
                  <input
                    type="text"
                    value={t.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none border-b border-transparent focus:border-yellow-400/50 transition-colors"
                  />
                  <select
                    value={t.group}
                    onChange={e => update(i, 'group', e.target.value)}
                    className="bg-gray-800 border border-white/10 rounded px-1.5 py-0.5 text-white/60 text-xs focus:outline-none focus:border-yellow-400/30"
                  >
                    {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
