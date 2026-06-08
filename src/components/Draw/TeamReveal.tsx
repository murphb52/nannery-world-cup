import { useEffect, useState } from 'react'
import type { Team } from '../../types'

interface Props {
  team: Team
}

export default function TeamReveal({ team }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [team.id])

  return (
    <div className={`flex flex-col items-center gap-3 transition-all duration-700 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
      <img
        src={team.flag}
        alt={team.name}
        className="w-32 h-20 object-cover rounded-lg shadow-2xl border border-white/20"
      />
      <div className="text-center">
        <p className="text-2xl font-bold text-yellow-400">{team.name}</p>
        <p className="text-white/50 text-sm">Group {team.group}</p>
      </div>
    </div>
  )
}
