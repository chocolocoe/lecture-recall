import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Clock3, FileText, X } from 'lucide-react'
import { useCurrentRole } from '@/app/RoleContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeading } from '@/components/ui/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import type { Lesson, LessonContribution, Profile } from '@/types'

export function ContributionsPage() {
  const { classroom, user } = useAuth()
  const role = useCurrentRole()
  const isStudent = role === 'student'
  const [contributions, setContributions] = useState<LessonContribution[]>([])
  const [lessons, setLessons] = useState<Map<string, Lesson>>(new Map())
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  const load = useCallback(async () => {
    if (!supabase || !classroom || !user) return
    setLoading(true)
    setError('')
    let query = supabase.from('lesson_contributions').select('*').order('created_at', { ascending: false })
    if (isStudent) query = query.eq('submitted_by', user.id)
    const { data, error: queryError } = await query
    if (queryError) {
      setError(queryError.message)
      setContributions([])
      setLoading(false)
      return
    }
    const rows = data ?? []
    setContributions(rows)
    if (rows.length) {
      const lessonIds = [...new Set(rows.map((row) => row.lesson_id))]
      const authorIds = [...new Set(rows.map((row) => row.submitted_by))]
      const [lessonResult, authorResult] = await Promise.all([
        supabase.from('lessons').select('*').in('id', lessonIds).eq('classroom_id', classroom.id),
        supabase.from('profiles').select('*').in('id', authorIds),
      ])
      if (lessonResult.error || authorResult.error) {
        setError(lessonResult.error?.message ?? authorResult.error?.message ?? 'Could not load contribution details.')
        setLessons(new Map())
        setAuthors(new Map())
      } else {
        setLessons(new Map((lessonResult.data ?? []).map((lesson) => [lesson.id, lesson])))
        setAuthors(new Map((authorResult.data ?? []).map((author) => [author.id, author])))
      }
    } else {
      setLessons(new Map())
      setAuthors(new Map())
    }
    setLoading(false)
  }, [classroom, isStudent, user])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => contributions.filter((item) => filter === 'all' || item.status === filter), [contributions, filter])

  async function review(id: string, status: 'approved' | 'rejected') {
    if (!supabase) return
    setBusyId(id)
    setError('')
    setNotice('')
    const { data, error: invokeError } = await supabase.functions.invoke<{ error?: string; contribution?: LessonContribution }>('review-contribution', {
      body: { contributionId: id, status },
    })
    setBusyId('')
    if (invokeError) {
      setError('Review request failed: ' + invokeError.message)
      return
    }
    if (data?.error) {
      setError('Review request failed: ' + data.error)
      return
    }
    setNotice(status === 'approved' ? 'Note approved and published.' : 'Note rejected.')
    await load()
  }

  return <>
    <PageHeading eyebrow={isStudent ? 'Your contributions' : 'Classroom moderation'} title={isStudent ? 'My submitted notes' : 'Note review'} description={isStudent ? 'Track the review status of notes you have shared.' : 'Review student notes before they are published to classmates.'} />
    {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Contributions could not be loaded or changed: {error}</p>}
    {!isStudent && <div className="mb-4 flex items-center gap-3"><label htmlFor="contribution-filter" className="text-sm font-medium text-slate-700">Status</label><select id="contribution-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>}
    {loading ? <p role="status" className="py-12 text-center text-sm text-slate-500">Loading notes…</p>
      : visible.length ? <div className="space-y-4">{visible.map((item) => {
        const lesson = lessons.get(item.lesson_id)
        const author = authors.get(item.submitted_by)
        const pending = item.status === 'pending'
        const statusClass = item.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : item.status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'
        return <Card key={item.id}><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800"><FileText size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900">{lesson?.title ?? 'Lesson'}</h2><span className={'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ' + statusClass}>{item.status === 'pending' ? <><Clock3 size={12} className="mr-1 inline" />Pending review</> : item.status === 'approved' ? 'Published' : 'Rejected'}</span></div><p className="mt-1 text-xs text-slate-500">{isStudent ? 'Submitted' : 'By ' + (author?.display_name || author?.full_name || 'Class member') + ' · submitted'} {formatDateTime(item.created_at)}{item.reviewed_at ? ' · reviewed ' + formatDateTime(item.reviewed_at) : ''}</p><blockquote className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{item.content}</blockquote>{lesson && <Link to={'/lessons/' + lesson.id} className="mt-3 inline-flex text-xs font-semibold text-cyan-900 hover:underline">Open lesson</Link>}{!isStudent && pending && <div className="mt-4 flex gap-2"><Button size="sm" disabled={busyId === item.id} onClick={() => void review(item.id, 'approved')}><Check size={14} />{busyId === item.id ? 'Saving…' : 'Approve'}</Button><Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void review(item.id, 'rejected')}><X size={14} />Reject</Button></div>}</div></div></Card>
      })}</div> : <Card className="py-12 text-center"><FileText className="mx-auto text-slate-300" size={25} /><h2 className="mt-3 font-semibold text-slate-800">{filter === 'all' ? 'No notes yet' : 'No ' + filter + ' notes'}</h2><p className="mt-1 text-sm text-slate-500">{isStudent ? 'Notes you submit from a lesson will appear here with their review status.' : 'Student contributions will appear here when submitted.'}</p></Card>}
  </>
}
