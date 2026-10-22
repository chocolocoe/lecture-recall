import { useCallback, useEffect, useState } from 'react'
import { BookOpen, CalendarDays, Pencil, Plus, School, Trash2, Users, X } from 'lucide-react'
import { useCurrentRole } from '@/app/RoleContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PageHeading } from '@/components/ui/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { deleteAcademicItem } from '@/lib/academic'
import { supabase } from '@/lib/supabase'
import type { Subject } from '@/types'

export function ClassroomPage() {
  const role = useCurrentRole()
  const { classroom, refreshIdentity } = useAuth()
  const canManage = role !== 'student'
  const isAdmin = role === 'admin'
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Subject | null>(null)
  const [subjectModalOpen, setSubjectModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#0e7490')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [classroomName, setClassroomName] = useState(classroom?.name ?? '')
  const [classroomDescription, setClassroomDescription] = useState(classroom?.description ?? '')
  const [settingsPending, setSettingsPending] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !classroom) return
    setLoading(true)
    setError('')
    const [subjectResult, memberResult] = await Promise.all([
      supabase.from('subjects').select('*').eq('classroom_id', classroom.id).order('name'),
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('classroom_id', classroom.id),
    ])
    if (subjectResult.error || memberResult.error) {
      setError(subjectResult.error?.message ?? memberResult.error?.message ?? 'Could not load classroom details.')
    } else {
      setSubjects(subjectResult.data ?? [])
      setMemberCount(memberResult.count ?? 0)
    }
    setLoading(false)
  }, [classroom])
  useEffect(() => { void load() }, [load])

  function openSubject(subject?: Subject) {
    setEditing(subject ?? null)
    setName(subject?.name ?? '')
    setColor(subject?.color || '#0e7490')
    setFormError('')
    setSubjectModalOpen(true)
  }

  async function saveSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !classroom) return
    setSaving(true)
    setFormError('')
    setNotice('')
    const result = editing
      ? await supabase.from('subjects').update({ name: name.trim(), color }).eq('id', editing.id).eq('classroom_id', classroom.id).select('id').single()
      : await supabase.from('subjects').insert({ classroom_id: classroom.id, name: name.trim(), color }).select('id').single()
    setSaving(false)
    if (result.error) {
      setFormError(result.error.message)
      return
    }
    setEditing(null)
    setSubjectModalOpen(false)
    setNotice(editing ? 'Subject updated.' : 'Subject added.')
    await load()
  }

  async function removeSubject(subject: Subject) {
    if (!window.confirm(`Delete “${subject.name}”? This permanently deletes its lessons, student notes, and attachment records/files. Assignment records remain, with their subject and lesson links cleared.`)) return
    setDeletingId(subject.id)
    setError('')
    setNotice('')
    try {
      await deleteAcademicItem('subject', subject.id)
      setSubjects((current) => current.filter((item) => item.id !== subject.id))
      setNotice(`Subject “${subject.name}” and its dependent lesson content were deleted.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the subject.')
    } finally { setDeletingId('') }
  }

  async function saveClassroomSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !classroom) return
    setSettingsPending(true)
    setFormError('')
    const { error } = await supabase.from('classrooms').update({
      name: classroomName.trim(),
      description: classroomDescription.trim() || null,
    }).eq('id', classroom.id)
    setSettingsPending(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setSettingsOpen(false)
    setNotice('Classroom settings updated.')
    await refreshIdentity()
  }

  return <>
    <PageHeading eyebrow="Workspace" title="Classroom" description="Classroom details and subjects shared by your members." />
    {notice && <p role="status" className="mb-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {(error || formError) && <p role="alert" className="mb-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error || formError}</p>}
    {loading ? <p role="status" className="py-12 text-center text-sm text-slate-500">Loading classroom…</p> : <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]"><Card className="overflow-hidden !p-0"><div className="bg-[#102a43] px-6 py-8 text-white sm:px-8"><div className="mb-4 flex items-center justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-cyan-200"><School size={22} /></div>{isAdmin && <Button variant="outline" size="sm" onClick={() => { setClassroomName(classroom?.name ?? ''); setClassroomDescription(classroom?.description ?? ''); setSettingsOpen(true) }}><Pencil size={14} /> Edit settings</Button>}</div><h2 className="text-2xl font-bold">{classroom?.name}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">{classroom?.description || 'No classroom description has been added.'}</p></div><div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8"><Info icon={Users} label="Members" value={String(memberCount)} /><Info icon={BookOpen} label="Subjects" value={String(subjects.length)} /><Info icon={CalendarDays} label="Created" value={classroom?.created_at ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(classroom.created_at)) : '—'} /></div></Card>
      <Card><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">Subjects</h2><p className="mt-1 text-sm text-slate-500">Organize lesson archives by subject.</p></div>{canManage && <Button size="sm" variant="outline" onClick={() => openSubject()}><Plus size={14} /> Add</Button>}</div><div className="mt-4 space-y-2">{subjects.map((subject) => <div key={subject.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color || '#0e7490' }} /><span className="flex-1 text-sm font-medium text-slate-700">{subject.name}</span>{canManage && <><button type="button" title={`Edit ${subject.name}`} aria-label={`Edit ${subject.name}`} onClick={() => openSubject(subject)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button><button type="button" title={`Delete ${subject.name}`} aria-label={`Delete ${subject.name}`} disabled={deletingId === subject.id} onClick={() => void removeSubject(subject)} className="rounded p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={14} /></button></>}</div>)}{!subjects.length && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{error ? 'Subjects are unavailable.' : 'No subjects have been created yet.'}</p>}</div></Card></div>}
    {subjectModalOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="subject-form-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-7"><div className="mb-5 flex items-start justify-between"><h2 id="subject-form-title" className="text-lg font-bold text-slate-900">{editing ? 'Edit subject' : 'Add subject'}</h2><button onClick={() => setSubjectModalOpen(false)} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><SubjectForm name={name} color={color} saving={saving} error={formError} onName={setName} onColor={setColor} onCancel={() => setSubjectModalOpen(false)} onSubmit={saveSubject} /></section></div>}
    {settingsOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="classroom-settings-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-7"><div className="mb-5 flex items-start justify-between"><h2 id="classroom-settings-title" className="text-lg font-bold text-slate-900">Classroom settings</h2><button onClick={() => setSettingsOpen(false)} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><form onSubmit={saveClassroomSettings} className="space-y-4"><Input id="classroom-name" label="Classroom name" required maxLength={120} value={classroomName} onChange={(event) => setClassroomName(event.target.value)} /><div><label htmlFor="classroom-description" className="mb-1.5 block text-sm font-medium text-slate-700">Description</label><textarea id="classroom-description" maxLength={500} value={classroomDescription} onChange={(event) => setClassroomDescription(event.target.value)} className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>{formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{formError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={settingsPending} onClick={() => setSettingsOpen(false)}>Cancel</Button><Button type="submit" disabled={settingsPending}>{settingsPending ? 'Saving…' : 'Save settings'}</Button></div></form></section></div>}
  </>
}

function SubjectForm({ name, color, saving, error, onName, onColor, onCancel, onSubmit }: { name: string; color: string; saving: boolean; error: string; onName: (value: string) => void; onColor: (value: string) => void; onCancel: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="space-y-4"><Input id="subject-name" label="Subject name" maxLength={80} required value={name} onChange={(event) => onName(event.target.value)} /><div><label htmlFor="subject-color" className="mb-1.5 block text-sm font-medium text-slate-700">Color</label><input id="subject-color" type="color" value={color} onChange={(event) => onColor(event.target.value)} className="h-10 w-16 rounded border border-slate-300 p-1" /></div>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save subject'}</Button></div></form>
}

function Info({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) { return <div><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon size={14} />{label}</div><p className="mt-1.5 text-sm font-semibold text-slate-800">{value}</p></div> }
