import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { isUuid, requireClassroomAdmin, usernamePattern } from '../_shared/admin.ts'

const respond = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  let payload: unknown
  try { payload = await req.json() } catch { return respond({ error: 'Request body must be valid JSON.' }, 400) }
  if (!payload || typeof payload !== 'object') return respond({ error: 'Invalid request body.' }, 400)
  const record = payload as Record<string, unknown>
  const classroomId = record.classroomId
  const targetUserId = record.userId
  const action = record.action
  if (!isUuid(classroomId) || !isUuid(targetUserId)) return respond({ error: 'A valid classroom and account are required.' }, 400)

  const context = await requireClassroomAdmin(req, classroomId)
  if (!context.ok) return respond({ error: context.error }, context.status)
  if (context.userId === targetUserId) return respond({ error: 'For account safety, use Profile settings for your own account.' }, 403)

  const { data: targetMembership, error: targetMembershipError } = await context.admin
    .from('memberships')
    .select('role')
    .eq('classroom_id', classroomId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (targetMembershipError) return respond({ error: 'Unable to verify the target account.' }, 403)
  if (!targetMembership) return respond({ error: 'Account is not a member of this classroom.' }, 404)

  if (action === 'update-profile') {
    const username = typeof record.username === 'string' ? record.username.trim().toLowerCase() : ''
    const fullName = typeof record.fullName === 'string' ? record.fullName.trim() : ''
    const displayName = typeof record.displayName === 'string' ? record.displayName.trim() : ''
    if (!usernamePattern.test(username)) return respond({ error: 'Username must be 3 to 32 letters, numbers, dots, underscores, or hyphens.' }, 400)
    if (!fullName || fullName.length > 120) return respond({ error: 'Full name must contain 1 to 120 characters.' }, 400)
    if (displayName.length > 80) return respond({ error: 'Display name must be 80 characters or fewer.' }, 400)

    const { data, error } = await context.admin.from('profiles')
      .update({ username, full_name: fullName, display_name: displayName || null })
      .eq('id', targetUserId)
      .select('id, username, full_name, display_name')
      .single()
    if (error) return respond({ error: error.code === '23505' ? 'That username is already in use.' : 'Profile could not be updated.' }, 409)
    return respond({ profile: data })
  }

  if (action === 'set-role') {
    const role = record.role
    if (role !== 'student' && role !== 'teacher' && role !== 'admin') return respond({ error: 'Choose a valid classroom role.' }, 400)
    const { data, error } = await context.caller.from('memberships')
      .update({ role })
      .eq('classroom_id', classroomId)
      .eq('user_id', targetUserId)
      .select('role')
      .maybeSingle()
    if (error) return respond({ error: error.message.includes('at least one administrator') ? error.message : 'Role could not be changed.' }, 409)
    if (!data) return respond({ error: 'Role could not be changed by this account.' }, 409)
    return respond({ membership: data })
  }

  if (action === 'reset-password') {
    const password = typeof record.temporaryPassword === 'string' ? record.temporaryPassword : ''
    if (password.length < 12 || password.length > 128) return respond({ error: 'Temporary password must contain 12 to 128 characters.' }, 400)
    const { error } = await context.admin.auth.admin.updateUserById(targetUserId, { password })
    if (error) return respond({ error: 'The password could not be reset.' }, 409)
    return respond({ message: 'Password reset. Give the temporary password to the member privately.' })
  }

  if (action === 'delete-account') {
    const { data: classroom, error: classroomError } = await context.admin.from('classrooms')
      .select('owner_id').eq('id', classroomId).single()
    if (classroomError) return respond({ error: 'Unable to verify classroom ownership.' }, 500)
    if (classroom.owner_id === targetUserId) return respond({ error: 'Transfer classroom ownership before deleting its owner account.' }, 409)

    if (targetMembership.role === 'admin') {
      const { data: otherAdmins, error: adminsError } = await context.admin.from('memberships')
        .select('user_id').eq('classroom_id', classroomId).eq('role', 'admin').neq('user_id', targetUserId).limit(1)
      if (adminsError) return respond({ error: 'Unable to verify remaining administrators.' }, 500)
      if (!otherAdmins?.length) return respond({ error: 'Promote another classroom administrator before deleting the last administrator.' }, 409)
    }

    const { data: authoredLessons, error: lessonsError } = await context.admin.from('lessons')
      .select('id').eq('classroom_id', classroomId).eq('created_by', targetUserId)
    if (lessonsError) return respond({ error: 'Unable to prepare account data cleanup.' }, 500)
    const lessonIds = (authoredLessons ?? []).map((lesson) => lesson.id as string)
    const { data: submittedContributions, error: contributionsError } = await context.admin.from('lesson_contributions')
      .select('id').eq('submitted_by', targetUserId)
    if (contributionsError) return respond({ error: 'Unable to prepare account data cleanup.' }, 500)
    const contributionIds = new Set((submittedContributions ?? []).map((contribution) => contribution.id as string))
    if (lessonIds.length) {
      const { data: lessonContributions, error } = await context.admin.from('lesson_contributions')
        .select('id').in('lesson_id', lessonIds)
      if (error) return respond({ error: 'Unable to prepare account data cleanup.' }, 500)
      for (const contribution of lessonContributions ?? []) contributionIds.add(contribution.id as string)
    }

    const { data: attachments, error: attachmentsError } = await context.admin.from('lesson_attachments')
      .select('id, lesson_id, contribution_id, uploaded_by, file_path')
      .eq('classroom_id', classroomId)
    if (attachmentsError) return respond({ error: 'Unable to prepare account data cleanup.' }, 500)
    const affected = (attachments ?? []).filter((attachment) =>
      attachment.uploaded_by === targetUserId
      || lessonIds.includes(attachment.lesson_id as string)
      || (attachment.contribution_id && contributionIds.has(attachment.contribution_id as string)),
    )

    for (let offset = 0; offset < affected.length; offset += 100) {
      const batch = affected.slice(offset, offset + 100)
      const { error } = await context.admin.storage.from('lesson-attachments')
        .remove(batch.map((attachment) => attachment.file_path as string))
      if (error) return respond({ error: 'Account was not deleted because its private attachments could not be removed.' }, 409)
      const { error: metadataError } = await context.admin.from('lesson_attachments')
        .delete().in('id', batch.map((attachment) => attachment.id as string))
      if (metadataError) return respond({ error: 'Account was not deleted because its attachment metadata could not be removed.' }, 409)
    }

    const { error: deleteError } = await context.admin.auth.admin.deleteUser(targetUserId)
    if (deleteError) return respond({ error: 'Account could not be deleted. Classroom data is still present.' }, 409)
    return respond({ message: 'Account and its owned classroom data were deleted.' })
  }

  return respond({ error: 'Unsupported account action.' }, 400)
})
