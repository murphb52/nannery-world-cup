import { useEffect, useState } from 'react'

interface Props {
  name: string
}

export default function NameReveal({ name }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [name])

  return (
    <div className={`text-center transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <p className="text-white/50 text-sm uppercase tracking-widest mb-2">Drawing...</p>
      <p className="text-4xl font-bold text-white">{name}</p>
    </div>
  )
}
