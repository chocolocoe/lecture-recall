import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Lesson, Subject } from '@/types'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export interface LessonFormData {
  title: string
  description: string
  subject_id: string
  lesson_date: string
}

interface LessonFormProps {
  subjects: Subject[]
  onSubmit: (data: LessonFormData) => Promise<void>
  onCancel: () => void
  initialData?: Partial<Lesson>
}

export function LessonForm({ subjects, onSubmit, onCancel, initialData }: LessonFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [subjectId, setSubjectId] = useState(initialData?.subject_id ?? subjects[0]?.id ?? '')
  const [lessonDate, setLessonDate] = useState(initialData?.lesson_date ?? new Date().toISOString().slice(0, 10))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), subject_id: subjectId, lesson_date: lessonDate })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this lesson.')
    } finally {
      setPending(false)
    }
  }

  return <form onSubmit={submit} className="space-y-4"><Input id="lesson-title" label="Lesson title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. How cells make energy" /><div><label htmlFor="lesson-description" className="mb-1.5 block text-sm font-medium text-slate-700">Summary</label><textarea id="lesson-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/20" placeholder="A short overview of the lesson" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="lesson-subject" className="mb-1.5 block text-sm font-medium text-slate-700">Subject</label><select id="lesson-subject" required disabled={!subjects.length} value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>{!subjects.length && <p className="mt-1 text-xs text-amber-800">Add a subject in Classroom before creating a lesson.</p>}</div><Input id="lesson-date" label="Lesson date" type="date" required value={lessonDate} onChange={(event) => setLessonDate(event.target.value)} /></div>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending || !subjects.length}>{pending ? 'Saving…' : 'Save lesson'}</Button></div></form>
}
