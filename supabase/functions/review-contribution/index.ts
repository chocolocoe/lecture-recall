// Review one pending student note using the caller's JWT. No service-role key
// is used; database grants and RLS remain the final authorization boundary.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'A valid bearer token is required.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !publicKey) return json({ error: 'Backend configuration is incomplete.' }, 500)

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }
  if (!payload || typeof payload !== 'object') return json({ error: 'Invalid request body.' }, 400)
  const record = payload as Record<string, unknown>
  const contributionId = record.contributionId
  const status = record.status
  if (typeof contributionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contributionId)) {
    return json({ error: 'contributionId must be a UUID.' }, 400)
  }
  if (status !== 'approved' && status !== 'rejected') {
    return json({ error: 'status must be approved or rejected.' }, 400)
  }

  const supabase = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Session is invalid or expired.' }, 401)

  const { data: contribution, error: contributionError } = await supabase
    .from('lesson_contributions')
    .select('id, lesson_id, submitted_by, status')
    .eq('id', contributionId)
    .maybeSingle()
  if (contributionError) return json({ error: 'Unable to load the note for review.' }, 403)
  if (!contribution) return json({ error: 'Note not found or not visible to this account.' }, 404)
  if (contribution.submitted_by === authData.user.id) return json({ error: 'You cannot review your own note.' }, 403)
  if (contribution.status !== 'pending') return json({ error: 'Only pending notes can be reviewed.' }, 409)

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('classroom_id')
    .eq('id', contribution.lesson_id)
    .maybeSingle()
  if (lessonError || !lesson) return json({ error: 'Lesson not found or not accessible.' }, 404)

  const permissionKeys = ['contributions.review', status === 'approved' ? 'contributions.approve' : 'contributions.reject']
  for (const permissionKey of permissionKeys) {
    const { data: allowed, error: permissionError } = await supabase.rpc('has_effective_permission', {
      p_classroom_id: lesson.classroom_id,
      p_permission_key: permissionKey,
      p_resource_id: contribution.id,
    })
    if (permissionError || allowed !== true) return json({ error: 'This account does not have permission to review the note.' }, 403)
  }

  const { data: reviewed, error: reviewError } = await supabase
    .from('lesson_contributions')
    .update({ status, reviewed_by: authData.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', contributionId)
    .eq('status', 'pending')
    .select('id, status, reviewed_by, reviewed_at')
    .maybeSingle()

  if (reviewError) return json({ error: 'Review was rejected by database authorization.' }, 403)
  if (!reviewed) return json({ error: 'The note was already reviewed. Refresh and try again.' }, 409)
  return json({ contribution: reviewed })
})
