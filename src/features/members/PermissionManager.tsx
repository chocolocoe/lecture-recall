import { useEffect, useMemo, useState } from 'react'
import { Check, RotateCcw, Save, ShieldCheck, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { permissionRegistry, type PermissionEffect, type PermissionKey, type PermissionOverride } from '@/lib/permissions'
import type { Membership, Profile, UserRole } from '@/types'

type Member = { profile: Profile; membership: Membership }
type OverrideRow = { permission_key: string; effect: string; resource_id: string | null }
type DefaultRow = { role: UserRole; permission_key: string; allowed: boolean }
type ResourceChoice = { id: string; label: string }
const roleLabel = (role: UserRole) => role[0].toUpperCase() + role.slice(1)

export function PermissionManager({ members, classroomId, classroomName }: { members: Member[]; classroomId: string; classroomName: string }) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])
  const [defaults, setDefaults] = useState<DefaultRow[]>([])
  const [resourceChoices, setResourceChoices] = useState<Record<string, ResourceChoice[]>>({})
  const [savedOverrides, setSavedOverrides] = useState<PermissionOverride[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateRole, setTemplateRole] = useState<UserRole>('teacher')
  const [templateDraft, setTemplateDraft] = useState<Record<string, boolean>>({})
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateMessage, setTemplateMessage] = useState('')
  const filteredMembers = useMemo(() => members.filter(({ profile, membership }) => membership.role !== 'admin'
    && (roleFilter === 'all' || membership.role === roleFilter)
    && `${profile.username} ${profile.display_name ?? ''} ${profile.full_name}`.toLowerCase().includes(query.trim().toLowerCase())), [members, query, roleFilter])
  const selected = filteredMembers.find((member) => member.profile.id === selectedId) ?? members.find((member) => member.profile.id === selectedId)
  const overrideByKey = new Map(overrides.map((item) => [item.permission, item.effect]))
  const defaultByKey = new Map(defaults.filter((item) => item.role === selected?.membership.role).map((item) => [item.permission_key, item.allowed]))
  const isDirty = JSON.stringify(overrides) !== JSON.stringify(savedOverrides)
  const templateDirty = permissionRegistry.some((item) => templateDraft[item.key] !== (defaults.find((row) => row.role === templateRole && row.permission_key === item.key)?.allowed ?? false))

  useEffect(() => {
    if (!open || !supabase) return
    let active = true
    setLoading(true); setError('')
    void Promise.all([
      supabase.from('classroom_role_permissions').select('role, permission_key, allowed').eq('classroom_id', classroomId),
      supabase.from('subjects').select('id, name').eq('classroom_id', classroomId),
      supabase.from('lessons').select('id, title').eq('classroom_id', classroomId),
      supabase.from('assignments').select('id, title').eq('classroom_id', classroomId),
      supabase.from('lesson_attachments').select('id, file_name').eq('classroom_id', classroomId),
      supabase.from('lesson_contributions').select('id, title, lesson_id'),
    ]).then(([defaultResult, subjectsResult, lessonsResult, assignmentsResult, attachmentsResult, contributionsResult]) => {
      if (!active) return
      if (defaultResult.error || subjectsResult.error || lessonsResult.error || assignmentsResult.error || attachmentsResult.error || contributionsResult.error) setError('Permission data could not be loaded. Check the local migration and administrator access, then retry.')
      else {
        setDefaults(defaultResult.data ?? [])
        const lessonIds = new Set((lessonsResult.data ?? []).map((row) => row.id))
        setResourceChoices({
          Subjects: (subjectsResult.data ?? []).map((row) => ({ id: row.id, label: row.name })),
          Lessons: (lessonsResult.data ?? []).map((row) => ({ id: row.id, label: row.title })),
          Contributions: (contributionsResult.data ?? []).filter((row) => lessonIds.has(row.lesson_id)).map((row) => ({ id: row.id, label: row.title || `Note ${row.id.slice(0, 8)}` })),
          Assignments: (assignmentsResult.data ?? []).map((row) => ({ id: row.id, label: row.title })),
          Attachments: (attachmentsResult.data ?? []).map((row) => ({ id: row.id, label: row.file_name })),
        })
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [open, classroomId])

  useEffect(() => {
    if (!templateOpen) return
    setTemplateDraft(Object.fromEntries(permissionRegistry.map((item) => [item.key, defaults.find((row) => row.role === templateRole && row.permission_key === item.key)?.allowed ?? false])))
    setTemplateMessage('')
  }, [templateOpen, templateRole, defaults])

  async function selectMember(member: Member) {
    if (!supabase) return
    setSelectedId(member.profile.id); setLoading(true); setError(''); setSuccess('')
    const { data, error: queryError } = await supabase.from('member_permission_overrides')
      .select('permission_key, effect, resource_id').eq('classroom_id', classroomId).eq('user_id', member.profile.id)
    if (queryError) setError('This member’s custom permissions could not be loaded.')
    else {
      const normalized = (data ?? []).map((row: OverrideRow) => ({ permission: row.permission_key as PermissionKey, effect: row.effect as PermissionEffect, resourceId: row.resource_id }))
        .sort((a, b) => a.permission.localeCompare(b.permission))
      setOverrides(normalized); setSavedOverrides(normalized)
    }
    setLoading(false)
  }

  function setEffect(key: PermissionKey, effect: PermissionEffect | 'inherit') {
    const definition = permissionRegistry.find((permission) => permission.key === key)
    if (effect === 'allow' && definition?.sensitive && !window.confirm(`Grant “${definition.label}” to this member? This is a sensitive permission.`)) return
    setOverrides((current) => {
      const without = current.filter((item) => item.permission !== key)
      if (effect !== 'inherit') without.push({ permission: key, effect })
      return without.sort((a, b) => a.permission.localeCompare(b.permission))
    })
    setSuccess('')
  }

  function setScope(key: PermissionKey, resourceId: string | null) {
    setOverrides((current) => current.map((item) => item.permission === key ? { ...item, resourceId } : item))
    setSuccess('')
  }

  function scopeChoices(key: PermissionKey) {
    if (key.startsWith('subjects.')) return resourceChoices.Subjects ?? []
    if (key === 'contributions.create' || key === 'attachments.view' || key === 'attachments.upload') return resourceChoices.Lessons ?? []
    if (key.startsWith('contributions.')) return resourceChoices.Contributions ?? []
    if (key === 'attachments.replace' || key === 'attachments.delete') return resourceChoices.Attachments ?? []
    if (key.startsWith('lessons.')) return resourceChoices.Lessons ?? []
    if (key.startsWith('assignments.') || key.startsWith('progress.')) return resourceChoices.Assignments ?? []
    return []
  }

  function setCategory(category: string, effect: PermissionEffect | 'inherit') {
    const keys = permissionRegistry.filter((item) => item.category === category)
    const changedKeys = effect === 'allow' ? keys.filter((item) => !item.adminOnly) : keys
    if (effect === 'allow' && changedKeys.some((item) => item.sensitive) && !window.confirm(`Grant all delegable ${category.toLowerCase()} permissions to this member, including sensitive actions?`)) return
    setOverrides((current) => {
      const without = current.filter((item) => !changedKeys.some((permission) => permission.key === item.permission))
      if (effect !== 'inherit') changedKeys.forEach((permission) => without.push({ permission: permission.key, effect }))
      return without.sort((a, b) => a.permission.localeCompare(b.permission))
    })
  }

  async function save() {
    if (!supabase || !selected || !isDirty) return
    setSaving(true); setError(''); setSuccess('')
    const payload = overrides.map(({ permission, effect, resourceId }) => ({ permission, effect, resourceId: resourceId ?? null }))
    const { error: saveError } = await supabase.rpc('save_member_permissions', { p_classroom_id: classroomId, p_user_id: selected.profile.id, p_overrides: payload })
    setSaving(false)
    if (saveError) { setError('Permission changes were rejected. No changes were saved. Verify the administrator session and retry.'); return }
    setSavedOverrides(overrides); setSuccess('Permission changes saved. They take effect on the next database request.')
  }

  async function saveTemplate() {
    if (!supabase || !templateDirty) return
    setTemplateSaving(true); setTemplateMessage('')
    const p_permissions = permissionRegistry.map((item) => ({ permission: item.key, allowed: templateDraft[item.key] === true }))
    const { error: templateError } = await supabase.rpc('save_role_permission_template', { p_classroom_id: classroomId, p_role: templateRole, p_permissions })
    setTemplateSaving(false)
    if (templateError) { setTemplateMessage('Role defaults were not saved. Administrator-only operations cannot be added to a role template.'); return }
    setDefaults((current) => current.map((row) => row.role === templateRole ? { ...row, allowed: templateDraft[row.permission_key] === true } : row))
    setTemplateMessage('Role defaults saved. Members without overrides use them on their next database request.')
  }

  function reset() {
    if (!window.confirm(`Reset @${selected?.profile.username ?? 'member'} to the ${roleLabel(selected?.membership.role ?? 'student')} role defaults?`)) return
    setOverrides([]); setSuccess('')
  }

  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><ShieldCheck size={16} /> Permission Manager</Button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !isDirty) setOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="permission-title" className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-700 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">{classroomName}</p><h2 id="permission-title" className="mt-1 text-xl font-bold">Permission Manager</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Role defaults apply when a permission is inherited. Explicit deny overrides the role default.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)} disabled={isDirty}>Role templates</Button><button type="button" aria-label="Close Permission Manager" disabled={saving || isDirty} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">Close</button></div></header>
        <div className="grid min-h-0 flex-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-slate-200 md:border-b-0 md:border-r dark:border-slate-700"><div className="space-y-2 p-3"><label className="sr-only" htmlFor="permission-member-search">Search members</label><Input id="permission-member-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members" /><label className="sr-only" htmlFor="permission-role-filter">Filter member role</label><select id="permission-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | 'all')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"><option value="all">All roles</option><option value="teacher">Teachers</option><option value="student">Students</option></select></div><div className="flex max-h-40 flex-col overflow-y-auto md:max-h-none md:flex-1">{filteredMembers.map((member) => <button type="button" key={member.profile.id} onClick={() => void selectMember(member)} className={`border-t border-slate-100 px-4 py-3 text-left hover:bg-cyan-50 dark:border-slate-800 dark:hover:bg-slate-800 ${selectedId === member.profile.id ? 'bg-cyan-50 dark:bg-slate-800' : ''}`}><span className="block truncate text-sm font-semibold">@{member.profile.username}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{member.profile.display_name || member.profile.full_name} · {roleLabel(member.membership.role)}</span></button>)}{filteredMembers.length === 0 && <p className="p-4 text-sm text-slate-500">No members match.</p>}</div></aside>
          <main className="min-h-0 overflow-y-auto p-3 sm:p-5">
            {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-100">{error}</p>}{success && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">{success}</p>}
            {!selected ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Choose a teacher or student to review permissions.</p> : loading ? <p role="status" className="p-10 text-center text-sm text-slate-500">Loading permission assignments…</p> : <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">@{selected.profile.username}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{selected.profile.display_name || selected.profile.full_name} · {roleLabel(selected.membership.role)} · {classroomName}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={reset} disabled={!overrides.length || saving}><RotateCcw size={14} /> Reset defaults</Button><Button size="sm" onClick={() => void save()} disabled={!isDirty || saving}><Save size={14} /> {saving ? 'Saving…' : 'Save changes'}</Button></div></div>
              <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300"><span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-600" /> Granted</span><span className="inline-flex items-center gap-1"><ShieldX size={13} className="text-rose-600" /> Denied</span><span>Inherited from role defaults</span></div>
              <div className="space-y-3">{Array.from(new Set(permissionRegistry.map((item) => item.category))).map((category) => {
                const entries = permissionRegistry.filter((item) => item.category === category)
                return <Card key={category} className="!p-0 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700"><h4 className="text-sm font-bold">{category}</h4><div className="flex gap-1"><button type="button" title={`Grant all ${category}`} onClick={() => setCategory(category, 'allow')} className="rounded px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">Select all</button><button type="button" title={`Deny all ${category}`} onClick={() => setCategory(category, 'deny')} className="rounded px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950">Deselect all</button></div></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{entries.map((item) => {
                  const effect = overrideByKey.get(item.key)
                  const override = overrides.find((entry) => entry.permission === item.key)
                  const choices = scopeChoices(item.key)
                  const inherited = defaultByKey.get(item.key) === true
                  const state = effect ?? 'inherit'
                  return <div key={item.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-medium">{item.label}{item.adminOnly && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">Admin only</span>}{item.sensitive && !item.adminOnly && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Sensitive</span>}</p><p className="text-xs text-slate-500 dark:text-slate-400">{item.description} · {state === 'allow' ? 'Granted by override' : state === 'deny' ? 'Denied by override' : `Inherited: ${inherited ? 'granted' : 'denied'}`}</p></div><div className="flex flex-col gap-2 sm:flex-row"><select aria-label={`${item.label} permission`} value={state} onChange={(event) => setEffect(item.key, event.target.value as PermissionEffect | 'inherit')} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs sm:w-36 dark:border-slate-600 dark:bg-slate-800"><option value="inherit">Inherited</option><option value="allow" disabled={item.adminOnly}>Grant</option><option value="deny">Deny</option></select>{choices.length > 0 && <select aria-label={`${item.label} record scope`} disabled={state === 'inherit'} value={override?.resourceId ?? ''} onChange={(event) => setScope(item.key, event.target.value || null)} className="w-full max-w-56 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:opacity-50 sm:w-48 dark:border-slate-600 dark:bg-slate-800"><option value="">Whole classroom</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>}</div></div>
                })}</div></Card>
              })}</div>
            </>}
          </main>
        </div>
        {isDirty && <footer className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">Unsaved changes. Save them before closing.</footer>}
      </section>
    </div>}
    {templateOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="role-template-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"><header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700"><div><h2 id="role-template-title" className="font-bold">Role permission defaults</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Changing a template affects every member of that role who has no custom override.</p></div><Button variant="outline" size="sm" onClick={() => setTemplateOpen(false)} disabled={templateSaving}>Close</Button></header><div className="flex flex-wrap items-center justify-between gap-3 p-4"><label className="text-sm font-medium" htmlFor="template-role">Edit defaults for</label><select id="template-role" value={templateRole} onChange={(event) => setTemplateRole(event.target.value as UserRole)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"><option value="teacher">Teacher</option><option value="student">Student</option></select></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">{Array.from(new Set(permissionRegistry.map((item) => item.category))).map((category) => <Card key={category} className="!p-0 dark:border-slate-700 dark:bg-slate-900"><h3 className="border-b border-slate-100 px-4 py-3 text-sm font-bold dark:border-slate-700">{category}</h3>{permissionRegistry.filter((item) => item.category === category).map((item) => <label key={item.key} className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0 dark:border-slate-800"><input type="checkbox" checked={templateDraft[item.key] === true} disabled={item.adminOnly} onChange={(event) => setTemplateDraft((current) => ({ ...current, [item.key]: event.target.checked }))} className="mt-0.5 accent-cyan-700" /><span><span className="font-medium">{item.label}{item.adminOnly && <span className="ml-2 text-[10px] font-bold uppercase text-slate-500">Admin only</span>}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{item.description}</span></span></label>)}</Card>)}</div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-700"><p role={templateMessage.includes('not saved') ? 'alert' : 'status'} className="text-xs text-slate-600 dark:text-slate-300">{templateMessage}</p><Button onClick={() => void saveTemplate()} disabled={!templateDirty || templateSaving}><Save size={14} /> {templateSaving ? 'Saving…' : 'Save defaults'}</Button></footer></section></div>}
  </>
}
