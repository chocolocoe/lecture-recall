import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Pencil, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useCurrentRole } from '@/app/RoleContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PageHeading } from '@/components/ui/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Membership, Profile, UserRole } from '@/types'
import { PermissionManager } from '@/features/members/PermissionManager'

type Member = { profile: Profile; membership: Membership }
type MemberDraft = { username: string; fullName: string; displayName: string; role: UserRole }
type Dialog = { kind: 'create' } | { kind: 'edit' | 'reset' | 'delete'; member: Member }
const roles: UserRole[] = ['student', 'teacher', 'admin']
const roleName = (role: UserRole) => role === 'admin' ? 'Administrator' : role[0].toUpperCase() + role.slice(1)
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))

async function safeFunctionError(error: Error | null, fallback: string) {
  if (!error) return fallback
  const response = (error as Error & { context?: Response }).context
  if (response?.status === 401) return 'Your session expired. Sign in again and retry.'
  if (response && response.status >= 400 && response.status < 500) {
    try {
      const payload = await response.json() as { error?: unknown }
      if (typeof payload.error === 'string') return payload.error
    } catch { /* use the safe fallback below */ }
  }
  return fallback
}

export function MembersPage() {
  const { classroom, user } = useAuth()
  const role = useCurrentRole()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [draft, setDraft] = useState<MemberDraft>({ username: '', fullName: '', displayName: '', role: 'student' })
  const [temporaryPassword, setTemporaryPassword] = useState('')
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
      setLoadError('Member accounts could not be loaded. Please try again.')
      setMembers([])
      setLoading(false)
      return
    }
    const { data: profiles, error: profileError } = membershipRows?.length
      ? await supabase.from('profiles').select('id, username, full_name, display_name, avatar_url, created_at, updated_at').in('id', membershipRows.map((item) => item.user_id))
      : { data: [], error: null }
    if (profileError) {
      setLoadError('Member profiles could not be loaded. Please try again.')
      setMembers([])
    } else {
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      setMembers((membershipRows ?? []).flatMap((membership) => {
        const profile = profileById.get(membership.user_id)
        return profile ? [{ profile, membership }] : []
      }))
    }
    setLoading(false)
  }, [classroom])

  useEffect(() => { void loadMembers() }, [loadMembers])
  const visibleMembers = useMemo(() => members.filter(({ profile, membership }) =>
    (roleFilter === 'all' || membership.role === roleFilter)
    && `${profile.username} ${profile.display_name ?? ''} ${profile.full_name}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [members, query, roleFilter])
  const adminCount = members.filter((member) => member.membership.role === 'admin').length

  function openEdit(member: Member) {
    setDraft({ username: member.profile.username, fullName: member.profile.full_name, displayName: member.profile.display_name ?? '', role: member.membership.role })
    setError('')
    setSuccess('')
    setDialog({ kind: 'edit', member })
  }

  async function callMemberAction(member: Member | null, action: string, body: Record<string, unknown>) {
    if (!supabase || !classroom) return false
    setPending(true)
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke<{ error?: string; message?: string; profile?: Profile; membership?: { role: UserRole } }>(
      member ? 'admin-member-action' : 'admin-create-member',
      { body: member ? { classroomId: classroom.id, userId: member.profile.id, action, ...body } : { classroomId: classroom.id, ...body } },
    )
    setPending(false)
    if (invokeError || data?.error) {
      setError(data?.error ?? await safeFunctionError(invokeError, 'The account change could not be completed. Please try again.'))
      return false
    }
    setSuccess(data?.message ?? (action === 'update-profile' ? 'Member details saved.' : 'Account updated.'))
    return true
  }

  async function submitDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialog) return
    let ok = false
    if (dialog.kind === 'create') {
      ok = await callMemberAction(null, 'create', { username: draft.username, fullName: draft.fullName, temporaryPassword, role: draft.role })
    } else if (dialog.kind === 'edit') {
      const profileUpdated = await callMemberAction(dialog.member, 'update-profile', { username: draft.username, fullName: draft.fullName, displayName: draft.displayName })
      if (!profileUpdated) return
      if (draft.role !== dialog.member.membership.role) {
        ok = await callMemberAction(dialog.member, 'set-role', { role: draft.role })
        if (!ok) return
      } else ok = true
    } else if (dialog.kind === 'reset') {
      ok = await callMemberAction(dialog.member, 'reset-password', { temporaryPassword })
    }
    if (ok) {
      setDialog(null)
      setDraft({ username: '', fullName: '', displayName: '', role: 'student' })
      setTemporaryPassword('')
      await loadMembers()
    }
  }

  async function deleteMember() {
    if (!dialog || dialog.kind !== 'delete') return
    const ok = await callMemberAction(dialog.member, 'delete-account', {})
    if (ok) {
      setDialog(null)
      await loadMembers()
    }
  }

  return <>
    <PageHeading eyebrow="Class directory" title="Members" description={`Accounts and roles in ${classroom?.name ?? 'your classroom'}.`} action={role === 'admin' ? <div className="flex flex-wrap gap-2"><PermissionManager members={members} classroomId={classroom?.id ?? ''} classroomName={classroom?.name ?? 'Classroom'} /><Button onClick={() => { setError(''); setSuccess(''); setDraft({ username: '', fullName: '', displayName: '', role: 'student' }); setTemporaryPassword(''); setDialog({ kind: 'create' }) }}><UserPlus size={16} /> Create account</Button></div> : undefined} />
    {success && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loadError && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{loadError}</p>}
    {role !== 'admin' && <p className="mb-4 rounded-lg border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-950">Only classroom administrators can manage member accounts.</p>}
    <Card className="!p-0">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Class members <span className="ml-1 text-xs font-medium text-slate-400">{loading ? '…' : visibleMembers.length}</span></h2><p className="mt-1 text-xs text-slate-500">Member access is restricted to this classroom.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="member-search">Search members</label><div className="relative sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input id="member-search" placeholder="Search username or name" value={query} onChange={(event) => setQuery(event.target.value)} className="py-2 pl-9" /></div><label className="sr-only" htmlFor="role-filter">Filter by role</label><select id="role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | 'all')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All roles</option>{roles.map((item) => <option key={item} value={item}>{roleName(item)}</option>)}</select></div></div>
      {loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">Loading members…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Username</th><th className="px-4 py-3">Display name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Date joined</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleMembers.map(({ profile, membership }) => {
        const member = members.find((item) => item.profile.id === profile.id)!
        const self = user?.id === profile.id
        const lastAdmin = membership.role === 'admin' && adminCount <= 1
        const protectedOwner = profile.id === classroom?.owner_id
        return <tr key={membership.id} className="transition-colors hover:bg-slate-50/70"><td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">@{profile.username}{self && <span className="ml-2 text-[10px] font-medium text-slate-400">You</span>}</td><td className="max-w-56 truncate px-4 py-3 text-slate-600">{profile.display_name || profile.full_name}</td><td className="px-4 py-3"><span className={'inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ' + (membership.role === 'admin' ? 'bg-violet-50 text-violet-800' : membership.role === 'teacher' ? 'bg-cyan-50 text-cyan-900' : 'bg-slate-100 text-slate-700')}>{roleName(membership.role)}</span></td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{dateLabel(profile.created_at)}</td><td className="px-4 py-2"><div className="flex justify-end gap-1">{role === 'admin' && !self && <><button type="button" aria-label={`Edit @${profile.username}`} title="Edit member" onClick={() => openEdit(member)} className="rounded-md p-2 text-slate-500 hover:bg-cyan-50 hover:text-cyan-800 focus-visible:ring-2 focus-visible:ring-cyan-700"><Pencil size={16} /></button><button type="button" aria-label={`Reset password for @${profile.username}`} title="Reset password" onClick={() => { setTemporaryPassword(''); setError(''); setDialog({ kind: 'reset', member }) }} className="rounded-md p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-800 focus-visible:ring-2 focus-visible:ring-cyan-700"><KeyRound size={16} /></button><button type="button" aria-label={`Delete @${profile.username}`} title={protectedOwner ? 'Transfer classroom ownership before deleting this account' : lastAdmin ? 'The last administrator cannot be deleted' : 'Delete member'} disabled={lastAdmin || protectedOwner} onClick={() => { setError(''); setDialog({ kind: 'delete', member }) }} className="rounded-md p-2 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 size={16} /></button></>}</div></td></tr>
      })}</tbody></table>{!visibleMembers.length && <div className="p-10 text-center"><Users size={23} className="mx-auto text-slate-300" /><p className="mt-2 text-sm text-slate-500">{loadError ? 'Members are unavailable.' : 'No members match these filters.'}</p></div>}</div>}
    </Card>
    {dialog && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setDialog(null) }}><section role="dialog" aria-modal="true" aria-labelledby="member-dialog-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="member-dialog-title" className="text-lg font-bold text-slate-900">{dialog.kind === 'create' ? 'Create classroom account' : dialog.kind === 'edit' ? `Edit @${dialog.member.profile.username}` : dialog.kind === 'reset' ? `Reset @${dialog.member.profile.username} password` : `Delete @${dialog.member.profile.username}`}</h2><p className="mt-1 text-sm text-slate-500">{dialog.kind === 'create' ? 'Accounts use a username and password; no email address is needed.' : dialog.kind === 'reset' ? 'Set a temporary password and share it privately.' : dialog.kind === 'delete' ? 'This removes the account and its owned content. This action cannot be undone.' : 'Update the member’s classroom account details.'}</p></div><button type="button" aria-label="Close dialog" disabled={pending} onClick={() => setDialog(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
      {dialog.kind === 'delete' ? <><p className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">Delete this member account permanently?</p>{error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button><Button className="!bg-rose-700 hover:!bg-rose-800" disabled={pending} onClick={() => void deleteMember()}><Trash2 size={15} />{pending ? 'Deleting…' : 'Delete account'}</Button></div></>
        : <form onSubmit={submitDialog} className="space-y-4">{(dialog.kind === 'create' || dialog.kind === 'edit') && <><Input id="member-username" label="Username" autoComplete="off" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,30}[A-Za-z0-9]" required value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} /><Input id="member-full-name" label="Full name" maxLength={120} required value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} />{dialog.kind === 'edit' && <Input id="member-display-name" label="Display name" maxLength={80} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} />}<div><label htmlFor="member-role" className="mb-1.5 block text-sm font-medium text-slate-700">Role</label><select id="member-role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">{roles.map((item) => <option key={item} value={item}>{roleName(item)}</option>)}</select></div></>}
          {(dialog.kind === 'create' || dialog.kind === 'reset') && <Input id="temporary-password" label="Temporary password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} />}
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving…' : dialog.kind === 'create' ? 'Create account' : dialog.kind === 'reset' ? 'Set temporary password' : 'Save changes'}</Button></div>
        </form>}
    </section></div>}
  </>
}
