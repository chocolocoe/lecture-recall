import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, CalendarDays, Download, FileText, Pencil, Send, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeading } from '@/components/ui/PageHeading'
import { LessonForm } from '@/components/forms/LessonForm'
import type { LessonFormData } from '@/components/forms/LessonForm'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentRole } from '@/app/RoleContext'
import { supabase } from '@/lib/supabase'
import type { Lesson, LessonAttachment, LessonContribution, Subject } from '@/types'

const bucket = 'lesson-attachments'
const maxFileSize = 10 * 1024 * 1024
const allowedTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export function LessonDetailPage() {
  const { lessonId } = useParams()
  const { classroom, user } = useAuth()
  const role = useCurrentRole()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [contributions, setContributions] = useState<LessonContribution[]>([])
  const [attachments, setAttachments] = useState<LessonAttachment[]>([])
  const [teacherName, setTeacherName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [notePending, setNotePending] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [noteNotice, setNoteNotice] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentNotice, setAttachmentNotice] = useState('')
  const [downloadingId, setDownloadingId] = useState('')

  const loadLesson = useCallback(async () => {
    if (!supabase || !classroom || !lessonId) return
    setLoading(true)
    setError('')
    const { data: lessonRow, error: lessonError } = await supabase.from('lessons')
      .select('*').eq('id', lessonId).eq('classroom_id', classroom.id).maybeSingle()
    if (lessonError || !lessonRow) {
      setError(lessonError?.message ?? 'This lesson was not found in your classroom.')
      setLesson(null)
      setLoading(false)
      return
    }
    const [subjectResult, contributionResult, attachmentResult, creatorResult] = await Promise.all([
      supabase.from('subjects').select('*').eq('id', lessonRow.subject_id).eq('classroom_id', classroom.id).maybeSingle(),
      supabase.from('lesson_contributions').select('*').eq('lesson_id', lessonRow.id).order('created_at', { ascending: false }),
      supabase.from('lesson_attachments').select('*').eq('lesson_id', lessonRow.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('full_name').eq('id', lessonRow.created_by).maybeSingle(),
    ])
    const relatedError = subjectResult.error ?? contributionResult.error ?? attachmentResult.error ?? creatorResult.error
    if (relatedError) {
      setError(relatedError.message)
      setLesson(null)
      setLoading(false)
      return
    }
    setLesson(lessonRow)
    setSubject(subjectResult.data)
    setContributions(contributionResult.data ?? [])
    setAttachments(attachmentResult.data ?? [])
    setTeacherName(creatorResult.data?.full_name ?? 'Classroom staff')
    setLoading(false)
  }, [classroom, lessonId])

  useEffect(() => { void loadLesson() }, [loadLesson])

  async function saveLesson(data: LessonFormData) {
    if (!supabase || !classroom || !lesson) throw new Error('Your classroom session is unavailable.')
    const { error: saveError } = await supabase.from('lessons')
      .update({ title: data.title, description: data.description || null, subject_id: data.subject_id, lesson_date: data.lesson_date })
      .eq('id', lesson.id).eq('classroom_id', classroom.id).select('id').single()
    if (saveError) throw saveError
    setEditing(false)
    await loadLesson()
  }

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !lesson || !user) return
    setNotePending(true)
    setNoteError('')
    setNoteNotice('')
    const { error: insertError } = await supabase.from('lesson_contributions').insert({
      lesson_id: lesson.id,
      submitted_by: user.id,
      content: note.trim(),
    })
    setNotePending(false)
    if (insertError) {
      setNoteError(insertError.message)
      return
    }
    setNote('')
    setNoteNotice('Your note was submitted and is pending staff review.')
    await loadLesson()
  }

  async function uploadAttachment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !classroom || !lesson || !user || !file) return
    setAttachmentError('')
    setAttachmentNotice('')
    if (!allowedTypes.has(file.type)) {
      setAttachmentError('Choose a PDF, JPEG, PNG, plain text, or DOCX file.')
      return
    }
    if (file.size <= 0 || file.size > maxFileSize) {
      setAttachmentError('File must be between 1 byte and 10 MiB.')
      return
    }

    setUploading(true)
    const attachmentId = crypto.randomUUID()
    const path = classroom.id + '/' + lesson.id + '/' + attachmentId
    const { error: metadataError } = await supabase.from('lesson_attachments').insert({
      id: attachmentId,
      classroom_id: classroom.id,
      lesson_id: lesson.id,
      contribution_id: null,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
    })
    if (metadataError) {
      setUploading(false)
      setAttachmentError('Attachment metadata was rejected: ' + metadataError.message)
      return
    }

    const { error: storageError } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
    if (storageError) {
      const { error: fileCleanupError } = await supabase.storage.from(bucket).remove([path])
      const { error: metadataCleanupError } = fileCleanupError
        ? { error: null }
        : await supabase.from('lesson_attachments').delete().eq('id', attachmentId)
      setUploading(false)
      setAttachmentError(fileCleanupError
        ? 'Upload failed and storage cleanup was rejected, so the attachment may still exist. Ask classroom staff to inspect it. ' + storageError.message
        : metadataCleanupError
          ? 'The upload was removed, but its metadata cleanup was rejected. Ask an administrator to remove the empty attachment record. ' + metadataCleanupError.message
          : 'Upload failed; the file and metadata were cleaned up. ' + storageError.message)
      return
    }
    setUploading(false)
    setFile(null)
    setAttachmentNotice('Attachment uploaded privately.')
    await loadLesson()
  }

  async function downloadAttachment(attachment: LessonAttachment) {
    if (!supabase) return
    setDownloadingId(attachment.id)
    setAttachmentError('')
    const { data, error: downloadError } = await supabase.storage.from(bucket).download(attachment.file_path)
    setDownloadingId('')
    if (downloadError || !data) {
      setAttachmentError(downloadError?.message ?? 'The attachment could not be downloaded.')
      return
    }
    const url = URL.createObjectURL(data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = attachment.file_name
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p role="status" className="py-12 text-center text-sm text-slate-500">Loading lesson…</p>
  if (error || !lesson) return <Card><h1 className="text-lg font-bold text-slate-900">Lesson unavailable</h1><p role="alert" className="mt-2 text-sm text-rose-800">{error || 'This lesson is not available.'}</p><Link to="/lessons" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-900"><ArrowLeft size={15} /> Back to lessons</Link></Card>

  const approvedNotes = contributions.filter((item) => item.status === 'approved')
  const ownSubmissions = contributions.filter((item) => item.submitted_by === user?.id && item.status !== 'approved')
  const staff = role !== 'student'
  return <>
    <Link to="/lessons" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to lessons</Link>
    <PageHeading eyebrow={(subject?.name ?? 'Classroom') + ' · ' + formatDate(lesson.lesson_date)} title={lesson.title} description={lesson.description ?? ''} action={staff ? <Button variant="outline" onClick={() => setEditing(true)}><Pencil size={15} /> Edit lesson</Button> : undefined} />
    {editing && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="edit-lesson-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7"><h2 id="edit-lesson-title" className="mb-5 text-lg font-bold text-slate-900">Edit lesson</h2><LessonForm key={lesson.id} subjects={subject ? [subject] : []} initialData={lesson} onSubmit={saveLesson} onCancel={() => setEditing(false)} /></section></div>}
    <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
      <div className="space-y-5"><Card><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><BookOpen size={17} className="text-cyan-800" /> Published class notes</div><p className="mt-2 text-xs text-slate-500">Published notes are student contributions approved by classroom staff.</p>{approvedNotes.length ? <div className="mt-4 space-y-3">{approvedNotes.map((item) => <article key={item.id} className="rounded-xl bg-slate-50 p-4"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.content}</p><p className="mt-3 text-xs text-slate-400">Published {formatDateTime(item.reviewed_at ?? item.created_at)}</p></article>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No approved class notes have been published for this lesson yet.</p>}</Card>
        <Card><h2 className="flex items-center gap-2 font-bold text-slate-900"><FileText size={17} className="text-cyan-800" /> Private lesson attachments</h2><div className="mt-3 divide-y divide-slate-100">{attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><FileText size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{attachment.file_name}</span><span className="mt-0.5 block text-xs text-slate-500">{attachment.contribution_id ? 'Student note attachment · ' : ''}{(attachment.file_size / 1024 / 1024).toFixed(2)} MiB · {attachment.mime_type}</span></span><Button size="sm" variant="ghost" disabled={downloadingId === attachment.id} onClick={() => void downloadAttachment(attachment)} aria-label={'Download ' + attachment.file_name}><Download size={16} />{downloadingId === attachment.id ? 'Loading…' : 'Download'}</Button></div>)}</div>{!attachments.length && <p className="py-3 text-sm text-slate-500">No lesson attachments are available to you.</p>}
          {staff && <form onSubmit={uploadAttachment} className="mt-3 border-t border-slate-100 pt-4"><label htmlFor="lesson-file" className="mb-1.5 block text-sm font-medium text-slate-700">Upload a lesson file</label><input id="lesson-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,application/pdf,image/jpeg,image/png,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-cyan-900" /><p className="mt-1 text-xs text-slate-500">PDF, JPEG, PNG, TXT, or DOCX · up to 10 MiB. Files stay in private storage.</p><Button className="mt-3" type="submit" disabled={!file || uploading}><UploadCloud size={15} />{uploading ? 'Uploading…' : 'Upload privately'}</Button></form>}
          {attachmentNotice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{attachmentNotice}</p>}{attachmentError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{attachmentError}</p>}
        </Card>
      </div>
      <div className="space-y-5"><Card><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarDays size={17} className="text-cyan-800" /> Lesson details</div><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Date</dt><dd className="font-medium text-slate-800">{formatDate(lesson.lesson_date)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Subject</dt><dd className="font-medium text-slate-800">{subject?.name ?? 'Subject unavailable'}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Added by</dt><dd className="font-medium text-slate-800">{teacherName}</dd></div></dl></Card>
        {role === 'student' && <Card><h2 className="font-bold text-slate-900">Share your notes</h2><p className="mt-1 text-sm leading-5 text-slate-500">Your note stays pending until a classroom teacher or administrator reviews it.</p>{noteNotice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-800">{noteNotice}</p>}{noteError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{noteError}</p>}<form onSubmit={submitNote} className="mt-4"><label htmlFor="student-note" className="mb-1.5 block text-sm font-medium text-slate-700">Your note</label><textarea id="student-note" required minLength={1} maxLength={20000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What helped you understand this lesson?" className="min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/20" /><Button disabled={notePending} className="mt-3 w-full" type="submit"><Send size={15} />{notePending ? 'Submitting…' : 'Submit for review'}</Button></form>{ownSubmissions.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-800">Your notes for this lesson</h3><div className="mt-3 space-y-3">{ownSubmissions.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3"><span className={'rounded-full px-2 py-0.5 text-[10px] font-semibold ' + (item.status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800')}>{item.status === 'pending' ? 'Pending review' : 'Needs revision'}</span><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{item.content}</p></div>)}</div></div>}</Card>}
      </div>
    </div>
  </>
}
