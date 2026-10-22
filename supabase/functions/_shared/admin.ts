import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AdminContext = {
  ok: true
  caller: ReturnType<typeof createClient>
  admin: ReturnType<typeof createClient>
  userId: string
}

export type AdminContextFailure = { ok: false; status: number; error: string }

export async function requireClassroomAdmin(req: Request, classroomId: string): Promise<AdminContext | AdminContextFailure> {
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return { ok: false, status: 401, error: 'A valid sign-in is required.' }

  const url = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !publicKey || !serviceRoleKey) return { ok: false, status: 500, error: 'Account management is not fully configured.' }

  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data, error } = await caller.auth.getUser(token)
  if (error || !data.user) return { ok: false, status: 401, error: 'Session is invalid or expired.' }

  const { data: membership, error: membershipError } = await caller
    .from('memberships')
    .select('role')
    .eq('classroom_id', classroomId)
    .eq('user_id', data.user.id)
    .maybeSingle()
  if (membershipError || membership?.role !== 'admin') {
    return { ok: false, status: 403, error: 'Only a classroom administrator can manage accounts.' }
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return { ok: true, caller, admin, userId: data.user.id }
}

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export const usernamePattern = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/
