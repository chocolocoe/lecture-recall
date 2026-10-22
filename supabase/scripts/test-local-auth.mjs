import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function readLocalSupabaseEnv() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const output = execFileSync(process.platform === 'win32' ? 'cmd.exe' : command,
    process.platform === 'win32' ? ['/d', '/s', '/c', 'npx supabase status -o env'] : ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const values = Object.fromEntries([...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map((match) => [match[1], match[2]]))
  const url = values.API_URL
  const anonKey = values.ANON_KEY
  const serviceRoleKey = values.SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Could not read local Supabase connection settings.')
  const host = new URL(url).hostname
  if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('This test only runs against local Supabase.')
  return { url, anonKey, serviceRoleKey }
}

const { url, anonKey, serviceRoleKey } = readLocalSupabaseEnv()
const service = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const localTestIds = new Set()
const localTestClassrooms = new Set()
const localStoragePaths = new Set()
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
const password = `Test-${randomUUID()}-Safe`
const newPassword = `Reset-${randomUUID()}-Safe`
const accounts = {}
let classroomA
let classroomB
let createdThroughFunctionId

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`PASS: ${message}`)
}

async function createIdentity(label, role, classroomId) {
  const username = `qa-${label}-${suffix}`
  const email = `${randomUUID()}@accounts.lecture-recall.invalid`
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: `Temporary ${label}` },
  })
  if (error || !data.user) throw new Error(`Could not create temporary ${label} test account.`)
  localTestIds.add(data.user.id)
  const { error: membershipError } = await service.from('memberships').insert({ user_id: data.user.id, classroom_id: classroomId, role })
  if (membershipError) throw new Error(`Could not assign temporary ${label} test account.`)
  return { id: data.user.id, username }
}

async function createClassroom(ownerId, name) {
  const { data, error } = await service.from('classrooms').insert({ name, description: 'Temporary automated test data', owner_id: ownerId }).select('id').single()
  if (error || !data) throw new Error('Could not create a temporary test classroom.')
  localTestClassrooms.add(data.id)
  return data.id
}

async function apiRequest(functionName, body, accessToken) {
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken ?? anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  let payload = {}
  try { payload = await response.json() } catch { /* empty error response */ }
  return { status: response.status, payload }
}

async function login(username, loginPassword) {
  const result = await apiRequest('username-login', { username, password: loginPassword })
  if (result.status !== 200 || !result.payload.session) return result
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.setSession(result.payload.session)
  if (error) throw new Error('Could not establish a test session.')
  return { ...result, client, accessToken: result.payload.session.access_token }
}

async function loginLogoutLogin(account, expectedRole) {
  const first = await login(account.username, password)
  assert(first.status === 200 && first.client, `${expectedRole} username/password sign-in succeeds${first.payload?.error ? ` (${first.payload.error})` : ` (HTTP ${first.status})`}`)
  const { data, error } = await first.client.from('memberships').select('role').eq('user_id', account.id).maybeSingle()
  assert(!error && data?.role === expectedRole, `${expectedRole} session resolves the correct classroom role`)
  const { error: signOutError } = await first.client.auth.signOut()
  assert(!signOutError, `${expectedRole} can sign out cleanly`)
  const second = await login(account.username, password)
  assert(second.status === 200 && second.client, `${expectedRole} can sign in again after logout`)
  await second.client.auth.signOut()
}

