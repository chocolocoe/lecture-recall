import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Circle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeading } from '@/components/ui/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentRole } from '@/app/RoleContext'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import type { Assignment, AssignmentProgress, Subject } from '@/types'
import { deleteAcademicItem } from '@/lib/academic'

type AssignmentForm = { title: string; description: string; subject_id: string; due_date: string }
const toLocalDateInput = (value: string) => {
  const date = new Date(value)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
const toLocalDueDate = (value: string) => new Date(value + 'T15:30:00').toISOString()

export function AssignmentsPage() {
  const { classroom, user } = useAuth()
  const role = useCurrentRole()
  const staff = role !== 'student'
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [progress, setProgress] = useState<AssignmentProgress[]>([])
  const [studentCount, setStudentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingId, setPendingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [submissionBusyId, setSubmissionBusyId] = useState('')
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState<AssignmentForm>({ title: '', description: '', subject_id: '', due_date: '' })

  const load = useCallback(async () => {
    if (!supabase || !classroom || !user) return
    setLoading(true)
    setError('')
    const [assignmentResult, subjectResult] = await Promise.all([
      supabase.from('assignments').select('*').eq('classroom_id', classroom.id).order('due_date'),
      supabase.from('subjects').select('*').eq('classroom_id', classroom.id).order('name'),
    ])
    if (assignmentResult.error || subjectResult.error) {
      setError(assignmentResult.error?.message ?? subjectResult.error?.message ?? 'Could not load classroom assignments.')
      setAssignments([])
      setLoading(false)
      return
    }
    const assignmentRows = assignmentResult.data ?? []
    setAssignments(assignmentRows)
    setSubjects(subjectResult.data ?? [])
    if (assignmentRows.length) {
      const progressQuery = supabase.from('assignment_progress').select('*').in('assignment_id', assignmentRows.map((item) => item.id))
      const [progressResult, membersResult] = await Promise.all([
        staff ? progressQuery : progressQuery.eq('user_id', user.id),
        staff ? supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('classroom_id', classroom.id).eq('role', 'student') : Promise.resolve({ count: null, error: null }),
      ])
      if (progressResult.error || membersResult.error) {
        setError(progressResult.error?.message ?? membersResult.error?.message ?? 'Could not load assignment progress.')
      } else {
        setProgress(progressResult.data ?? [])
        setStudentCount(membersResult.count ?? 0)
      }
    } else {
      setProgress([])
      setStudentCount(0)
    }
    setLoading(false)
  }, [classroom, staff, user])

  useEffect(() => { void load() }, [load])
  const subjectNames = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects])
  const completedCount = useMemo(() => progress.filter((item) => item.completed).length, [progress])
  const todoCount = assignments.length - completedCount

  function openCreate() {
    setEditing(null)
    setForm({ title: '', description: '', subject_id: '', due_date: '' })
    setFormError('')
    setCreating(true)
  }

  function openEdit(assignment: Assignment) {
    setCreating(false)
    setEditing(assignment)
    setForm({
      title: assignment.title,
      description: assignment.description ?? '',
      subject_id: assignment.subject_id ?? '',
      due_date: toLocalDateInput(assignment.due_date),
    })
    setFormError('')
  }

  async function saveAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !classroom || !user) return
    setSaving(true)
    setFormError('')
    setNotice('')
    const fields = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      subject_id: form.subject_id || null,
      due_date: toLocalDueDate(form.due_date),
    }
    const result = editing
      ? await supabase.from('assignments').update(fields).eq('id', editing.id).eq('classroom_id', classroom.id).select('id').single()
      : await supabase.from('assignments').insert({ ...fields, classroom_id: classroom.id, created_by: user.id }).select('id').single()
    setSaving(false)
    if (result.error) {
      setFormError(result.error.message)
      return
    }
    setCreating(false)
    setEditing(null)
    setNotice(editing ? 'Assignment changes saved.' : 'Assignment created.')
    await load()
  }

  async function toggleProgress(assignment: Assignment) {
    if (!supabase || !user) return
    const current = progress.find((item) => item.assignment_id === assignment.id && item.user_id === user.id)
    const completed = !current?.completed
    setPendingId(assignment.id)
    setError('')
    setNotice('')
    const progressFields = {
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    }
    const result = current
      ? await supabase.from('assignment_progress').update(progressFields)
        .eq('assignment_id', assignment.id).eq('user_id', user.id).select().single()
      : await supabase.from('assignment_progress').insert({
        ...progressFields,
        assignment_id: assignment.id,
        user_id: user.id,
      }).select().single()
    setPendingId('')
    if (result.error) {
      setError(result.error.message)
      return
    }
    setProgress((currentRows) => [...currentRows.filter((item) => item.assignment_id !== assignment.id), result.data])
  }

  async function saveSubmission(assignment: Assignment) {
    if (!supabase || !user) return
    const current = progress.find((item) => item.assignment_id === assignment.id && item.user_id === user.id)
    setSubmissionBusyId(assignment.id)
    setError('')
    setNotice('')
    const fields = { notes: (submissionDrafts[assignment.id] ?? current?.notes ?? '').trim() || null }
    const result = current
      ? await supabase.from('assignment_progress').update(fields).eq('id', current.id).eq('user_id', user.id).select().single()
      : await supabase.from('assignment_progress').insert({ ...fields, assignment_id: assignment.id, user_id: user.id }).select().single()
    setSubmissionBusyId('')
    if (result.error) { setError('Assignment submission could not be saved: ' + result.error.message); return }
    setProgress((rows) => [...rows.filter((item) => item.assignment_id !== assignment.id || item.user_id !== user.id), result.data])
    setNotice('Assignment response saved.')
  }

  async function removeAssignment(assignment: Assignment) {
    if (!window.confirm(`Delete “${assignment.title}”? Student progress records for this assignment will also be deleted.`)) return
    setDeletingId(assignment.id)
    setError('')
    try {
      await deleteAcademicItem('assignment', assignment.id)
      setAssignments((rows) => rows.filter((row) => row.id !== assignment.id))
      setProgress((rows) => rows.filter((row) => row.assignment_id !== assignment.id))
      setNotice('Assignment and its student progress records deleted.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete the assignment.') }
    finally { setDeletingId('') }
  }

  const dueSoon = assignments.filter((item) => new Date(item.due_date).getTime() >= Date.now() && new Date(item.due_date).getTime() <= Date.now() + 7 * 86400000).length
  const totalStudentAssignments = studentCount * assignments.length
  const pendingProgress = staff ? Math.max(0, totalStudentAssignments - completedCount) : todoCount
  const completedValue = staff ? (totalStudentAssignments ? Math.round((completedCount / totalStudentAssignments) * 100) + '%' : '—') : completedCount + ' / ' + assignments.length

  return <>
    <PageHeading eyebrow="Keep on track" title="Assignments" description={staff ? 'Manage classroom deadlines and review student progress.' : 'See your classroom deadlines and save your completion status.'} action={staff ? <Button onClick={openCreate}><Plus size={16} /> Create assignment</Button> : undefined} />
    {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Assignments could not be loaded or updated: {error}</p>}
    {(creating || editing) && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setCreating(false); setEditing(null) } }}><section role="dialog" aria-modal="true" aria-labelledby="assignment-form-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7"><h2 id="assignment-form-title" className="mb-5 text-lg font-bold text-slate-900">{editing ? 'Edit assignment' : 'Create assignment'}</h2><form onSubmit={saveAssignment} className="space-y-4"><div><label htmlFor="assignment-title" className="mb-1.5 block text-sm font-medium text-slate-700">Title</label><input id="assignment-title" required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div><div><label htmlFor="assignment-description" className="mb-1.5 block text-sm font-medium text-slate-700">Description</label><textarea id="assignment-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="assignment-subject" className="mb-1.5 block text-sm font-medium text-slate-700">Subject</label><select id="assignment-subject" value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">No subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div><div><label htmlFor="assignment-due" className="mb-1.5 block text-sm font-medium text-slate-700">Due date</label><input id="assignment-due" type="date" required value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div></div>{formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{formError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={saving} onClick={() => { setCreating(false); setEditing(null) }}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save assignment'}</Button></div></form></section></div>}
    <div className="mb-7 grid gap-4 sm:grid-cols-3"><Summary label="To do" value={String(pendingProgress)} tone="amber" /><Summary label="Completed" value={completedValue} tone="green" /><Summary label="Due in 7 days" value={String(dueSoon)} tone="navy" /></div>
    {loading ? <p role="status" className="py-12 text-center text-sm text-slate-500">Loading assignments…</p>
      : assignments.length ? <div className="space-y-3">{assignments.map((assignment) => {
        const row = progress.find((item) => item.assignment_id === assignment.id && item.user_id === user?.id)
        const done = Boolean(row?.completed)
        const overdue = !done && new Date(assignment.due_date).getTime() < Date.now()
        const assignmentRows = progress.filter((item) => item.assignment_id === assignment.id)
        const assignmentCompleted = assignmentRows.filter((item) => item.completed).length
        return <Card key={assignment.id} className="!p-4 sm:!p-5"><div className="flex items-start gap-4">{!staff && <button type="button" disabled={pendingId === assignment.id} onClick={() => void toggleProgress(assignment)} aria-label={done ? 'Mark ' + assignment.title + ' incomplete' : 'Mark ' + assignment.title + ' complete'} className={'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ' + (done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent hover:border-cyan-700')}>{done ? <Check size={14} /> : <Circle size={14} />}</button>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-cyan-900">{subjectNames.get(assignment.subject_id ?? '') ?? 'General'}</span><span className={'rounded-full px-2 py-0.5 text-[10px] font-semibold ' + (done ? 'bg-emerald-50 text-emerald-800' : overdue ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800')}>{done ? 'Completed' : overdue ? 'Overdue' : 'Pending'}</span></div><h2 className={'mt-1 font-bold ' + (done ? 'text-slate-500 line-through' : 'text-slate-900')}>{assignment.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-500">{assignment.description}</p><p className={'mt-3 flex items-center gap-1.5 text-xs font-medium ' + (overdue ? 'text-rose-700' : 'text-slate-500')}><CalendarClock size={14} /> Due {formatDateTime(assignment.due_date)}</p>{staff && <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Student progress</p><p className="mt-1 text-xs font-semibold text-slate-700">{assignmentCompleted} completed of {studentCount} students</p>{assignmentRows.filter((item) => item.notes).map((item) => <p key={item.id} className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">{item.notes}</p>)}</div>}{!staff && <div className="mt-4 border-t border-slate-100 pt-3"><label htmlFor={'assignment-response-' + assignment.id} className="mb-1.5 block text-xs font-semibold text-slate-700">Your assignment response</label><textarea id={'assignment-response-' + assignment.id} maxLength={20000} value={submissionDrafts[assignment.id] ?? row?.notes ?? ''} onChange={(event) => setSubmissionDrafts((drafts) => ({ ...drafts, [assignment.id]: event.target.value }))} className="min-h-20 w-full rounded-lg border border-slate-300 p-2.5 text-sm" placeholder="Write your response or progress note" /><Button size="sm" variant="outline" disabled={submissionBusyId === assignment.id} onClick={() => void saveSubmission(assignment)} className="mt-2">{submissionBusyId === assignment.id ? 'Saving…' : 'Save response'}</Button></div>}</div>{staff && <div className="flex items-center gap-1"><button type="button" title={'Edit ' + assignment.title} aria-label={'Edit ' + assignment.title} onClick={() => openEdit(assignment)} className="rounded p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button><button type="button" title={'Delete ' + assignment.title} aria-label={'Delete ' + assignment.title} disabled={deletingId === assignment.id} onClick={() => void removeAssignment(assignment)} className="rounded p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /></button></div>}</div></Card>
      })}</div> : <Card className="py-12 text-center"><h2 className="font-semibold text-slate-800">No assignments yet</h2><p className="mt-1 text-sm text-slate-500">{staff ? 'Create an assignment for your classroom.' : 'Assignments from your classroom will appear here.'}</p></Card>}
  </>
}

function Summary({ label, value, tone }: { label: string; value: string; tone: string }) {
  const colors: Record<string, string> = { amber: 'text-amber-800 bg-amber-50', green: 'text-emerald-800 bg-emerald-50', navy: 'text-slate-800 bg-slate-100' }
  return <Card className="!p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={'rounded-lg px-2.5 py-1 text-lg font-bold ' + colors[tone]}>{value}</span></div></Card>
}
