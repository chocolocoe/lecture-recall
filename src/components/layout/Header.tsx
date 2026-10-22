import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, LogOut, Menu, Settings, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function Header({ onMenuClick, onSettingsClick }: { onMenuClick: () => void; onSettingsClick: () => void }) {
  const { profile, membership, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const name = profile?.display_name || profile?.full_name || profile?.username || 'Classroom member'
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleSignOut() {
    setError('')
    const result = await signOut()
    if (result.error) setError('Could not sign out. Please try again.')
    else {
      setOpen(false)
      navigate('/login', { replace: true })
    }
  }

  return <header className="sticky top-0 z-30 border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
    <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-600 lg:hidden" onClick={onMenuClick} aria-label="Toggle navigation"><Menu size={20} /></button><Link to="/" className="flex items-center gap-2.5 text-slate-900"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#102a43] text-cyan-300"><BookOpen size={19} /></span><span className="text-[15px] font-bold tracking-tight">Lecture Recall</span></Link></div>
    <div className="relative" ref={menuRef}><button ref={triggerRef} type="button" onClick={() => setOpen((current) => !current)} className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-cyan-600" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={open}><span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-900">{initials}</span><span className="hidden max-w-40 sm:block"><span className="block truncate text-xs font-semibold text-slate-800">{name}</span><span className="block text-[10px] text-slate-500">{membership?.role === 'admin' ? 'Administrator' : membership?.role}</span></span><ChevronDown size={15} className="text-slate-500" /></button>
      {open && <div role="menu" aria-label="Profile menu" className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"><Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><UserRound size={16} /> Profile</Link><button role="menuitem" type="button" onClick={() => { setOpen(false); onSettingsClick() }} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Settings size={16} /> Settings</button><div className="my-1 border-t border-slate-100" /><button role="menuitem" type="button" onClick={() => void handleSignOut()} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-rose-700 hover:bg-rose-50"><LogOut size={16} /> Sign out</button></div>}
    </div>
  </div>{error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-center text-xs text-rose-800">{error}</p>}</header>
}
