import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const respond = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
)
const usernamePattern = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) return respond({ error: 'Sign-in is not fully configured.' }, 500)

  let payload: unknown
  try { payload = await req.json() } catch { return respond({ error: 'Invalid sign-in request.' }, 400) }
  if (!payload || typeof payload !== 'object') return respond({ error: 'Invalid sign-in request.' }, 400)
  const record = payload as Record<string, unknown>
  const username = typeof record.username === 'string' ? record.username.trim().toLowerCase() : ''
  const password = typeof record.password === 'string' ? record.password : ''
  if (!usernamePattern.test(username) || !password || password.length > 128) {
    return respond({ error: 'Invalid username or password.' }, 400)
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email')
    .eq('username', username)
    .maybeSingle()
  if (profileError) {
    console.error('Username lookup failed', profileError.code ?? 'unknown_error')
    return respond({ error: 'Sign-in is temporarily unavailable. Please try again shortly.' }, 503)
  }

  const auth = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  // Route unknown usernames through Auth too, so failures share the same
  // generic response and Supabase Auth's password-attempt rate limits apply.
  const email = profile?.email
    ? profile.email
    : `unknown-${crypto.randomUUID()}@accounts.lecture-recall.invalid`
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.session) return respond({ error: 'Invalid username or password.' }, 401)

  return respond({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  })
})
