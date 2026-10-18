import { ArrowUpRight, BookOpen } from 'lucide-react'
import type { Lesson, Subject } from '@/types'
import { formatDate } from '@/lib/utils'
import { Card } from '@/components/ui/Card'

interface LessonCardProps {
  lesson: Lesson
  subject?: Subject
  onClick?: () => void
}

export function LessonCard({ lesson, subject, onClick }: LessonCardProps) {
  return <Card onClick={onClick} className={onClick ? 'cursor-pointer transition hover:border-cyan-300 hover:shadow-sm' : ''}><div className="flex items-center justify-between"><span className="rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900">{subject?.name ?? 'Lesson'}</span><ArrowUpRight size={16} className="text-slate-400" /></div><p className="mt-5 text-xs font-medium text-slate-500">{formatDate(lesson.lesson_date)}</p><h3 className="mt-1 text-lg font-bold text-slate-900">{lesson.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{lesson.description ?? 'No lesson summary yet.'}</p><div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500"><BookOpen size={14} /> Lesson notes</div></Card>
}
