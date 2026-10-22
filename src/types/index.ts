// Core domain types for Lecture Recall

export type UserRole = 'admin' | 'teacher' | 'student'

export type ContributionStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  username: string
  full_name: string
  display_name?: string | null
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

export interface Classroom {
  id: string
  name: string
  description?: string | null
  owner_id: string
  created_at: string
  updated_at: string
}

export interface Membership {
  id: string
  user_id: string
  classroom_id: string
  role: UserRole
  joined_at: string
}

export interface Subject {
  id: string
  classroom_id: string
  name: string
  color?: string | null
  created_at: string
}

export interface Lesson {
  id: string
  classroom_id: string
  subject_id: string
  title: string
  description?: string | null
  lesson_date: string
  published: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface LessonContribution {
  id: string
  lesson_id: string
  submitted_by: string
  title: string | null
  content: string
  status: ContributionStatus
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
}

export interface LessonAttachment {
  id: string
  classroom_id: string
  lesson_id: string
  contribution_id?: string | null
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  uploaded_by: string
  created_at: string
}

export interface Assignment {
  id: string
  classroom_id: string
  subject_id?: string | null
  lesson_id?: string | null
  title: string
  description?: string | null
  due_date: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface AssignmentProgress {
  id: string
  assignment_id: string
  user_id: string
  completed: boolean
  completed_at?: string | null
  notes?: string | null
}
