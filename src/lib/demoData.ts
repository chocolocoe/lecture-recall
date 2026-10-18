import type { Assignment, Classroom, Lesson, LessonContribution, Membership, Profile, Subject } from '@/types'

export const demoClassroom: Classroom = {
  id: 'demo-classroom', name: 'Room 204 · Class 10A', description: 'A demo classroom for exploring Lecture Recall.', owner_id: 'demo-admin', created_at: '2026-01-01', updated_at: '2026-01-01',
}

export const demoSubjects: Subject[] = [
  { id: 'biology', classroom_id: demoClassroom.id, name: 'Biology', color: '#0e9f9a', created_at: '2026-01-01' },
  { id: 'mathematics', classroom_id: demoClassroom.id, name: 'Mathematics', color: '#5166c8', created_at: '2026-01-01' },
  { id: 'history', classroom_id: demoClassroom.id, name: 'History', color: '#bb7a37', created_at: '2026-01-01' },
]

export const demoLessons: Lesson[] = [
  { id: 'lesson-1', classroom_id: demoClassroom.id, subject_id: 'biology', title: 'How cells make energy', description: 'Cellular respiration · mitochondria · ATP', lesson_date: '2026-10-16', created_by: 'demo-teacher', created_at: '2026-10-16', updated_at: '2026-10-16' },
  { id: 'lesson-2', classroom_id: demoClassroom.id, subject_id: 'mathematics', title: 'Quadratic equations', description: 'Factoring and the quadratic formula', lesson_date: '2026-10-15', created_by: 'demo-teacher', created_at: '2026-10-15', updated_at: '2026-10-15' },
  { id: 'lesson-3', classroom_id: demoClassroom.id, subject_id: 'history', title: 'The Silk Road', description: 'Trade routes and cultural exchange', lesson_date: '2026-10-14', created_by: 'demo-teacher', created_at: '2026-10-14', updated_at: '2026-10-14' },
  { id: 'lesson-4', classroom_id: demoClassroom.id, subject_id: 'biology', title: 'DNA and inheritance', description: 'Genes, chromosomes, and traits', lesson_date: '2026-10-12', created_by: 'demo-teacher', created_at: '2026-10-12', updated_at: '2026-10-12' },
]

export const demoAssignments: Assignment[] = [
  { id: 'assignment-1', classroom_id: demoClassroom.id, subject_id: 'biology', lesson_id: 'lesson-1', title: 'Cell respiration worksheet', description: 'Complete questions 1–8 and show your working.', due_date: '2026-10-21T15:30:00', created_by: 'demo-teacher', created_at: '2026-10-16', updated_at: '2026-10-16' },
  { id: 'assignment-2', classroom_id: demoClassroom.id, subject_id: 'mathematics', title: 'Quadratic practice set', description: 'Solve the six equations from page 84.', due_date: '2026-10-23T15:30:00', created_by: 'demo-teacher', created_at: '2026-10-15', updated_at: '2026-10-15' },
  { id: 'assignment-3', classroom_id: demoClassroom.id, subject_id: 'history', title: 'Silk Road map notes', description: 'Label the main trade routes and write two observations.', due_date: '2026-10-19T15:30:00', created_by: 'demo-teacher', created_at: '2026-10-14', updated_at: '2026-10-14' },
]

export const demoContributions: LessonContribution[] = [
  { id: 'contribution-1', lesson_id: 'lesson-1', submitted_by: 'demo-student-1', content: 'The inner membrane folds are called cristae. They increase the surface area for ATP production.', status: 'pending', created_at: '2026-10-17T10:20:00' },
  { id: 'contribution-2', lesson_id: 'lesson-2', submitted_by: 'demo-student-2', content: 'For equations that do not factor easily, use the quadratic formula.', status: 'pending', created_at: '2026-10-17T09:05:00' },
]

export const demoMembers: Array<{ profile: Profile; membership: Membership }> = [
  ['demo-teacher', 'Maya Chen', 'maya.chen@example.test', 'teacher'],
  ['demo-student-1', 'Aarav Patel', 'aarav.patel@example.test', 'student'],
  ['demo-student-2', 'Leah Morgan', 'leah.morgan@example.test', 'student'],
  ['demo-student-3', 'Noah Williams', 'noah.williams@example.test', 'student'],
  ['demo-admin', 'Jordan Lee', 'jordan.lee@example.test', 'admin'],
].map(([id, full_name, email, role]) => ({
  profile: { id, full_name, email, created_at: '2026-01-01', updated_at: '2026-01-01' },
  membership: { id: `membership-${id}`, user_id: id, classroom_id: demoClassroom.id, role: role as Membership['role'], joined_at: '2026-01-01' },
}))
