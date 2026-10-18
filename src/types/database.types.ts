// Manually aligned with the versioned SQL migrations. Regenerate with
// `supabase gen types typescript --local` after applying migrations locally.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Table<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        { id: string; email: string; full_name: string; display_name: string | null; avatar_url: string | null; created_at: string; updated_at: string },
        { id: string; email: string; full_name: string; display_name?: string | null; avatar_url?: string | null; created_at?: string; updated_at?: string },
        { full_name?: string; display_name?: string | null; avatar_url?: string | null }
      >
      classrooms: Table<
        { id: string; name: string; description: string | null; owner_id: string; created_at: string; updated_at: string },
        { id?: string; name: string; description?: string | null; owner_id: string; created_at?: string; updated_at?: string },
        { name?: string; description?: string | null }
      >
      memberships: Table<
        { id: string; user_id: string; classroom_id: string; role: Database['public']['Enums']['user_role']; joined_at: string },
        { id?: string; user_id: string; classroom_id: string; role?: Database['public']['Enums']['user_role']; joined_at?: string },
        never
      >
      subjects: Table<
        { id: string; classroom_id: string; name: string; color: string | null; created_at: string },
        { id?: string; classroom_id: string; name: string; color?: string | null; created_at?: string },
        { name?: string; color?: string | null }
      >
      lessons: Table<
        { id: string; classroom_id: string; subject_id: string; title: string; description: string | null; lesson_date: string; created_by: string; created_at: string; updated_at: string },
        { id?: string; classroom_id: string; subject_id: string; title: string; description?: string | null; lesson_date: string; created_by: string; created_at?: string; updated_at?: string },
        { subject_id?: string; title?: string; description?: string | null; lesson_date?: string }
      >
      lesson_contributions: Table<
        { id: string; lesson_id: string; submitted_by: string; content: string; status: Database['public']['Enums']['contribution_status']; reviewed_by: string | null; reviewed_at: string | null; created_at: string },
        { id?: string; lesson_id: string; submitted_by: string; content: string; status?: Database['public']['Enums']['contribution_status']; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string },
        { status?: Database['public']['Enums']['contribution_status']; reviewed_by?: string | null; reviewed_at?: string | null }
      >
      lesson_attachments: Table<
        { id: string; classroom_id: string; lesson_id: string; contribution_id: string | null; file_name: string; file_path: string; file_size: number; mime_type: string; uploaded_by: string; created_at: string },
        { id?: string; classroom_id: string; lesson_id: string; contribution_id?: string | null; file_name: string; file_path: string; file_size: number; mime_type: string; uploaded_by: string; created_at?: string },
        never
      >
      assignments: Table<
        { id: string; classroom_id: string; subject_id: string | null; lesson_id: string | null; title: string; description: string | null; due_date: string; created_by: string; created_at: string; updated_at: string },
        { id?: string; classroom_id: string; subject_id?: string | null; lesson_id?: string | null; title: string; description?: string | null; due_date: string; created_by: string; created_at?: string; updated_at?: string },
        { subject_id?: string | null; lesson_id?: string | null; title?: string; description?: string | null; due_date?: string }
      >
      assignment_progress: Table<
        { id: string; assignment_id: string; user_id: string; completed: boolean; completed_at: string | null; notes: string | null },
        { id?: string; assignment_id: string; user_id: string; completed?: boolean; completed_at?: string | null; notes?: string | null },
        { assignment_id?: string; user_id?: string; completed?: boolean; completed_at?: string | null; notes?: string | null }
      >
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: 'admin' | 'teacher' | 'student'
      contribution_status: 'pending' | 'approved' | 'rejected'
    }
    CompositeTypes: Record<string, never>
  }
}
