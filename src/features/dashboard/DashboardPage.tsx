import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, CheckCircle2, Clock3, FileText, Plus, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeading } from '@/components/ui/PageHeading'
import { DemoNotice } from '@/components/ui/DemoNotice'
import { useCurrentRole } from '@/app/RoleContext'
import { demoAssignments, demoContributions, demoLessons, demoSubjects } from '@/lib/demoData'
import { formatDate } from '@/lib/utils'

export function DashboardPage() {
  const role = useCurrentRole()
  const subjectName = (id: string) => demoSubjects.find((subject) => subject.id === id)?.name ?? 'Classroom'
  const title = role === 'teacher' ? 'Teacher overview' : role === 'admin' ? 'Classroom overview' : 'Good morning, Aarav'
  const description = role === 'teacher' ? 'Here’s what needs your attention in Class 10A.' : role === 'admin' ? 'A quick look at your classroom activity.' : 'Here’s your classroom at a glance. Pick up where you left off.'
  return <>
    <PageHeading eyebrow="Sunday, October 18" title={title} description={description} action={role !== 'student' ? <Link to="/lessons"><Button><Plus size={16} /> New lesson</Button></Link> : undefined} />
    <DemoNotice />
    <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={BookOpen} label="Lessons this week" value="4" note="Across 3 subjects" />
      <Stat icon={Clock3} label={role === 'student' ? 'Due soon' : 'Upcoming deadlines'} value="3" note="Next one tomorrow" tone="amber" />
      <Stat icon={CheckCircle2} label="Completed" value={role === 'student' ? '6 / 8' : '72%'} note={role === 'student' ? 'Assignments this month' : 'Student assignments'} tone="green" />
      <Stat icon={role === 'admin' ? Users : FileText} label={role === 'admin' ? 'Class members' : role === 'teacher' ? 'Notes to review' : 'Notes shared'} value={role === 'admin' ? '28' : role === 'teacher' ? '2' : '12'} note={role === 'admin' ? '1 teacher · 27 students' : role === 'teacher' ? 'Waiting for your review' : 'From your classmates'} tone="cyan" />
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
      <section><SectionTitle title="Recent lessons" action={<Link to="/lessons" className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-800 hover:text-cyan-950">All lessons <ArrowRight size={15} /></Link>} />
        <div className="space-y-3">{demoLessons.slice(0, 3).map((lesson, index) => <Link key={lesson.id} to={`/lessons/${lesson.id}`} className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-cyan-300 hover:shadow-sm sm:p-5"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${index === 0 ? 'bg-teal-50 text-teal-800' : index === 1 ? 'bg-indigo-50 text-indigo-800' : 'bg-orange-50 text-orange-800'}`}>{subjectName(lesson.subject_id).slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">{subjectName(lesson.subject_id)}</span><span className="text-xs text-slate-300">·</span><span className="text-xs text-slate-500">{formatDate(lesson.lesson_date)}</span></div><h3 className="mt-1 truncate font-semibold text-slate-900 group-hover:text-cyan-900">{lesson.title}</h3><p className="mt-1 truncate text-sm text-slate-500">{lesson.description}</p></div><ArrowRight size={17} className="mt-3 shrink-0 text-slate-300 group-hover:text-cyan-700" /></Link>)}</div>
      </section>
      <section><SectionTitle title={role === 'teacher' ? 'Review queue' : 'Upcoming assignments'} action={<Link to={role === 'teacher' ? '/contributions' : '/assignments'} className="text-sm font-semibold text-cyan-800">View all</Link>} />
        {role === 'teacher' ? <div className="space-y-3">{demoContributions.map((note) => <Card key={note.id} className="!p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-cyan-800">Student note</p><p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">“{note.content}”</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Pending</span></div></Card>)}</div> : <div className="space-y-3">{demoAssignments.map((assignment) => <Card key={assignment.id} className="!p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{subjectName(assignment.subject_id ?? '')}</p><h3 className="mt-1 truncate text-sm font-semibold text-slate-900">{assignment.title}</h3><p className="mt-2 text-xs text-slate-500">Due {formatDate(assignment.due_date)}</p></div><span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">To do</span></div></Card>)}</div>}
        <div className="mt-4 rounded-xl bg-[#eaf6f6] p-4"><p className="text-sm font-semibold text-slate-800">Need help catching up?</p><p className="mt-1 text-xs leading-5 text-slate-600">Browse lesson notes and shared resources by subject.</p><Link className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-900" to="/lessons">Explore lessons <ArrowRight size={13} /></Link></div>
      </section>
    </div>
  </>
}

function Stat({ icon: Icon, label, value, note, tone = 'navy' }: { icon: typeof BookOpen; label: string; value: string; note: string; tone?: string }) {
  const colors: Record<string, string> = { navy: 'bg-slate-100 text-slate-700', amber: 'bg-amber-50 text-amber-800', green: 'bg-emerald-50 text-emerald-800', cyan: 'bg-cyan-50 text-cyan-800' }
  return <Card className="!p-4 sm:!p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p></div><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon size={17} /></span></div><p className="mt-3 text-xs text-slate-500">{note}</p></Card>
}

function SectionTitle({ title, action }: { title: string; action: React.ReactNode }) { return <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{title}</h2>{action}</div> }
