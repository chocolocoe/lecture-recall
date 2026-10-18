// Invite a student or teacher to a classroom. The service key is read only
// from Edge Function secrets and is never sent to the browser.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
)

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'A valid sign-in is required.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !publicKey || !serviceRoleKey) return json({ error: 'Invitation service is not fully configured.' }, 500)

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }
  if (!payload || typeof payload !== 'object') return json({ error: 'Invalid request body.' }, 400)
  const record = payload as Record<string, unknown>
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''
  const fullName = typeof record.fullName === 'string' ? record.fullName.trim() : ''
  const role = record.role
  const classroomId = record.classroomId
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400)
  if (!fullName || fullName.length > 120) return json({ error: 'Full name must contain 1 to 120 characters.' }, 400)
  if (role !== 'student' && role !== 'teacher') return json({ error: 'Only student and teacher invitations are allowed.' }, 400)
  if (typeof classroomId !== 'string' || !uuidPattern.test(classroomId)) return json({ error: 'A valid classroom is required.' }, 400)

  const callerClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data: authData, error: authError } = await callerClient.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Session is invalid or expired.' }, 401)

  const { data: membership, error: membershipError } = await callerClient
    .from('memberships')
    .select('role')
    .eq('classroom_id', classroomId)
    .eq('user_id', authData.user.id)
    .maybeSingle()
  if (membershipError || membership?.role !== 'admin') return json({ error: 'Only an administrator of this classroom can invite members.' }, 403)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const siteUrl = Deno.env.get('APP_SITE_URL')
  if (!siteUrl) return json({ error: 'Configure APP_SITE_URL in Edge Function secrets before sending invitations.' }, 500)
  let redirectTo: string
  try {
    const parsed = new URL(siteUrl)
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error('APP_SITE_URL must use HTTPS except on localhost.')
    redirectTo = new URL('/login?flow=invite', parsed).toString()
  } catch {
    return json({ error: 'Invitation redirect URL is invalid. Configure APP_SITE_URL in Edge Function secrets.' }, 500)
  }

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  })
  const invitedUser = inviteData.user
  if (inviteError || !invitedUser) return json({ error: inviteError?.message ?? 'Supabase Auth did not create the invitation.' }, 400)

  const { error: insertError } = await adminClient.from('memberships').insert({
    user_id: invitedUser.id,
    classroom_id: classroomId,
    role,
  })
  if (insertError) {
    // Do not leave an invited identity able to accept without its authorized
    // classroom assignment. Invalidate the just-created invitation on failure.
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(invitedUser.id)
    if (cleanupError) console.error('Failed to remove Auth user after membership creation failed', cleanupError.message)
    return json({ error: 'The invitation could not be assigned to this classroom. No usable invitation was kept.' }, 409)
  }

  return json({ message: `Invitation sent to ${email}.` }, 200)
})
