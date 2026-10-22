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
  const username = typeof record.username === 'string' ? record.username.trim().toLowerCase() : ''
  const fullName = typeof record.fullName === 'string' ? record.fullName.trim() : ''
  const password = typeof record.temporaryPassword === 'string' ? record.temporaryPassword : ''
  const role = record.role
  if (!isUuid(classroomId)) return respond({ error: 'A valid classroom is required.' }, 400)
  if (!usernamePattern.test(username)) return respond({ error: 'Username must be 3 to 32 letters, numbers, dots, underscores, or hyphens.' }, 400)
  if (!fullName || fullName.length > 120) return respond({ error: 'Full name must contain 1 to 120 characters.' }, 400)
  if (password.length < 12 || password.length > 128) return respond({ error: 'Temporary password must contain 12 to 128 characters.' }, 400)
  if (role !== 'student' && role !== 'teacher' && role !== 'admin') return respond({ error: 'Choose a valid classroom role.' }, 400)

  const context = await requireClassroomAdmin(req, classroomId)
  if (!context.ok) return respond({ error: context.error }, context.status)

  const internalEmail = `${crypto.randomUUID()}@accounts.lecture-recall.invalid`
  const { data: created, error: createError } = await context.admin.auth.admin.createUser({
    email: internalEmail,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  })
  if (createError || !created.user) {
    console.error('Account creation failed', createError?.code ?? 'unknown_error')
    return respond({ error: createError?.code === '23505' ? 'That username is already in use.' : 'The account could not be created. Check the inputs and try again.' }, 400)
  }

  const { data: profile, error: profileError } = await context.admin.from('profiles')
    .select('username').eq('id', created.user.id).single()
  if (profileError || profile?.username !== username) {
    await context.admin.auth.admin.deleteUser(created.user.id)
    return respond({ error: 'That username is already in use.' }, 409)
  }

  const { error: membershipError } = await context.caller.from('memberships').insert({
    user_id: created.user.id,
    classroom_id: classroomId,
    role,
  })
  if (membershipError) {
    const { error: cleanupError } = await context.admin.auth.admin.deleteUser(created.user.id)
    if (cleanupError) console.error('Failed to remove unassigned Auth user', cleanupError.message)
    return respond({ error: 'The account could not be assigned to this classroom.' }, 409)
  }

  return respond({ message: `Created ${role} account @${username}.`, userId: created.user.id })
})
