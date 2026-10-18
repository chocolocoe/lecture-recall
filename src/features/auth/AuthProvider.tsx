import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Classroom, Membership, Profile } from '@/types'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [loading, setLoading] = useState(true)
  const [identityLoading, setIdentityLoading] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const requestId = useRef(0)

  const clearIdentity = useCallback(() => {
    requestId.current += 1
    setUser(null)
    setProfile(null)
    setMembership(null)
    setClassroom(null)
    setIdentityError(null)
    setIdentityLoading(false)
  }, [])

  const loadIdentity = useCallback(async (currentUser: User) => {
    const id = ++requestId.current
    setIdentityLoading(true)
    setIdentityError(null)

    if (!supabase) {
      clearIdentity()
      setIdentityLoading(false)
      return
    }

    const [profileResult, membershipResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
      supabase.from('memberships').select('*').eq('user_id', currentUser.id).maybeSingle(),
    ])
    if (id !== requestId.current) return

    if (profileResult.error || membershipResult.error) {
      setProfile(null)
      setMembership(null)
      setClassroom(null)
      setIdentityError(profileResult.error?.message ?? membershipResult.error?.message ?? 'Unable to load your account.')
      setIdentityLoading(false)
      return
    }

    const profileRow = profileResult.data
    const membershipRow = membershipResult.data
    if (!profileRow || !membershipRow) {
      setProfile(profileRow)
      setMembership(membershipRow)
      setClassroom(null)
      setIdentityLoading(false)
      return
    }

    const classroomResult = await supabase.from('classrooms').select('*').eq('id', membershipRow.classroom_id).maybeSingle()
    if (id !== requestId.current) return
    if (classroomResult.error) {
      setProfile(profileRow)
      setMembership(membershipRow)
      setClassroom(null)
      setIdentityError(classroomResult.error.message)
    } else {
      setProfile(profileRow)
      setMembership(membershipRow)
      setClassroom(classroomResult.data)
    }
    setIdentityLoading(false)
  }, [clearIdentity])

  const refreshIdentity = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      setIdentityError(error.message)
      return
    }
    if (data.session?.user) {
      setUser(data.session.user)
      await loadIdentity(data.session.user)
    } else {
      clearIdentity()
    }
  }, [clearIdentity, loadIdentity])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    let authEventCount = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
      authEventCount += 1
      const eventNumber = authEventCount
      setAuthMessage(event === 'SIGNED_OUT' ? 'You have been signed out.' : null)

      if (!session?.user) {
        clearIdentity()
        setLoading(false)
        return
      }

      setIdentityLoading(true)
      setUser(session.user)
      setLoading(false)
      // Defer Data API calls until Supabase has released its auth event lock.
      setTimeout(() => {
        if (active && eventNumber === authEventCount) void loadIdentity(session.user)
      }, 0)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventCount > 0) return
      if (error) setIdentityError(error.message)
      if (data.session?.user) {
        setIdentityLoading(true)
        setUser(data.session.user)
        void loadIdentity(data.session.user)
      }
      setLoading(false)
    })

    return () => {
      active = false
      requestId.current += 1
      subscription.unsubscribe()
    }
  }, [clearIdentity, loadIdentity])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase is not configured. Add the project URL and publishable key.') }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return { error: new Error('Supabase is not configured.') }
    const { error } = await supabase.auth.signOut()
    return { error }
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return { error: new Error('Supabase is not configured.') }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login?flow=recovery`,
    })
    return { error }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return { error: new Error('Supabase is not configured.') }
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }, [])

  return <AuthContext.Provider value={{
    user, profile, membership, classroom, loading, identityLoading,
    configured: supabaseConfigured, identityError, authMessage, refreshIdentity,
    signIn, signOut, requestPasswordReset, updatePassword,
  }}>{children}</AuthContext.Provider>
}
