import { useAuthContext } from '@/features/auth/authContext'

/** Supabase-backed authentication state and actions. */
export function useAuth() {
  return useAuthContext()
}
