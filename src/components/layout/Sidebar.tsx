import { NavLink } from 'react-router-dom'
import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, LayoutDashboard, School, Settings2, Users } from 'lucide-react'
import type { UserRole } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/lessons', label: 'Lessons', icon: BookOpen },
  { to: '/assignments', label: 'Assignments', icon: ClipboardCheck },
  { to: '/contributions', label: 'Notes', icon: GraduationCap },
  { to: '/classroom', label: 'Classroom', icon: School },
  { to: '/members', label: 'Members', icon: Users, roles: ['teacher', 'admin'] },
]

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { membership, classroom } = useAuth()
  const role: UserRole = membership?.role ?? 'student'
  return <>
    {open && <button className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden" aria-label="Close navigation" onClick={onNavigate} />}
    <aside className={`fixed bottom-0 left-0 top-16 z-20 w-64 border-r border-slate-200 bg-white px-4 py-6 transition-transform lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-6 px-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p><p className="mt-2 truncate text-sm font-semibold text-slate-800">{classroom?.name ?? 'Classroom'}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Preview content</p></div>
      <nav aria-label="Main navigation" className="space-y-1">{links.filter((link) => !link.roles || link.roles.includes(role)).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${isActive ? 'bg-[#102a43] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><Icon size={17} strokeWidth={1.8} /><span>{to === '/contributions' ? role === 'student' ? 'My notes' : 'Note review' : label}</span></NavLink>)}</nav>
      <div className="absolute bottom-6 left-4 right-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-semibold text-slate-700"><CalendarDays size={15} className="text-cyan-700" /> Stay caught up</p><p className="mt-2 text-xs leading-5 text-slate-500">Lessons, notes, and deadlines in one calm place.</p><NavLink to="/classroom" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-800">Classroom details <Settings2 size={13} /></NavLink></div>
    </aside>
  </>
}
