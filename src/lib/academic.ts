import { supabase } from '@/lib/supabase'

export type AcademicItemKind = 'subject' | 'lesson' | 'assignment' | 'contribution'

/** Remove associated private files while their metadata still authorizes Storage RLS,
 * then let the database remove the academic rows in one scoped transaction. */
export async function deleteAcademicItem(kind: AcademicItemKind, id: string) {
  if (!supabase) throw new Error('Your Supabase session is unavailable. Sign in again.')

  let query = supabase.from('lesson_attachments').select('id,file_path')
  if (kind === 'subject') {
    const { data: lessons, error } = await supabase.from('lessons').select('id').eq('subject_id', id)
    if (error) throw error
    const lessonIds = (lessons ?? []).map((lesson) => lesson.id)
    if (lessonIds.length) query = query.in('lesson_id', lessonIds)
    else query = query.eq('id', '00000000-0000-0000-0000-000000000000')
  } else if (kind === 'lesson') query = query.eq('lesson_id', id)
  else if (kind === 'contribution') query = query.eq('contribution_id', id)
  else query = query.eq('id', '00000000-0000-0000-0000-000000000000')

  const { data: attachments, error: attachmentError } = await query
  if (attachmentError) throw attachmentError
  const paths = (attachments ?? []).map((attachment) => attachment.file_path)
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('lesson-attachments').remove(paths)
    if (storageError) throw new Error(`Private files could not be removed; the content was kept. ${storageError.message}`)
  }

  const { error } = await supabase.rpc('delete_academic_item', { p_kind: kind, p_id: id })
  if (error) throw error
}
