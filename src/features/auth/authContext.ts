import { createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Classroom, Membership, Profile } from '@/types'

export interface AuthContextValue {
  user: User | null
  profile: Profile | null
  membership: Membership | null
  classroom: Classroom | null
  loading: boolean
  identityLoading: boolean
  configured: boolean
  identityError: string | null
  authMessage: string | null
  refreshIdentity: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<{ error: Error | null }>
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (password: string) => Promise<{ error: Error | null }>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuthContext() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuthContext must be used inside AuthProvider')
  return value
}
