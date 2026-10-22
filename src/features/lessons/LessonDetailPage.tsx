import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, CalendarDays, Download, FileText, Pencil, Replace, Send, Trash2, UploadCloud } from 'lucide-react'
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
  const [noteTitle, setNoteTitle] = useState('')
  const [note, setNote] = useState('')
  const [notePreview, setNotePreview] = useState(false)
  const [noteFiles, setNoteFiles] = useState<File[]>([])
  const [notePending, setNotePending] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [noteNotice, setNoteNotice] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentNotice, setAttachmentNotice] = useState('')
  const [downloadingId, setDownloadingId] = useState('')
  const [fileActionId, setFileActionId] = useState('')

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
    if (!supabase || !lesson || !classroom || !user) return
    if (!noteTitle.trim() || !note.trim()) {
      setNoteError('Enter a note title and note content before submitting.')
      return
    }
    setNotePending(true)
    setNoteError('')
    setNoteNotice('')
    const contributionId = crypto.randomUUID()
    const metadataIds: string[] = []
    let failure = ''
    try {
      const { error: insertError } = await supabase.from('lesson_contributions').insert({
        id: contributionId,
        lesson_id: lesson.id,
        submitted_by: user.id,
        title: noteTitle.trim(),
        content: note.trim(),
      })
      if (insertError) throw new Error(insertError.message)
      for (const attachment of noteFiles) {
        const attachmentId = crypto.randomUUID()
        const path = `${classroom.id}/${lesson.id}/${attachmentId}`
        metadataIds.push(attachmentId)
        const { error: metadataError } = await supabase.from('lesson_attachments').insert({
          id: attachmentId,
          classroom_id: classroom.id,
          lesson_id: lesson.id,
          contribution_id: contributionId,
          file_name: attachment.name,
          file_path: path,
          file_size: attachment.size,
          mime_type: attachment.type,
          uploaded_by: user.id,
        })
        if (metadataError) throw new Error(`${attachment.name}: attachment record was rejected. ${metadataError.message}`)
        const { error: storageError } = await supabase.storage.from(bucket).upload(path, attachment, { contentType: attachment.type, upsert: false })
        if (storageError) throw new Error(`${attachment.name}: private upload failed. ${storageError.message}`)
      }
    } catch (caught) {
      failure = caught instanceof Error ? caught.message : 'The note submission failed unexpectedly.'
      const cleanupErrors: string[] = []
      for (const attachmentId of metadataIds) {
        const path = `${classroom.id}/${lesson.id}/${attachmentId}`
        try {
          const { data: metadata, error: metadataQueryError } = await supabase.from('lesson_attachments').select('id').eq('id', attachmentId).maybeSingle()
          if (metadataQueryError) { cleanupErrors.push(`${attachmentId}: metadata lookup failed (${metadataQueryError.message})`); continue }
          if (!metadata) continue
          const { error: storageCleanupError } = await supabase.storage.from(bucket).remove([path])
          if (storageCleanupError) { cleanupErrors.push(`${attachmentId}: file cleanup failed (${storageCleanupError.message})`); continue }
          const { error: metadataCleanupError } = await supabase.from('lesson_attachments').delete().eq('id', attachmentId)
          if (metadataCleanupError) cleanupErrors.push(`${attachmentId}: metadata cleanup failed (${metadataCleanupError.message})`)
        } catch (cleanupError) {
          cleanupErrors.push(`${attachmentId}: ${cleanupError instanceof Error ? cleanupError.message : 'cleanup failed'}`)
        }
      }
      if (!cleanupErrors.length) {
        try {
          const { error: contributionCleanupError } = await supabase.from('lesson_contributions').delete().eq('id', contributionId).eq('submitted_by', user.id).eq('status', 'pending')
          if (contributionCleanupError) cleanupErrors.push(`note cleanup failed (${contributionCleanupError.message})`)
        } catch (cleanupError) {
          cleanupErrors.push(`note cleanup failed (${cleanupError instanceof Error ? cleanupError.message : 'cleanup failed'})`)
        }
      }
      setNoteError(cleanupErrors.length
        ? `${failure} Cleanup is incomplete. The pending note was kept; inspect it below before retrying. ${cleanupErrors.join('; ')}`
        : `${failure} The incomplete note and uploaded files were safely removed. Your text and selected files remain in the form; you can retry.`)
    } finally {
      setNotePending(false)
    }
    if (failure) {
      try { await loadLesson() } catch { /* Keep the actionable submission and cleanup error visible. */ }
      return
    }
    setNote('')
    setNoteTitle('')
    setNoteFiles([])
    setNotePreview(false)
    setNoteNotice(`Your note was submitted with ${noteFiles.length} attachment${noteFiles.length === 1 ? '' : 's'} and is pending staff review.`)
    await loadLesson()
  }

  function selectNoteFiles(files: FileList | null) {
    if (!files) return
    const candidates = [...noteFiles, ...Array.from(files)]
    const seen = new Set<string>()
    const unique = candidates.filter((candidate) => {
      const key = `${candidate.name}:${candidate.size}:${candidate.lastModified}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const invalid = unique.find((candidate) => !allowedTypes.has(candidate.type) || candidate.size <= 0 || candidate.size > maxFileSize)
    if (invalid) {
      setNoteError(!allowedTypes.has(invalid.type)
        ? `${invalid.name} is not a supported file. Choose PDF, JPEG, PNG, TXT, or DOCX.`
        : `${invalid.name} must be larger than 0 bytes and no larger than 10 MiB.`)
      return
    }
    setNoteError('')
    setNoteFiles(unique)
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
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

  async function deleteAttachment(attachment: LessonAttachment) {
    if (!supabase || !window.confirm(`Delete “${attachment.file_name}” permanently?`)) return
    setFileActionId(attachment.id)
    setAttachmentError('')
    const { error: storageError } = await supabase.storage.from(bucket).remove([attachment.file_path])
    if (storageError) { setAttachmentError('The file was kept because Storage could not remove it. ' + storageError.message); setFileActionId(''); return }
    const { error: metadataError } = await supabase.from('lesson_attachments').delete().eq('id', attachment.id).eq('lesson_id', lesson!.id)
    setFileActionId('')
    if (metadataError) { setAttachmentError('File bytes were removed, but metadata cleanup failed. Retry from this row. ' + metadataError.message); return }
    setAttachments((rows) => rows.filter((row) => row.id !== attachment.id))
    setAttachmentNotice('Attachment deleted.')
  }

  async function replaceAttachment(attachment: LessonAttachment, replacement: File) {
    if (!supabase || !classroom || !lesson || !user) return
    if (!allowedTypes.has(replacement.type) || replacement.size <= 0 || replacement.size > maxFileSize) {
      setAttachmentError('Choose a supported PDF, JPEG, PNG, plain text, or DOCX file between 1 byte and 10 MiB.')
      return
    }
    if (!window.confirm(`Replace “${attachment.file_name}” with “${replacement.name}”? The original file will be removed after the replacement uploads.`)) return
    setFileActionId(attachment.id)
    setAttachmentError('')
    const id = crypto.randomUUID()
    const path = `${classroom.id}/${lesson.id}/${id}`
    const { error: metadataError } = await supabase.from('lesson_attachments').insert({
      id, classroom_id: classroom.id, lesson_id: lesson.id, contribution_id: attachment.contribution_id,
      file_name: replacement.name, file_path: path, file_size: replacement.size,
      mime_type: replacement.type, uploaded_by: user.id,
    })
    if (metadataError) { setFileActionId(''); setAttachmentError('Replacement was not uploaded: ' + metadataError.message); return }
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, replacement, { contentType: replacement.type, upsert: false })
    if (uploadError) {
      await supabase.storage.from(bucket).remove([path])
      await supabase.from('lesson_attachments').delete().eq('id', id)
      setFileActionId('')
      setAttachmentError('Replacement upload failed; the original file was kept. ' + uploadError.message)
      return
    }
    const { error: oldFileError } = await supabase.storage.from(bucket).remove([attachment.file_path])
    if (oldFileError) {
      setFileActionId('')
      setAttachmentError('New file uploaded, but the original could not be removed. Both files remain available. ' + oldFileError.message)
      await loadLesson()
      return
    }
    const { error: oldMetadataError } = await supabase.from('lesson_attachments').delete().eq('id', attachment.id)
    setFileActionId('')
    if (oldMetadataError) { setAttachmentError('Original file bytes were removed, but its metadata cleanup failed. ' + oldMetadataError.message); await loadLesson(); return }
    setAttachmentNotice('Attachment replaced.')
    await loadLesson()
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
      <div className="space-y-5"><Card><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><BookOpen size={17} className="text-cyan-800" /> Published class notes</div><p className="mt-2 text-xs text-slate-500">Published notes are student contributions approved by classroom staff.</p>{approvedNotes.length ? <div className="mt-4 space-y-3">{approvedNotes.map((item) => <article key={item.id} className="rounded-xl bg-slate-50 p-4">{item.title && <h3 className="mb-2 font-semibold text-slate-800">{item.title}</h3>}<p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.content}</p><p className="mt-3 text-xs text-slate-400">Published {formatDateTime(item.reviewed_at ?? item.created_at)}</p></article>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No approved class notes have been published for this lesson yet.</p>}</Card>
        <Card><h2 className="flex items-center gap-2 font-bold text-slate-900"><FileText size={17} className="text-cyan-800" /> Private lesson attachments</h2><div className="mt-3 divide-y divide-slate-100">{attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><FileText size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{attachment.file_name}</span><span className="mt-0.5 block text-xs text-slate-500">{attachment.contribution_id ? 'Student note attachment · ' : ''}{(attachment.file_size / 1024 / 1024).toFixed(2)} MiB · {attachment.mime_type}</span></span><Button size="sm" variant="ghost" disabled={downloadingId === attachment.id} onClick={() => void downloadAttachment(attachment)} aria-label={'Download ' + attachment.file_name}><Download size={16} />{downloadingId === attachment.id ? 'Loading…' : 'Download'}</Button>{(staff || (attachment.contribution_id && contributions.some((item) => item.id === attachment.contribution_id && item.submitted_by === user?.id && item.status === 'pending'))) && <><label title={'Replace ' + attachment.file_name} aria-label={'Replace ' + attachment.file_name} className="cursor-pointer rounded p-2 text-slate-500 hover:bg-slate-100"><Replace size={15} /><input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.txt,.docx" disabled={fileActionId === attachment.id} onChange={(event) => { const replacement = event.target.files?.[0]; if (replacement) void replaceAttachment(attachment, replacement); event.target.value = '' }} /></label><button type="button" title={'Delete ' + attachment.file_name} aria-label={'Delete ' + attachment.file_name} disabled={fileActionId === attachment.id} onClick={() => void deleteAttachment(attachment)} className="rounded p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /></button></>}</div>)}</div>{!attachments.length && <p className="py-3 text-sm text-slate-500">No lesson attachments are available to you.</p>}
          {staff && <form onSubmit={uploadAttachment} className="mt-3 border-t border-slate-100 pt-4"><label htmlFor="lesson-file" className="mb-1.5 block text-sm font-medium text-slate-700">Upload a lesson file</label><input id="lesson-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,application/pdf,image/jpeg,image/png,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-cyan-900" /><p className="mt-1 text-xs text-slate-500">PDF, JPEG, PNG, TXT, or DOCX · up to 10 MiB. Files stay in private storage.</p><Button className="mt-3" type="submit" disabled={!file || uploading}><UploadCloud size={15} />{uploading ? 'Uploading…' : 'Upload privately'}</Button></form>}
          {attachmentNotice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{attachmentNotice}</p>}{attachmentError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{attachmentError}</p>}
        </Card>
      </div>
      <div className="space-y-5"><Card><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarDays size={17} className="text-cyan-800" /> Lesson details</div><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Date</dt><dd className="font-medium text-slate-800">{formatDate(lesson.lesson_date)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Subject</dt><dd className="font-medium text-slate-800">{subject?.name ?? 'Subject unavailable'}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Added by</dt><dd className="font-medium text-slate-800">{teacherName}</dd></div></dl></Card>
        {role === 'student' && <Card><h2 className="font-bold text-slate-900">Share your notes</h2><p className="mt-1 text-sm leading-5 text-slate-500">Your note and attachments stay private until a classroom teacher or administrator reviews them.</p>{noteNotice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-800">{noteNotice}</p>}{noteError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{noteError}</p>}<form onSubmit={submitNote} className="mt-4"><label htmlFor="student-note-title" className="mb-1.5 block text-sm font-medium text-slate-700">Note title</label><input id="student-note-title" required maxLength={160} value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Give your note a clear title" className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><label htmlFor="student-note" className="mb-1.5 block text-sm font-medium text-slate-700">Your note</label><textarea id="student-note" required minLength={1} maxLength={20000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What helped you understand this lesson?" className="min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/20" /><div className="my-3 flex justify-end"><Button type="button" size="sm" variant="outline" disabled={notePending} aria-expanded={notePreview} aria-controls="student-note-preview" onClick={() => setNotePreview((visible) => !visible)}>{notePreview ? "Hide preview" : "Preview note"}</Button></div>{notePreview && <section id="student-note-preview" aria-label="Note preview" aria-live="polite" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-semibold text-slate-800">Note preview</h3><h4 className="mt-3 font-semibold text-slate-900">{noteTitle.trim() || "Untitled note"}</h4><p className="mt-2 min-h-6 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.trim() || "Your note text will appear here."}</p>{noteFiles.length > 0 && <div className="mt-3 border-t border-slate-200 pt-3"><h4 className="text-xs font-semibold text-slate-700">Attachments</h4><ul className="mt-2 space-y-1">{noteFiles.map((selected) => <li key={selected.name + selected.lastModified} className="truncate text-xs text-slate-600">{selected.name} ({(selected.size / 1024).toFixed(0)} KiB)</li>)}</ul></div>}</section>}<label htmlFor="student-note-files" className="mt-4 mb-1.5 block text-sm font-medium text-slate-700">Attach files (optional)</label><input id="student-note-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,application/pdf,image/jpeg,image/png,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={notePending} onChange={(event) => { selectNoteFiles(event.target.files); event.target.value = '' }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-cyan-900" /><p className="mt-1 text-xs text-slate-500">PDF, JPEG, PNG, TXT, or DOCX; up to 10 MiB per file.</p>{noteFiles.length > 0 && <ul className="mt-3 space-y-2" aria-label="Selected note attachments">{noteFiles.map((selected, index) => <li key={selected.name + selected.lastModified} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate">{selected.name} · {(selected.size / 1024).toFixed(0)} KiB</span><button type="button" disabled={notePending} aria-label={'Remove selected file ' + selected.name} onClick={() => setNoteFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))} className="rounded p-1 text-rose-700 hover:bg-rose-100">Remove</button></li>)}</ul>}<Button disabled={notePending} className="mt-3 w-full" type="submit"><Send size={15} />{notePending ? 'Submitting note and files…' : 'Submit for review'}</Button></form>{ownSubmissions.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-800">Your notes for this lesson</h3><div className="mt-3 space-y-3">{ownSubmissions.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3"><span className={'rounded-full px-2 py-0.5 text-[10px] font-semibold ' + (item.status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800')}>{item.status === 'pending' ? 'Pending review' : 'Needs revision'}</span>{item.title && <p className="mt-2 font-semibold text-slate-700">{item.title}</p>}<p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{item.content}</p></div>)}</div></div>}</Card>}
      </div>
    </div>
  </>
}
