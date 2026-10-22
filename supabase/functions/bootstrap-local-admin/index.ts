import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const respond = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
)

function isLocalSupabase(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1', 'kong'].includes(parsed.hostname)
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return respond({ error: 'Local setup is not fully configured.' }, 500)
  if (!isLocalSupabase(url)) return respond({ error: 'The development account is available only on a local Supabase installation.' }, 403)

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data: existingAdmin, error: lookupError } = await admin.from('memberships')
    .select('user_id').eq('role', 'admin').limit(1).maybeSingle()
  if (lookupError) {
    console.error('Local bootstrap admin lookup failed', lookupError.code ?? 'unknown_error')
    return respond({ error: 'Could not verify whether a local administrator already exists.' }, 503)
  }
  if (existingAdmin) return respond({ message: 'A local administrator already exists. No accounts or classroom data were changed.', alreadyExists: true })

  const internalEmail = `${crypto.randomUUID()}@accounts.lecture-recall.invalid`
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: internalEmail,
    password: 'admin',
    email_confirm: true,
    user_metadata: { username: 'admin', full_name: 'Local Administrator' },
  })
  if (createError || !created.user) {
    console.error('Local bootstrap Auth account creation failed', createError?.code ?? 'unknown_error')
    return respond({ error: 'Could not create the local development administrator.' }, 500)
  }

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('username').eq('id', created.user.id).single()
  if (profileError || profile?.username !== 'admin') {
    await admin.auth.admin.deleteUser(created.user.id)
    return respond({ error: 'The username admin is already in use. No local administrator was created.' }, 409)
  }

  const { data: classroom, error: classroomError } = await admin.from('classrooms')
    .insert({ name: 'Local Development Classroom', description: 'Local-only development classroom', owner_id: created.user.id })
    .select('id').single()
  if (classroomError || !classroom) {
    await admin.auth.admin.deleteUser(created.user.id)
    console.error('Local bootstrap classroom creation failed', classroomError?.code ?? 'unknown_error')
    return respond({ error: 'Could not create the local development classroom.' }, 500)
  }

  const { error: membershipError } = await admin.from('memberships').insert({
    user_id: created.user.id,
    classroom_id: classroom.id,
    role: 'admin',
  })
  if (membershipError) {
    await admin.from('classrooms').delete().eq('id', classroom.id)
    await admin.auth.admin.deleteUser(created.user.id)
    console.error('Local bootstrap membership creation failed', membershipError.code ?? 'unknown_error')
    return respond({ error: 'Could not assign the local development administrator.' }, 500)
  }

  return respond({
    message: 'Created the local development administrator and classroom. Sign in with the documented local-only credentials and change the password immediately.',
    alreadyExists: false,
  }, 201)
})