try {
  // First local function check proves existing admins are left untouched.
  const bootstrap = await apiRequest('bootstrap-local-admin', {})
  assert(bootstrap.status === 200 && bootstrap.payload.alreadyExists === true, 'local bootstrap preserves the existing administrator')

  const { data: adminUser, error: adminCreateError } = await service.auth.admin.createUser({
    email: `${randomUUID()}@accounts.lecture-recall.invalid`, password, email_confirm: true,
    user_metadata: { username: `qa-admin-${suffix}`, full_name: 'Temporary Test Admin' },
  })
  if (adminCreateError || !adminUser.user) throw new Error('Could not create the temporary admin test identity.')
  localTestIds.add(adminUser.user.id)
  classroomA = await createClassroom(adminUser.user.id, `Temporary Test Room A ${suffix}`)
  const { error: adminMembershipError } = await service.from('memberships').insert({ user_id: adminUser.user.id, classroom_id: classroomA, role: 'admin' })
  if (adminMembershipError) throw new Error('Could not assign the temporary admin test identity.')
  accounts.admin = { id: adminUser.user.id, username: `qa-admin-${suffix}` }
  accounts.teacher = await createIdentity('teacher', 'teacher', classroomA)
  accounts.student = await createIdentity('student', 'student', classroomA)

  const { data: otherAdmin, error: otherAdminError } = await service.auth.admin.createUser({
    email: `${randomUUID()}@accounts.lecture-recall.invalid`, password, email_confirm: true,
    user_metadata: { username: `qa-outsider-${suffix}`, full_name: 'Temporary Outside Admin' },
  })
  if (otherAdminError || !otherAdmin.user) throw new Error('Could not create the temporary outside admin.')
  localTestIds.add(otherAdmin.user.id)
  classroomB = await createClassroom(otherAdmin.user.id, `Temporary Test Room B ${suffix}`)
  const { error: outsideMembershipError } = await service.from('memberships').insert({ user_id: otherAdmin.user.id, classroom_id: classroomB, role: 'admin' })
  if (outsideMembershipError) throw new Error('Could not assign the temporary outside admin.')
  accounts.outsider = await createIdentity('outside', 'student', classroomB)

  await loginLogoutLogin(accounts.admin, 'admin')
  await loginLogoutLogin(accounts.teacher, 'teacher')
  await loginLogoutLogin(accounts.student, 'student')
  const badCredentials = await apiRequest('username-login', { username: accounts.admin.username, password: `${password}-wrong` })
  assert(badCredentials.status === 401 && badCredentials.payload.error === 'Invalid username or password.', 'login failures return a sanitized credential error')
  const expiredSession = await apiRequest('review-contribution', { contributionId: randomUUID(), status: 'approved' }, 'expired.invalid.token')
  assert(expiredSession.status === 401, 'review Edge Function rejects an expired or malformed session token')

  const adminSession = await login(accounts.admin.username, password)
  assert(adminSession.status === 200 && adminSession.client, 'admin session is available for authorized Edge Function tests')
  const { error: emailColumnError } = await adminSession.client.from('profiles').select('email').eq('id', accounts.admin.id).maybeSingle()
  assert(Boolean(emailColumnError), 'browser sessions cannot read internal Auth identifiers')
  const { error: usernameMutationError } = await adminSession.client.from('profiles').update({ username: `changed-${suffix}` }).eq('id', accounts.admin.id)
  assert(Boolean(usernameMutationError), 'members cannot change usernames through the Data API')
  const { data: selfRoleMutation } = await adminSession.client.from('memberships').update({ role: 'student' }).eq('user_id', accounts.admin.id).select('role').maybeSingle()
  assert(!selfRoleMutation, 'admins cannot change their own role through the Data API')

  for (const roleName of ['teacher', 'student']) {
    const session = await login(accounts[roleName].username, password)
    const denied = await apiRequest('admin-create-member', {
      classroomId: classroomA, username: `blocked-${roleName}-${suffix}`, fullName: 'Should Not Exist', temporaryPassword: password, role: 'student',
    }, session.accessToken)
    assert(denied.status === 403, `${roleName} cannot create accounts through an authenticated admin function`)
    await session.client.auth.signOut()
  }
  const unauthenticated = await apiRequest('admin-create-member', {
    classroomId: classroomA, username: `blocked-anon-${suffix}`, fullName: 'Should Not Exist', temporaryPassword: password, role: 'student',
  })
  assert(unauthenticated.status === 401, `unauthenticated requests cannot call protected account operations (HTTP ${unauthenticated.status})`)

  const createdUsername = `qa-created-${suffix}`
  const created = await apiRequest('admin-create-member', {
    classroomId: classroomA, username: createdUsername, fullName: 'Temporary Created Student', temporaryPassword: password, role: 'student',
  }, adminSession.accessToken)
  assert(created.status === 200 && created.payload.userId, 'admin can create a classroom account through the Edge Function')
  createdThroughFunctionId = created.payload.userId
  localTestIds.add(createdThroughFunctionId)
  const duplicate = await apiRequest('admin-create-member', {
    classroomId: classroomA, username: createdUsername.toUpperCase(), fullName: 'Duplicate', temporaryPassword: password, role: 'student',
  }, adminSession.accessToken)
  assert(duplicate.status === 409, 'username uniqueness is case-insensitive during account creation')

  const outsiderChange = await apiRequest('admin-member-action', {
    classroomId: classroomA, userId: accounts.outsider.id, action: 'reset-password', temporaryPassword: newPassword,
  }, adminSession.accessToken)
  assert(outsiderChange.status === 404, 'admin cannot manage a member outside their classroom')
  const otherClass = await apiRequest('admin-member-action', {
    classroomId: classroomB, userId: accounts.outsider.id, action: 'reset-password', temporaryPassword: newPassword,
  }, adminSession.accessToken)
  assert(otherClass.status === 403, 'admin cannot operate in another classroom')

  const selfAdminOperation = await apiRequest('admin-member-action', {
    classroomId: classroomA, userId: accounts.admin.id, action: 'update-profile', username: `changed-${suffix}`, fullName: 'Temporary Test Admin', displayName: '',
  }, adminSession.accessToken)
  assert(selfAdminOperation.status === 403, 'admin member controls reject self-lockout actions')

  const memberRecord = { id: createdThroughFunctionId, username: createdUsername }
  const updated = await apiRequest('admin-member-action', {
    classroomId: classroomA, userId: memberRecord.id, action: 'update-profile', username: `qa-renamed-${suffix}`, fullName: 'Renamed Test Student', displayName: 'Test Student',
  }, adminSession.accessToken)
  assert(updated.status === 200 && updated.payload.profile?.username === `qa-renamed-${suffix}`, 'admin can update a member profile and username')
  const roleUpdate = await apiRequest('admin-member-action', {
    classroomId: classroomA, userId: memberRecord.id, action: 'set-role', role: 'teacher',
  }, adminSession.accessToken)
  assert(roleUpdate.status === 200 && roleUpdate.payload.membership?.role === 'teacher', 'admin can change a member role')

  const reset = await apiRequest('admin-member-action', {
    classroomId: classroomA, userId: memberRecord.id, action: 'reset-password', temporaryPassword: newPassword,
  }, adminSession.accessToken)
  assert(reset.status === 200, 'admin can set a member password directly without email delivery')
  const updatedLogin = await login(`qa-renamed-${suffix}`, newPassword)
  assert(updatedLogin.status === 200 && updatedLogin.client, 'renamed account can sign in with its reset password')
  const { error: displayNameError } = await updatedLogin.client.from('profiles').update({ display_name: 'Self Updated' }).eq('id', memberRecord.id)
  assert(!displayNameError, 'member can update their own display name')
  const { data: authUser } = await updatedLogin.client.auth.getUser()
  const { error: reauthError } = await updatedLogin.client.auth.signInWithPassword({ email: authUser.user.email, password: newPassword })
  assert(!reauthError, 'member can reauthenticate with the current password')
  const ownPassword = `Own-${randomUUID()}-Safe`
  const { error: ownPasswordError } = await updatedLogin.client.auth.updateUser({ password: ownPassword })
  assert(!ownPasswordError, 'member can change their own password through Supabase Auth')
  await updatedLogin.client.auth.signOut()
  const ownPasswordLogin = await login(`qa-renamed-${suffix}`, ownPassword)
  assert(ownPasswordLogin.status === 200 && ownPasswordLogin.client, 'member can sign in with their new password')
  await ownPasswordLogin.client.auth.signOut()

  const teacherSession = await login(accounts.teacher.username, password)
  const studentSession = await login(accounts.student.username, password)
  assert(teacherSession.status === 200 && teacherSession.client && studentSession.status === 200 && studentSession.client, 'teacher and student sessions are available for academic CRUD tests')
  const { data: subject, error: subjectInsertError } = await teacherSession.client.from('subjects').insert({ classroom_id: classroomA, name: `CRUD ${suffix}` }).select().single()
  assert(!subjectInsertError && subject, 'teacher creates a subject through authenticated RLS')
  const { error: subjectUpdateError } = await teacherSession.client.from('subjects').update({ name: `CRUD edited ${suffix}` }).eq('id', subject.id)
  assert(!subjectUpdateError, 'teacher edits a subject through authenticated RLS')
  const { data: lesson, error: lessonInsertError } = await teacherSession.client.from('lessons').insert({ classroom_id: classroomA, subject_id: subject.id, title: `CRUD lesson ${suffix}`, lesson_date: new Date().toISOString().slice(0, 10), created_by: accounts.teacher.id }).select().single()
  assert(!lessonInsertError && lesson, 'teacher creates a lesson through authenticated RLS')
  const { data: secondLesson, error: secondLessonError } = await teacherSession.client.from('lessons').insert({ classroom_id: classroomA, subject_id: subject.id, title: `Scoped lesson ${suffix}`, lesson_date: new Date().toISOString().slice(0, 10), created_by: accounts.teacher.id }).select().single()
  assert(!secondLessonError && secondLesson, 'teacher creates a second lesson for permission-scope isolation')
  const { error: unpublishError } = await teacherSession.client.from('lessons').update({ published: false }).eq('id', secondLesson.id)
  const { data: unpublishedForStudent } = await studentSession.client.from('lessons').select('id').eq('id', secondLesson.id)
  assert(!unpublishError && (unpublishedForStudent ?? []).length === 0, `teacher can unpublish a lesson and students immediately lose access${unpublishError ? ` (${unpublishError.message})` : ` (visible rows: ${(unpublishedForStudent ?? []).length})`}`)
  const { data: unauthorizedPublishRows } = await studentSession.client.from('lessons').update({ published: true }).eq('id', secondLesson.id).select('id')
  assert((unauthorizedPublishRows ?? []).length === 0, 'student cannot publish a draft lesson')
  const { error: republishError } = await teacherSession.client.from('lessons').update({ published: true }).eq('id', secondLesson.id)
  assert(!republishError, 'teacher can republish the lesson for students')

  const { data: studentDefaults } = await adminSession.client.from('classroom_role_permissions').select('permission_key, allowed').eq('classroom_id', classroomA).eq('role', 'student')
  const defaultsByKey = new Map((studentDefaults ?? []).map((row) => [row.permission_key, row.allowed]))
  assert(defaultsByKey.get('lessons.view') === true && defaultsByKey.get('lessons.create') === false, 'student role defaults are explicitly seeded and preserve read-only academic access')
  assert(defaultsByKey.get('lessons.publish') === false, 'student role defaults do not include lesson publishing')
  assert(defaultsByKey.get('attachments.upload') === false, 'student role defaults limit uploads to their own note workflow')
  const { data: adminPermission } = await adminSession.client.rpc('has_effective_permission', { p_classroom_id: classroomA, p_permission_key: 'permissions.grant', p_resource_id: null })
  assert(adminPermission === true, 'administrator retains permission management capability')
  const { data: studentPermissionRows } = await studentSession.client.from('member_permission_overrides').select('permission_key').eq('classroom_id', classroomA)
  assert((studentPermissionRows ?? []).length === 0, 'students cannot read other members’ permission assignments')
  const { error: studentSelfGrantError } = await studentSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.student.id, p_overrides: [{ permission: 'lessons.create', effect: 'allow', resourceId: null }] })
  assert(Boolean(studentSelfGrantError), 'students cannot grant themselves permissions')
  const { error: teacherGrantError } = await teacherSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.student.id, p_overrides: [{ permission: 'lessons.create', effect: 'allow', resourceId: null }] })
  assert(Boolean(teacherGrantError), 'teachers cannot grant permissions to members')
  const { error: crossClassGrantError } = await adminSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.outsider.id, p_overrides: [{ permission: 'attachments.upload', effect: 'allow', resourceId: lesson.id }] })
  assert(Boolean(crossClassGrantError), 'administrator cannot assign permissions to a member from another classroom')
  const { error: selfPermissionEditError } = await adminSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.admin.id, p_overrides: [] })
  assert(Boolean(selfPermissionEditError), 'administrator permission edits cannot lock out the acting admin')
  const { error: delegateManagerError } = await adminSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.student.id, p_overrides: [{ permission: 'permissions.grant', effect: 'allow', resourceId: null }] })
  assert(Boolean(delegateManagerError), 'administrator cannot delegate permission-management privileges')

  const { error: noSubjectGrant } = await studentSession.client.from('subjects').insert({ classroom_id: classroomA, name: `Student blocked ${suffix}` })
  assert(Boolean(noSubjectGrant), 'student cannot create subjects before an explicit permission grant')
  const { error: unauthorizedTemplateError } = await teacherSession.client.rpc('save_role_permission_template', { p_classroom_id: classroomA, p_role: 'student', p_permissions: [{ permission: 'subjects.create', allowed: true }] })
  assert(Boolean(unauthorizedTemplateError), 'teacher cannot change role permission templates')
  const { error: templateGrantError } = await adminSession.client.rpc('save_role_permission_template', { p_classroom_id: classroomA, p_role: 'student', p_permissions: [{ permission: 'subjects.create', allowed: true }] })
  assert(!templateGrantError, 'admin can update a non-admin role template')
  const { data: templatePermission } = await studentSession.client.rpc('has_effective_permission', { p_classroom_id: classroomA, p_permission_key: 'subjects.create', p_resource_id: null })
  assert(templatePermission === true, 'role template changes take effect without session refresh')
  const { data: templateSubject, error: templateSubjectError } = await studentSession.client.from('subjects').insert({ classroom_id: classroomA, name: `Template granted ${suffix}` }).select().single()
  assert(!templateSubjectError && templateSubject, 'student can use an administrator-approved role template permission through RLS')
  if (templateSubject) await teacherSession.client.rpc('delete_academic_item', { p_kind: 'subject', p_id: templateSubject.id })
  const { error: templateResetError } = await adminSession.client.rpc('save_role_permission_template', { p_classroom_id: classroomA, p_role: 'student', p_permissions: [{ permission: 'subjects.create', allowed: false }] })
  assert(!templateResetError, 'admin can restore the role template default')
  const { error: grantSubjectCreateError } = await adminSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.student.id, p_overrides: [{ permission: 'subjects.create', effect: 'allow', resourceId: null }] })
  assert(!grantSubjectCreateError, 'admin can grant a specific academic capability without changing the member role')
  const { data: studentSubject, error: studentSubjectError } = await studentSession.client.from('subjects').insert({ classroom_id: classroomA, name: `Student granted ${suffix}` }).select().single()
  assert(!studentSubjectError && studentSubject, 'student can use an explicitly granted classroom capability through RLS')
  if (studentSubject) await teacherSession.client.rpc('delete_academic_item', { p_kind: 'subject', p_id: studentSubject.id })

  const { error: scopedUploadGrantError } = await adminSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.student.id, p_overrides: [{ permission: 'attachments.upload', effect: 'allow', resourceId: lesson.id }] })
  assert(!scopedUploadGrantError, 'admin can grant a student upload permission for one lesson')
  const { data: uploadPermission } = await studentSession.client.rpc('has_effective_permission', { p_classroom_id: classroomA, p_permission_key: 'attachments.upload', p_resource_id: lesson.id })
  const { data: otherUploadPermission } = await studentSession.client.rpc('has_effective_permission', { p_classroom_id: classroomA, p_permission_key: 'attachments.upload', p_resource_id: secondLesson.id })
  assert(uploadPermission === true && otherUploadPermission === false, 'student upload grant is scoped to the selected lesson without changing their role')
  const privilegedAttachmentId = randomUUID()
  const privilegedAttachmentPath = `${classroomA}/${lesson.id}/${privilegedAttachmentId}`
  localStoragePaths.add(privilegedAttachmentPath)
  const privilegedBytes = new Blob(['student authorized upload'], { type: 'text/plain' })
  const { error: privilegedMetadataError } = await studentSession.client.from('lesson_attachments').insert({ id: privilegedAttachmentId, classroom_id: classroomA, lesson_id: lesson.id, contribution_id: null, file_name: 'student-resource.txt', file_path: privilegedAttachmentPath, file_size: privilegedBytes.size, mime_type: 'text/plain', uploaded_by: accounts.student.id })
  assert(!privilegedMetadataError, 'student can create official attachment metadata within the granted lesson')
  const { error: scopedDeleteGrantError } = await adminSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.student.id, p_overrides: [{ permission: 'attachments.upload', effect: 'allow', resourceId: lesson.id }, { permission: 'attachments.delete', effect: 'allow', resourceId: privilegedAttachmentId }] })
  assert(!scopedDeleteGrantError, 'admin can scope attachment deletion to that exact attachment')
  const { error: privilegedUploadError } = await studentSession.client.storage.from('lesson-attachments').upload(privilegedAttachmentPath, privilegedBytes, { contentType: 'text/plain' })
  assert(!privilegedUploadError, 'Storage RLS permits the granted lesson upload')
  const deniedAttachmentId = randomUUID()
  const deniedAttachmentPath = `${classroomA}/${secondLesson.id}/${deniedAttachmentId}`
  const { error: deniedMetadataError } = await studentSession.client.from('lesson_attachments').insert({ id: deniedAttachmentId, classroom_id: classroomA, lesson_id: secondLesson.id, contribution_id: null, file_name: 'blocked-resource.txt', file_path: deniedAttachmentPath, file_size: 8, mime_type: 'text/plain', uploaded_by: accounts.student.id })
  assert(Boolean(deniedMetadataError), 'student cannot upload the same resource type to another lesson')
  const { error: privilegedFileCleanupError } = await studentSession.client.storage.from('lesson-attachments').remove([privilegedAttachmentPath])
  assert(!privilegedFileCleanupError, 'student can remove a specifically granted attachment from Storage')
  localStoragePaths.delete(privilegedAttachmentPath)
  const { error: privilegedMetadataCleanupError } = await studentSession.client.from('lesson_attachments').delete().eq('id', privilegedAttachmentId)
  assert(!privilegedMetadataCleanupError, 'student can clean the metadata for their specifically granted attachment')
  const { error: grantCleanupError } = await adminSession.client.rpc('save_member_permissions', { p_classroom_id: classroomA, p_user_id: accounts.student.id, p_overrides: [] })
  assert(!grantCleanupError, 'administrator can revoke all custom overrides and restore role defaults')
  const { data: revokedUploadPermission } = await studentSession.client.rpc('has_effective_permission', { p_classroom_id: classroomA, p_permission_key: 'attachments.upload', p_resource_id: lesson.id })
  assert(revokedUploadPermission === false, 'revoked permission takes effect on the next database request')
  const { data: auditEntries } = await adminSession.client.from('permission_audit_log').select('permission_key').eq('classroom_id', classroomA).eq('target_user_id', accounts.student.id)
  assert((auditEntries ?? []).length >= 4, 'permission changes and revocations are recorded in the immutable audit log')
  const { data: roleAfterGrant } = await studentSession.client.from('memberships').select('role').eq('classroom_id', classroomA).eq('user_id', accounts.student.id).single()
  assert(roleAfterGrant?.role === 'student', 'custom grants never promote the student account')

  const { data: assignment, error: assignmentInsertError } = await teacherSession.client.from('assignments').insert({ classroom_id: classroomA, subject_id: subject.id, lesson_id: lesson.id, title: `CRUD assignment ${suffix}`, due_date: new Date(Date.now() + 86400000).toISOString(), created_by: accounts.teacher.id }).select().single()
  assert(!assignmentInsertError && assignment, 'teacher creates an assignment with a deadline through authenticated RLS')
  const { error: responseInsertError } = await studentSession.client.from('assignment_progress').insert({ assignment_id: assignment.id, user_id: accounts.student.id, notes: `Response ${suffix}` })
  assert(!responseInsertError, 'student submits an assignment response through authenticated RLS')
  const { error: assignmentUpdateError } = await teacherSession.client.from('assignments').update({ due_date: new Date(Date.now() + 172800000).toISOString() }).eq('id', assignment.id)
  assert(!assignmentUpdateError, 'teacher changes an assignment deadline through authenticated RLS')
  const { data: preservedResponse } = await studentSession.client.from('assignment_progress').select('notes').eq('assignment_id', assignment.id).single()
  assert(preservedResponse?.notes === `Response ${suffix}`, 'deadline edits preserve the student assignment response')
  const { data: staffResponse } = await teacherSession.client.from('assignment_progress').select('notes').eq('assignment_id', assignment.id).eq('user_id', accounts.student.id).single()
  assert(staffResponse?.notes === `Response ${suffix}`, 'teacher can view a submitted student assignment response')
  const { error: adminAcademicUpdateError } = await adminSession.client.from('assignments').update({ title: `Admin edited ${suffix}` }).eq('id', assignment.id)
  assert(!adminAcademicUpdateError, 'admin edits an assignment created by a teacher through authenticated RLS')
  const { data: note, error: noteInsertError } = await studentSession.client.from('lesson_contributions').insert({ lesson_id: lesson.id, submitted_by: accounts.student.id, title: `Note title ${suffix}`, content: `Pending note ${suffix}` }).select().single()
  assert(!noteInsertError && note, 'student submits a note through authenticated RLS')
  const { error: noteEditError } = await studentSession.client.from('lesson_contributions').update({ title: `Edited title ${suffix}`, content: `Edited pending note ${suffix}` }).eq('id', note.id).eq('status', 'pending')
  assert(!noteEditError, 'student edits their own pending note title and content through authenticated RLS')
  const noteFiles = []
  for (const [fileName, fileText] of [['first.txt', 'attachment'], ['second.txt', 'second attachment']]) {
    const attachmentId = randomUUID()
    const path = `${classroomA}/${lesson.id}/${attachmentId}`
    localStoragePaths.add(path)
    const bytes = new Blob([fileText], { type: 'text/plain' })
    const { error: metadataError } = await studentSession.client.from('lesson_attachments').insert({
      id: attachmentId, classroom_id: classroomA, lesson_id: lesson.id, contribution_id: note.id,
      file_name: fileName, file_path: path, file_size: bytes.size, mime_type: 'text/plain', uploaded_by: accounts.student.id,
    })
    assert(!metadataError, `student creates pending note attachment metadata for ${fileName}`)
    const { error: uploadError } = await studentSession.client.storage.from('lesson-attachments').upload(path, bytes, { contentType: 'text/plain' })
    assert(!uploadError, `student uploads private note attachment ${fileName}`)
    noteFiles.push({ id: attachmentId, path, fileName })
  }
  const { data: ownDownload, error: ownDownloadError } = await studentSession.client.storage.from('lesson-attachments').download(noteFiles[0].path)
  assert(!ownDownloadError && Boolean(ownDownload), 'student can open their own pending attachment')
  const { data: staffDownload, error: staffDownloadError } = await teacherSession.client.storage.from('lesson-attachments').download(noteFiles[0].path)
  assert(!staffDownloadError && Boolean(staffDownload), 'teacher can open an authorized pending note attachment')
  const outsideSession = await login(accounts.outsider.username, password)
  const { error: outsideFileError } = await outsideSession.client.storage.from('lesson-attachments').download(noteFiles[0].path)
  assert(Boolean(outsideFileError), 'a student in another classroom cannot open the private attachment')
  await outsideSession.client.auth.signOut()
  const { error: unsupportedMetadataError } = await studentSession.client.from('lesson_attachments').insert({
    classroom_id: classroomA, lesson_id: lesson.id, contribution_id: note.id,
    file_name: 'unsupported.zip', file_path: `${classroomA}/${lesson.id}/${randomUUID()}`,
    file_size: 10, mime_type: 'application/zip', uploaded_by: accounts.student.id,
  })
  assert(Boolean(unsupportedMetadataError), 'database rejects unsupported attachment MIME types')
  const { error: oversizedMetadataError } = await studentSession.client.from('lesson_attachments').insert({
    classroom_id: classroomA, lesson_id: lesson.id, contribution_id: note.id,
    file_name: 'oversized.txt', file_path: `${classroomA}/${lesson.id}/${randomUUID()}`,
    file_size: 10 * 1024 * 1024 + 1, mime_type: 'text/plain', uploaded_by: accounts.student.id,
  })
  assert(Boolean(oversizedMetadataError), 'database rejects attachments above the configured 10 MiB limit')
  const { data: partialNote, error: partialNoteError } = await studentSession.client.from('lesson_contributions').insert({
    lesson_id: lesson.id, submitted_by: accounts.student.id, title: `Partial upload ${suffix}`, content: 'Rollback test note',
  }).select().single()
  assert(!partialNoteError && partialNote, 'student creates a temporary note for partial upload cleanup coverage')
  const partialFile = { id: randomUUID(), fileName: 'partial.txt' }
  partialFile.path = `${classroomA}/${lesson.id}/${partialFile.id}`
  localStoragePaths.add(partialFile.path)
  const partialBlob = new Blob(['partial'], { type: 'text/plain' })
  const { error: partialMetadataError } = await studentSession.client.from('lesson_attachments').insert({
    id: partialFile.id, classroom_id: classroomA, lesson_id: lesson.id, contribution_id: partialNote.id,
    file_name: partialFile.fileName, file_path: partialFile.path, file_size: partialBlob.size,
    mime_type: 'text/plain', uploaded_by: accounts.student.id,
  })
  assert(!partialMetadataError, 'partial upload test creates its first attachment record')
  const { error: partialUploadError } = await studentSession.client.storage.from('lesson-attachments').upload(partialFile.path, partialBlob, { contentType: 'text/plain' })
  assert(!partialUploadError, 'partial upload test stores its first private file')
  const rejectedStorageFile = { id: randomUUID(), fileName: 'blocked-type.txt' }
  rejectedStorageFile.path = `${classroomA}/${lesson.id}/${rejectedStorageFile.id}`
  const { error: rejectedStorageMetadataError } = await studentSession.client.from('lesson_attachments').insert({
    id: rejectedStorageFile.id, classroom_id: classroomA, lesson_id: lesson.id, contribution_id: partialNote.id,
    file_name: rejectedStorageFile.fileName, file_path: rejectedStorageFile.path, file_size: 4,
    mime_type: 'text/plain', uploaded_by: accounts.student.id,
  })
  assert(!rejectedStorageMetadataError, 'storage rejection test creates allowed metadata')
  const { error: rejectedStorageUploadError } = await studentSession.client.storage.from('lesson-attachments').upload(rejectedStorageFile.path, new Blob(['nope'], { type: 'application/zip' }), { contentType: 'application/zip' })
  assert(Boolean(rejectedStorageUploadError), 'private Storage rejects an unsupported uploaded MIME type')
  const { error: rejectedStorageCleanupError } = await studentSession.client.storage.from('lesson-attachments').remove([rejectedStorageFile.path])
  const { error: rejectedMetadataCleanupError } = await studentSession.client.from('lesson_attachments').delete().eq('id', rejectedStorageFile.id)
  assert(!rejectedStorageCleanupError && !rejectedMetadataCleanupError, 'failed Storage upload metadata can be safely cleaned up')
  const failedFile = { id: randomUUID(), fileName: 'blocked.txt' }
  failedFile.path = `${classroomA}/${lesson.id}/${failedFile.id}`
  const { error: failedMetadataError } = await studentSession.client.from('lesson_attachments').insert({
    id: failedFile.id, classroom_id: classroomA, lesson_id: lesson.id, contribution_id: partialNote.id,
    file_name: failedFile.fileName, file_path: failedFile.path, file_size: 10,
    mime_type: 'application/zip', uploaded_by: accounts.student.id,
  })
  assert(Boolean(failedMetadataError), 'invalid attachment record fails after an earlier file upload')
  const { error: partialCleanupError } = await studentSession.client.storage.from('lesson-attachments').remove([partialFile.path])
  const { error: partialRowCleanupError } = await studentSession.client.from('lesson_attachments').delete().eq('id', partialFile.id)
  const { error: partialNoteCleanupError } = await studentSession.client.from('lesson_contributions').delete().eq('id', partialNote.id).eq('status', 'pending')
  assert(!partialCleanupError && !partialRowCleanupError && !partialNoteCleanupError, 'partial upload failure safely removes its file, metadata, and temporary note')
  const { data: orphanRows } = await adminSession.client.from('lesson_attachments').select('id').eq('id', partialFile.id)
  assert(!orphanRows?.length, 'partial upload rollback leaves no orphan attachment metadata')
  const { error: studentFileDeleteError } = await studentSession.client.storage.from('lesson-attachments').remove([noteFiles[0].path])
  assert(!studentFileDeleteError, 'student can remove only their own pending note attachment through Storage RLS')
  const { error: studentMetadataDeleteError } = await studentSession.client.from('lesson_attachments').delete().eq('id', noteFiles[0].id)
  assert(!studentMetadataDeleteError, 'student can remove their own pending attachment metadata after its bytes')
  const { error: remainingStudentFileDeleteError } = await teacherSession.client.storage.from('lesson-attachments').remove([noteFiles[1].path])
  assert(!remainingStudentFileDeleteError, 'teacher can remove an authorized student attachment before lesson deletion')
  const { error: remainingStudentMetadataError } = await teacherSession.client.from('lesson_attachments').delete().eq('id', noteFiles[1].id)
  assert(!remainingStudentMetadataError, 'teacher can remove student attachment metadata after storage cleanup')
  const rejectNote = await apiRequest('review-contribution', { contributionId: note.id, status: 'rejected' }, teacherSession.accessToken)
  assert(rejectNote.status === 200, 'teacher can reject a pending note through the authenticated review function')
  const { error: correctionError } = await studentSession.client.from('lesson_contributions').update({
    title: `Corrected title ${suffix}`, content: `Corrected note ${suffix}`, status: 'pending', reviewed_by: null, reviewed_at: null,
  }).eq('id', note.id).eq('status', 'rejected')
  assert(!correctionError, 'student can correct a rejected note and return it to pending review')
  const selfApproval = await apiRequest('review-contribution', { contributionId: note.id, status: 'approved' }, studentSession.accessToken)
  assert(selfApproval.status === 403, 'student cannot approve their corrected note')
  const approveNote = await apiRequest('review-contribution', { contributionId: note.id, status: 'approved' }, teacherSession.accessToken)
  assert(approveNote.status === 200, 'teacher can approve the corrected pending note')
  const { data: approvedEdit } = await studentSession.client.from('lesson_contributions').update({ content: 'Late edit' }).eq('id', note.id).eq('status', 'approved').select('id')
  assert(!approvedEdit?.length, 'student cannot edit a note after it is approved')
  const studentDelete = await studentSession.client.rpc('delete_academic_item', { p_kind: 'lesson', p_id: lesson.id })
  assert(Boolean(studentDelete.error), 'student cannot delete a lesson through the scoped server-side operation')
  const { data: unauthorizedEdit } = await studentSession.client.from('lessons').update({ title: 'Unauthorized edit' }).eq('id', lesson.id).select('id')
  assert(!unauthorizedEdit?.length, 'student cannot modify a teacher-owned lesson through authenticated RLS')

  const attachmentId = randomUUID()
  const attachmentPath = `${classroomA}/${lesson.id}/${attachmentId}`
  localStoragePaths.add(attachmentPath)
  const { error: attachmentMetadataError } = await teacherSession.client.from('lesson_attachments').insert({
    id: attachmentId, classroom_id: classroomA, lesson_id: lesson.id, contribution_id: null,
    file_name: 'crud-check.txt', file_path: attachmentPath, file_size: 10,
    mime_type: 'text/plain', uploaded_by: accounts.teacher.id,
  })
  assert(!attachmentMetadataError, 'teacher creates attachment metadata before upload')
  const { error: storageUploadError } = await teacherSession.client.storage.from('lesson-attachments').upload(attachmentPath, new Blob(['crud-check'], { type: 'text/plain' }), { contentType: 'text/plain' })
  assert(!storageUploadError, 'teacher uploads a private lesson attachment')
  const { error: storageDeleteError } = await teacherSession.client.storage.from('lesson-attachments').remove([attachmentPath])
  assert(!storageDeleteError, 'teacher removes the private attachment through Storage RLS')
  const { error: lessonDeleteError } = await teacherSession.client.rpc('delete_academic_item', { p_kind: 'lesson', p_id: lesson.id })
  assert(!lessonDeleteError, 'teacher deletes a lesson atomically after authorized storage cleanup')
  const { data: deletedLesson } = await adminSession.client.from('lessons').select('id').eq('id', lesson.id)
  const { data: preservedAssignment } = await adminSession.client.from('assignments').select('id,subject_id,lesson_id').eq('id', assignment.id).single()
  assert(!deletedLesson?.length && preservedAssignment?.lesson_id === null, 'lesson deletion removes the lesson while preserving its assignment record')
  const { error: subjectDeleteError } = await teacherSession.client.rpc('delete_academic_item', { p_kind: 'subject', p_id: subject.id })
  assert(!subjectDeleteError, 'teacher deletes a subject after lesson cleanup')
  const { data: survivingNote } = await adminSession.client.from('lesson_contributions').select('id').eq('id', note.id)
  assert(!survivingNote?.length, 'lesson deletion also removes the associated student note')
  const { error: assignmentDeleteError } = await adminSession.client.rpc('delete_academic_item', { p_kind: 'assignment', p_id: assignment.id })
  assert(!assignmentDeleteError, 'admin deletes an assignment created by a teacher through the scoped database operation')
  const { data: survivingAssignment } = await adminSession.client.from('assignments').select('id').eq('id', assignment.id)
  assert(!survivingAssignment?.length, 'assignment deletion removes its record and related progress')
  await teacherSession.client.auth.signOut()
  await studentSession.client.auth.signOut()

  const deletion = await apiRequest('admin-member-action', {
    classroomId: classroomA, userId: memberRecord.id, action: 'delete-account',
  }, adminSession.accessToken)
  assert(deletion.status === 200, 'admin can delete a member account')
  localTestIds.delete(memberRecord.id)
  const gone = await service.auth.admin.getUserById(memberRecord.id)
  assert(Boolean(gone.error), 'deleted test member no longer has an Auth identity')
  await adminSession.client.auth.signOut()
  console.log('Authenticated local account and Edge Function checks passed.')
} finally {
  let cleanupFailed = false
  if (localStoragePaths.size) {
    const { error } = await service.storage.from('lesson-attachments').remove([...localStoragePaths])
    if (error) cleanupFailed = true
  }
  const classroomIds = [...localTestClassrooms]
  const userIds = [...localTestIds]
  if (classroomIds.length || userIds.length) {
    try {
      for (const id of [...classroomIds, ...userIds]) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid temporary test identifier.')
      }
      const command = process.platform === 'win32' ? 'docker.exe' : 'docker'
      const candidates = execFileSync(command, ['ps', '--filter', 'publish=54322', '--format', '{{.Names}}'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)
      if (candidates.length !== 1) throw new Error('Could not uniquely identify the local Supabase database container.')
      const classroomsSql = classroomIds.length ? `ARRAY[${classroomIds.map((id) => `'${id}'`).join(',')}]::uuid[]` : 'ARRAY[]::uuid[]'
      const usersSql = userIds.length ? `ARRAY[${userIds.map((id) => `'${id}'`).join(',')}]::uuid[]` : 'ARRAY[]::uuid[]'
      const cleanupSql = `BEGIN; ALTER TABLE public.memberships DISABLE TRIGGER memberships_protect_last_admin; DELETE FROM public.classrooms WHERE id = ANY(${classroomsSql}); DELETE FROM auth.users WHERE id = ANY(${usersSql}); ALTER TABLE public.memberships ENABLE TRIGGER memberships_protect_last_admin; COMMIT;`
      execFileSync(command, ['exec', candidates[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', cleanupSql], { stdio: 'ignore' })
    } catch {
      cleanupFailed = true
    }
  }
  if (cleanupFailed) {
    console.error('Temporary test cleanup was incomplete; remove only the test accounts/classrooms created by this run.')
    process.exitCode = 1
  } else {
    console.log('Temporary test accounts and classrooms were cleaned up.')
  }
}
