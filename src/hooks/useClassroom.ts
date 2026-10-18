import { useAuthContext } from '@/features/auth/authContext'

/** The verified classroom and membership loaded for the current Supabase user. */
export function useClassroom() {
  const { classroom, membership, identityLoading, identityError, refreshIdentity } = useAuthContext()
  return { classroom, membership, loading: identityLoading, error: identityError, refresh: refreshIdentity }
}
