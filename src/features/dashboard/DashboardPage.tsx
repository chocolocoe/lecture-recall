import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, CheckCircle2, Clock3, FileText, Plus, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeading } from '@/components/ui/PageHeading'
import { useCurrentRole } from '@/app/RoleContext'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { Assignment, Lesson, LessonContribution, Subject } from '@/types'

export function DashboardPage() {
  const role = useCurrentRole()
  const { user, classroom } = useAuth()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [contributions, setContributions] = useState<LessonContribution[]>([])
  const [lessonCount, setLessonCount] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [progressCount, setProgressCount] = useState(0)
  const [memberCount, setMemberCount] = useState(0)
  const [studentCount, setStudentCount] = useState(0)
  const [teacherCount, setTeacherCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    if (!supabase || !classroom || !user) return
    setLoading(true)
    setError('')
    setLessons([])
    setSubjects([])
    setAssignments([])
    setContributions([])
    setLessonCount(0)
    setCompletedCount(0)
    setProgressCount(0)
    setMemberCount(0)
    setStudentCount(0)
    setTeacherCount(0)

    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setHours(0, 0, 0, 0)
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7))
    const weekDate = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}`
    const [lessonResult, recentResult, subjectResult, assignmentResult, membersResult] = await Promise.all([
      supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('classroom_id', classroom.id).gte('lesson_date', weekDate),
      supabase.from('lessons').select('*').eq('classroom_id', classroom.id).order('lesson_date', { ascending: false }).limit(3),
      supabase.from('subjects').select('*').eq('classroom_id', classroom.id),
      supabase.from('assignments').select('*').eq('classroom_id', classroom.id).gte('due_date', now.toISOString()).order('due_date').limit(20),
      role !== 'student'
        ? supabase.from('memberships').select('role').eq('classroom_id', classroom.id)
        : Promise.resolve({ data: null, error: null }),
    ])
    const queryError = lessonResult.error ?? recentResult.error ?? subjectResult.error ?? assignmentResult.error ?? membersResult.error
    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }

    const recentLessons = recentResult.data ?? []
    const assignmentRows = assignmentResult.data ?? []
    let classroomStudentCount = 0
    setLessonCount(lessonResult.count ?? 0)
    setLessons(recentLessons)
    setSubjects(subjectResult.data ?? [])
    setAssignments(assignmentRows)

    if (role !== 'student') {
      const memberRows = membersResult.data ?? []
      setMemberCount(memberRows.length)
      setTeacherCount(memberRows.filter((item) => item.role === 'teacher').length)
      const students = memberRows.filter((item) => item.role === 'student').length
      setStudentCount(students)
      classroomStudentCount = students
    }

    if (assignmentRows.length) {
      const progressQuery = supabase.from('assignment_progress').select('assignment_id, completed')
        .in('assignment_id', assignmentRows.map((item) => item.id))
      const progressResult = role === 'student'
        ? await progressQuery.eq('user_id', user.id)
        : await progressQuery
      if (progressResult.error) {
        setError(progressResult.error.message)
        setLoading(false)
        return
      }
      const progressRows = progressResult.data ?? []
      setProgressCount(role === 'student' ? assignmentRows.length : classroomStudentCount * assignmentRows.length)
      setCompletedCount(progressRows.filter((item) => item.completed).length)
    } else {
      setProgressCount(role === 'student' ? 0 : classroomStudentCount * assignmentRows.length)
      setCompletedCount(0)
    }

    if (recentLessons.length) {
      const contributionResult = await supabase.from('lesson_contributions').select('*')
        .in('lesson_id', recentLessons.map((item) => item.id))
        .order('created_at', { ascending: false })
      if (contributionResult.error) {
        setError(contributionResult.error.message)
        setLoading(false)
        return
      }
      setContributions(contributionResult.data ?? [])
    } else {
      setContributions([])
    }
    setLoading(false)
  }, [classroom, role, user])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  const subjectName = (id: string | null) => subjects.find((subject) => subject.id === id)?.name ?? 'General'
  const staff = role !== 'student'
  const pendingNotes = contributions.filter((item) => item.status === 'pending')
  const sharedNotes = contributions.filter((item) => item.status === 'approved').length
  const dueSoon = assignments.filter((assignment) => new Date(assignment.due_date).getTime() <= Date.now() + 7 * 86400000).length
  const title = role === 'teacher' ? 'Teacher overview' : role === 'admin' ? 'Classroom overview' : `Welcome${user?.user_metadata?.full_name ? `, ${String(user.user_metadata.full_name).split(' ')[0]}` : ''}`
  const description = role === 'teacher' ? `Here’s what needs your attention in ${classroom?.name ?? 'your classroom'}.` : role === 'admin' ? 'A quick look at your classroom activity.' : 'Here’s your classroom at a glance. Pick up where you left off.'
  const now = new Date()

  return <>
    <PageHeading eyebrow={new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(now)} title={title} description={description} action={staff ? <Link to="/lessons"><Button><Plus size={16} /> New lesson</Button></Link> : undefined} />
    {error && <p role="alert" className="mb-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Classroom dashboard data could not be loaded: {error}</p>}
    <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={BookOpen} label="Lessons this week" value={loading ? '…' : String(lessonCount)} note="In your classroom" />
      <Stat icon={Clock3} label={role === 'student' ? 'Due soon' : 'Upcoming deadlines'} value={loading ? '…' : String(dueSoon)} note="Due in the next 7 days" tone="amber" />
      <Stat icon={CheckCircle2} label={role === 'student' ? 'Completed' : 'Student completion'} value={loading ? '…' : staff ? progressCount ? `${Math.round(completedCount / progressCount * 100)}%` : '—' : `${completedCount} / ${progressCount}`} note={staff ? 'For upcoming assignments' : 'Upcoming assignments'} tone="green" />
      <Stat icon={role === 'admin' ? Users : FileText} label={role === 'admin' ? 'Class members' : role === 'teacher' ? 'Notes to review' : 'Notes shared'} value={loading ? '…' : role === 'admin' ? String(memberCount) : role === 'teacher' ? String(pendingNotes.length) : String(sharedNotes)} note={role === 'admin' ? `${teacherCount} teachers · ${studentCount} students` : role === 'teacher' ? 'Pending on recent lessons' : 'Approved on recent lessons'} tone="cyan" />
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
      <section><SectionTitle title="Recent lessons" action={<Link to="/lessons" className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-800 hover:text-cyan-950">All lessons <ArrowRight size={15} /></Link>} />
        {loading ? <Card role="status" className="py-8 text-center text-sm text-slate-500">Loading classroom lessons…</Card> : lessons.length ? <div className="space-y-3">{lessons.map((lesson, index) => <Link key={lesson.id} to={`/lessons/${lesson.id}`} className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-cyan-300 hover:shadow-sm sm:p-5"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${index === 0 ? 'bg-teal-50 text-teal-800' : index === 1 ? 'bg-indigo-50 text-indigo-800' : 'bg-orange-50 text-orange-800'}`}>{subjectName(lesson.subject_id).slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">{subjectName(lesson.subject_id)}</span><span className="text-xs text-slate-300">·</span><span className="text-xs text-slate-500">{formatDate(lesson.lesson_date)}</span></div><h3 className="mt-1 truncate font-semibold text-slate-900 group-hover:text-cyan-900">{lesson.title}</h3><p className="mt-1 truncate text-sm text-slate-500">{lesson.description}</p></div><ArrowRight size={17} className="mt-3 shrink-0 text-slate-300 group-hover:text-cyan-700" /></Link>)}</div> : <Card className="py-8 text-center text-sm text-slate-500">No classroom lessons are available yet.</Card>}
      </section>
      <section><SectionTitle title={role === 'teacher' ? 'Review queue' : 'Upcoming assignments'} action={<Link to={role === 'teacher' ? '/contributions' : '/assignments'} className="text-sm font-semibold text-cyan-800">View all</Link>} />
        {loading ? <Card role="status" className="py-8 text-center text-sm text-slate-500">Loading classroom activity…</Card> : role === 'teacher' ? pendingNotes.length ? <div className="space-y-3">{pendingNotes.slice(0, 3).map((note) => <Card key={note.id} className="!p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-cyan-800">Student note</p><p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">“{note.content}”</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Pending</span></div></Card>)}</div> : <Card className="py-6 text-center text-sm text-slate-500">No pending notes on recent lessons.</Card> : assignments.length ? <div className="space-y-3">{assignments.slice(0, 3).map((assignment) => <Card key={assignment.id} className="!p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{subjectName(assignment.subject_id ?? null)}</p><h3 className="mt-1 truncate text-sm font-semibold text-slate-900">{assignment.title}</h3><p className="mt-2 text-xs text-slate-500">Due {formatDate(assignment.due_date)}</p></div><span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">{new Date(assignment.due_date).getTime() <= Date.now() + 7 * 86400000 ? 'Due soon' : 'Upcoming'}</span></div></Card>)}</div> : <Card className="py-6 text-center text-sm text-slate-500">No upcoming assignments.</Card>}
        <div className="overview-explore mt-4 rounded-xl bg-[#eaf6f6] p-4"><p className="text-sm font-semibold text-slate-800">Need help catching up?</p><p className="mt-1 text-xs leading-5 text-slate-600">Browse lesson notes and shared resources by subject.</p><Link className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-900" to="/lessons">Explore lessons <ArrowRight size={13} /></Link></div>
      </section>
    </div>
  </>
}

function Stat({ icon: Icon, label, value, note, tone = 'navy' }: { icon: typeof BookOpen; label: string; value: string; note: string; tone?: string }) {
  const colors: Record<string, string> = { navy: 'bg-slate-100 text-slate-700', amber: 'bg-amber-50 text-amber-800', green: 'bg-emerald-50 text-emerald-800', cyan: 'bg-cyan-50 text-cyan-800' }
  return <Card className="!p-4 sm:!p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p></div><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon size={17} /></span></div><p className="mt-3 text-xs text-slate-500">{note}</p></Card>
}

function SectionTitle({ title, action }: { title: string; action: React.ReactNode }) { return <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{title}</h2>{action}</div> }
