import { useState } from 'react'
import { BookOpen, LogOut, Menu } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, profile, membership, signOut } = useAuth()
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const name = profile?.display_name || profile?.full_name || user?.email || 'Classroom member'
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  async function handleSignOut() {
    setError('')
    const result = await signOut()
    if (result.error) setError(result.error.message)
    else navigate('/login', { replace: true })
  }

  return <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
    <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 lg:hidden" onClick={onMenuClick} aria-label="Toggle navigation"><Menu size={20} /></button><Link to="/" className="flex items-center gap-2.5 text-slate-900"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#102a43] text-cyan-300"><BookOpen size={19} /></span><span className="text-[15px] font-bold tracking-tight">Lecture Recall</span></Link></div>
    <div className="flex items-center gap-2 sm:gap-3"><span className="hidden rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 sm:inline-flex">DEMO DATA</span><div className="hidden text-right sm:block"><p className="max-w-40 truncate text-xs font-semibold text-slate-800">{name}</p><p className="text-[10px] capitalize text-slate-500">{membership?.role === 'admin' ? 'Administrator' : membership?.role}</p></div><div aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-800">{initials}</div><button type="button" onClick={() => void handleSignOut()} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100" aria-label="Sign out"><LogOut size={15} /><span className="hidden sm:inline">Sign out</span></button></div>
  </div>{error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-center text-xs text-rose-800">Could not sign out: {error}</p>}</header>
}
