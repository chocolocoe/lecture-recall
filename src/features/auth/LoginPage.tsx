import { useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, BookOpen, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'

type LocationState = { from?: { pathname?: string } }

export function LoginPage() {
  const { user, profile, membership, classroom, loading, identityLoading, configured, identityError, authMessage, signIn } = useAuth()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const state = location.state as LocationState | null
  const destination = useMemo(() => state?.from?.pathname || '/', [state])

  if (!loading && user && !identityLoading && profile && membership && classroom) {
    return <Navigate to={destination} replace />
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setPending(true)
    try {
      const result = await signIn(username, password)
      if (result.error) throw result.error
      setSuccess('Signed in. Loading your classroom…')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] px-4 py-10"><div className="w-full max-w-md">
    <Link to="/login" className="mb-7 flex items-center justify-center gap-2.5 text-lg font-bold text-slate-900"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102a43] text-cyan-300"><BookOpen size={20} /></span>Lecture Recall</Link>
    <Card className="!p-6 sm:!p-8">
      <div className="mb-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-cyan-800"><LockKeyhole size={21} /></div><h1 className="mt-4 text-xl font-bold text-slate-900">Welcome back</h1><p className="mt-2 text-sm text-slate-500">Sign in with your classroom username and password.</p></div>
      {!configured ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Supabase is not configured.</strong><br />Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in your local environment, then restart the development server. No demo sign-in is available.</div>
        : <form onSubmit={submit} className="space-y-4">
          <Input id="username" name="username" label="Username" autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} />
          <Input id="password" name="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'} {!pending && <ArrowRight size={16} />}</Button>
        </form>}
      {(error || identityError) && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm leading-5 text-rose-800">{error || `We could not load your classroom access: ${identityError}`}</p>}
      {success && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm leading-5 text-emerald-800">{success}</p>}
      {authMessage && !success && <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{authMessage}</p>}
      {user && !identityLoading && (!profile || !membership || !classroom) && !identityError && <div className="mt-4 space-y-3 rounded-lg bg-amber-50 p-3 text-sm leading-5 text-amber-950"><p>Your account is signed in, but classroom setup is incomplete. Ask an administrator to assign your membership; roles cannot be selected here.</p></div>}
    </Card>
    <p className="mt-5 text-center text-xs text-slate-500">Accounts are created by your classroom administrator. Contact them if you need access.</p>
  </div></main>
}
