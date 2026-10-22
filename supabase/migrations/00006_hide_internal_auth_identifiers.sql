-- Keep Supabase's email-shaped Auth identifiers private from browser sessions.
-- Username login and password reauthentication use them only in trusted code.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id,
  username,
  full_name,
  display_name,
  avatar_url,
  created_at,
  updated_at
) ON public.profiles TO authenticated;
