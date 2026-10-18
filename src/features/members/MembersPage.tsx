import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, Users, X } from 'lucide-react'
import { useCurrentRole } from '@/app/RoleContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PageHeading } from '@/components/ui/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Membership, Profile } from '@/types'

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
type Member = { profile: Profile; membership: Membership }

export function MembersPage() {
  const { classroom } = useAuth()
  const role = useCurrentRole()
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [inviteRole, setInviteRole] = useState<'student' | 'teacher'>('student')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadMembers = useCallback(async () => {
    if (!supabase || !classroom) return
    setLoading(true)
    setLoadError('')
    const { data: membershipRows, error: membershipError } = await supabase.from('memberships')
      .select('*').eq('classroom_id', classroom.id).order('joined_at')
    if (membershipError) {
      setLoadError(membershipError.message)
      setMembers([])
      setLoading(false)
      return
    }
    if (!membershipRows?.length) {
      setMembers([])
      setLoading(false)
      return
    }
    const { data: profiles, error: profileError } = await supabase.from('profiles')
      .select('*').in('id', membershipRows.map((item) => item.user_id))
    if (profileError) {
      setLoadError(profileError.message)
      setMembers([])
    } else {
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      setMembers(membershipRows.flatMap((membership) => {
        const profile = profileById.get(membership.user_id)
        return profile ? [{ profile, membership }] : []
      }))
    }
    setLoading(false)
  }, [classroom])

  useEffect(() => { void loadMembers() }, [loadMembers])
  const visibleMembers = useMemo(() => members.filter(({ profile, membership }) =>
    (profile.full_name + ' ' + profile.email + ' ' + membership.role).toLowerCase().includes(query.toLowerCase()),
  ), [members, query])

  async function sendInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!supabase || !classroom) {
      setError('Supabase is not configured or your classroom could not be verified.')
      return
    }
    setPending(true)
    const { data, error: functionError } = await supabase.functions.invoke<{ error?: string; message?: string }>('invite-member', {
      body: { email, fullName, role: inviteRole, classroomId: classroom.id },
    })
    setPending(false)
    if (functionError) {
      setError(functionError.message)
      return
    }
    if (data?.error) {
      setError(data.error)
      return
    }
    setSuccess(data?.message || 'Invitation sent.')
    setEmail('')
    setFullName('')
    setInviteRole('student')
    setInviteOpen(false)
    await loadMembers()
  }

  return <>
    <PageHeading eyebrow="Class directory" title="Members" description={'Members of ' + (classroom?.name ?? 'your classroom') + '.'} action={role === 'admin' ? <Button onClick={() => { setError(''); setSuccess(''); setInviteOpen(true) }}><UserPlus size={16} /> Invite member</Button> : undefined} />
    {success && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    {loadError && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Member list could not be loaded: {loadError}</p>}
    {error && !inviteOpen && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <Card className="!p-0"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Class members <span className="ml-1 text-xs font-medium text-slate-400">{loading ? 'â€¦' : visibleMembers.length}</span></h2><p className="mt-1 text-xs text-slate-500">Directory access is restricted to your classroom.</p></div><div className="relative sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input aria-label="Search members" placeholder="Search membersâ€¦" value={query} onChange={(event) => setQuery(event.target.value)} className="py-2 pl-9" /></div></div>      {loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">Loading membersâ€¦</p> : <div className="divide-y divide-slate-100">{visibleMembers.map(({ profile, membership }) => <div key={membership.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-900">{initials(profile.display_name || profile.full_name)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{profile.display_name || profile.full_name}</p><p className="truncate text-xs text-slate-500">{profile.email}</p></div><span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (membership.role === 'admin' ? 'bg-violet-50 text-violet-800' : membership.role === 'teacher' ? 'bg-cyan-50 text-cyan-900' : 'bg-slate-100 text-slate-700')}>{membership.role === 'admin' ? 'Administrator' : membership.role}</span></div>)}{!visibleMembers.length && <div className="p-10 text-center"><Users size={23} className="mx-auto text-slate-300" /><p className="mt-2 text-sm text-slate-500">{loadError ? 'Members are unavailable.' : 'No members match this search.'}</p></div>}</div>}    </Card>    {inviteOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setInviteOpen(false) }}><section role="dialog" aria-modal="true" aria-labelledby="invite-member-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="invite-member-title" className="text-lg font-bold text-slate-900">Invite to {classroom?.name}</h2><p className="mt-1 text-sm text-slate-500">They will receive an email to set a password and join this classroom.</p></div><button aria-label="Close invitation" disabled={pending} onClick={() => setInviteOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
      <form onSubmit={sendInvitation} className="space-y-4"><Input id="invite-email" type="email" label="Email address" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} /><Input id="invite-name" label="Full name" autoComplete="off" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /><div><label htmlFor="invite-role" className="mb-1.5 block text-sm font-medium text-slate-700">Classroom role</label><select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'student' | 'teacher')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="student">Student</option><option value="teacher">Teacher</option></select><p className="mt-1.5 text-xs text-slate-500">Administrators cannot create another administrator.</p></div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={pending} onClick={() => setInviteOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Sendingâ€¦' : 'Send invitation'}</Button></div>
      </form></section></div>}
  </>
}
