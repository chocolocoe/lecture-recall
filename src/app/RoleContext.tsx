import { useAuthContext } from '@/features/auth/authContext'

/** Dashboard role comes only from the database membership loaded for this session. */
export function useCurrentRole() {
  return useAuthContext().membership?.role ?? 'student'
}
