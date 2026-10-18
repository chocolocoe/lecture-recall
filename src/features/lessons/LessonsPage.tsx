import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, BookOpen, Pencil } from 'lucide-react'
import { PageHeading } from '@/components/ui/PageHeading'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { LessonForm } from '@/components/forms/LessonForm'
import type { LessonFormData } from '@/components/forms/LessonForm'
import { formatDate } from '@/lib/utils'
import { useCurrentRole } from '@/app/RoleContext'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Lesson, Subject } from '@/types'

export function LessonsPage() {
  const { classroom, user } = useAuth()
  const role = useCurrentRole()
  const [query, setQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Lesson | null>(null)
  const [creating, setCreating] = useState(false)

  const loadData = useCallback(async () => {
    if (!supabase || !classroom) return
    setLoading(true)
    setError('')
    const [subjectResult, lessonResult] = await Promise.all([
      supabase.from('subjects').select('*').eq('classroom_id', classroom.id).order('name'),
      supabase.from('lessons').select('*').eq('classroom_id', classroom.id).order('lesson_date', { ascending: false }),
    ])
    if (subjectResult.error || lessonResult.error) {
      setError(subjectResult.error?.message ?? lessonResult.error?.message ?? 'Could not load classroom lessons.')
      setLoading(false)
      return
    }
    setSubjects(subjectResult.data ?? [])
    setLessons(lessonResult.data ?? [])
    setLoading(false)
  }, [classroom])

  useEffect(() => { void loadData() }, [loadData])

  const visibleLessons = useMemo(() => lessons.filter((lesson) =>
    (subjectFilter === 'all' || lesson.subject_id === subjectFilter)
      && (lesson.title + ' ' + (lesson.description ?? '')).toLowerCase().includes(query.toLowerCase()),
  ), [lessons, query, subjectFilter])
  const subjectNames = useMemo(() => new Map(subjects.map((item) => [item.id, item.name])), [subjects])

  async function saveLesson(data: LessonFormData) {
    if (!supabase || !classroom || !user) throw new Error('Your Supabase session is unavailable. Sign in again.')
    const request = editing
      ? supabase.from('lessons').update({ title: data.title, description: data.description || null, subject_id: data.subject_id, lesson_date: data.lesson_date }).eq('id', editing.id).eq('classroom_id', classroom.id).select().single()
      : supabase.from('lessons').insert({ classroom_id: classroom.id, created_by: user.id, title: data.title, description: data.description || null, subject_id: data.subject_id, lesson_date: data.lesson_date }).select().single()
    const { error: saveError } = await request
    if (saveError) throw saveError
    setEditing(null)
    setCreating(false)
    setNotice(editing ? 'Lesson changes saved.' : 'Lesson created.')
    await loadData()
  }

  return <>
    <PageHeading eyebrow="Class archive" title="Lessons" description={'Browse lessons for ' + (classroom?.name ?? 'your classroom') + ', organized by date and subject.'} action={role !== 'student' ? <Button onClick={() => { setEditing(null); setCreating(true) }}><Plus size={16} /> Add lesson</Button> : undefined} />
    {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Lessons could not be loaded: {error}</p>}
    {(creating || editing) && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCreating(false); setEditing(null) } }}><section role="dialog" aria-modal="true" aria-labelledby="lesson-form-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7"><h2 id="lesson-form-title" className="mb-5 text-lg font-bold text-slate-900">{editing ? 'Edit lesson' : 'Add a lesson'}</h2><LessonForm key={editing?.id ?? 'new'} subjects={subjects} initialData={editing ?? undefined} onSubmit={saveLesson} onCancel={() => { setCreating(false); setEditing(null) }} /></section></div>}
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input aria-label="Search lessons" placeholder="Search lesson topics…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-10" /></div><label className="sr-only" htmlFor="subject-filter">Filter by subject</label><select id="subject-filter" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"><option value="all">All subjects</option>{subjects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
    {loading ? <p role="status" className="py-12 text-center text-sm text-slate-500">Loading lessons…</p>
      : visibleLessons.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleLessons.map((lesson) => <div key={lesson.id} className="relative"><Link to={'/lessons/' + lesson.id} className="group block h-full"><Card className="h-full transition group-hover:border-cyan-300 group-hover:shadow-sm"><div className="flex items-start justify-between"><span className="rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900">{subjectNames.get(lesson.subject_id) ?? 'Subject'}</span><BookOpen size={16} className="text-slate-300 group-hover:text-cyan-700" /></div><p className="mt-5 text-xs font-medium text-slate-500">{formatDate(lesson.lesson_date)}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{lesson.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{lesson.description || 'No lesson summary yet.'}</p></Card></Link>{role !== 'student' && <button type="button" aria-label={'Edit ' + lesson.title} onClick={() => { setCreating(false); setEditing(lesson) }} className="absolute right-5 top-5 rounded-lg bg-white p-2 text-slate-500 shadow-sm hover:text-cyan-800"><Pencil size={15} /></button>}</div>)}</div>
        : <Card className="py-12 text-center"><BookOpen className="mx-auto text-slate-300" size={26} /><h2 className="mt-3 font-semibold text-slate-800">{error ? 'Lessons are unavailable' : lessons.length ? 'No lessons match your search' : 'No lessons yet'}</h2><p className="mt-1 text-sm text-slate-500">{lessons.length ? 'Try a different search or subject.' : role === 'student' ? 'Your classroom lessons will appear here.' : 'Add a lesson after your classroom has at least one subject.'}</p></Card>}
  </>
}
