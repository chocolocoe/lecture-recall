import { CalendarClock, CheckCircle2, Circle } from 'lucide-react'
import type { Assignment } from '@/types'
import { formatDate } from '@/lib/utils'
import { Card } from '@/components/ui/Card'

interface AssignmentCardProps {
  assignment: Assignment
  completed?: boolean
  onToggleComplete?: (completed: boolean) => void
}

export function AssignmentCard({ assignment, completed = false, onToggleComplete }: AssignmentCardProps) {
  return <Card className="!p-4"><div className="flex items-start gap-3"><button type="button" onClick={() => onToggleComplete?.(!completed)} aria-label={completed ? `Mark ${assignment.title} incomplete` : `Mark ${assignment.title} complete`} className="mt-0.5 text-cyan-800">{completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button><div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{assignment.title}</h3><p className="mt-1 text-sm text-slate-500">{assignment.description}</p><p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={14} />Due {formatDate(assignment.due_date)}</p></div></div></Card>
}
