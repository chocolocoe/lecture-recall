import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'

type LocationState = { from?: { pathname?: string } }

export function LoginPage() {
  const { user, profile, membership, classroom, loading, identityLoading, configured, identityError, authMessage, signIn, signOut, requestPasswordReset, updatePassword } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const flow = searchParams.get('flow')
  const passwordSetup = flow === 'invite' || flow === 'recovery'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const state = location.state as LocationState | null
  const destination = useMemo(() => state?.from?.pathname || '/', [state])

  useEffect(() => {
    if (user?.email) setEmail((current) => current || user.email || '')
  }, [user])

  if (!loading && user && !identityLoading && profile && membership && classroom && !passwordSetup) {
    return <Navigate to={destination} replace />
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setPending(true)
    try {
      if (passwordSetup) {
        if (!user) throw new Error('This invitation or recovery link is invalid or has expired. Request a new link and try again.')
        if (password.length < 8) throw new Error('Choose a password with at least 8 characters.')
        if (password !== confirmation) throw new Error('The passwords do not match.')
        const result = await updatePassword(password)
        if (result.error) throw result.error
        setSuccess('Password saved. Checking your classroom access…')
      } else {
        const result = await signIn(email, password)
        if (result.error) throw result.error
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function sendRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setPending(true)
    const result = await requestPasswordReset(email)
    setPending(false)
    if (result.error) setError(result.error.message)
    else setSuccess('If an account exists for that email, a password recovery link will arrive shortly.')
  }

  const recoveryRequest = flow === 'forgot'
  const title = passwordSetup ? flow === 'invite' ? 'Set your password' : 'Choose a new password' : recoveryRequest ? 'Reset your password' : 'Welcome back'
  const description = passwordSetup
    ? flow === 'invite' ? 'Finish setting up the account invited to Lecture Recall.' : 'Choose a new password for your classroom account.'
    : recoveryRequest ? 'We will email you a secure password recovery link.' : 'Sign in with your invited classroom account.'

  return <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] px-4 py-10"><div className="w-full max-w-md">
    <Link to="/login" className="mb-7 flex items-center justify-center gap-2.5 text-lg font-bold text-slate-900"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102a43] text-cyan-300"><BookOpen size={20} /></span>Lecture Recall</Link>
    <Card className="!p-6 sm:!p-8">
      <div className="mb-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-cyan-800"><LockKeyhole size={21} /></div><h1 className="mt-4 text-xl font-bold text-slate-900">{title}</h1><p className="mt-2 text-sm text-slate-500">{description}</p></div>

      {!configured ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Supabase is not configured.</strong><br />Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in your local environment, then restart the development server. The legacy <code>VITE_SUPABASE_ANON_KEY</code> is also accepted. No demo sign-in is available.</div>
        : recoveryRequest ? <form onSubmit={sendRecovery} className="space-y-4"><Input id="email" name="email" label="Email address" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /><Button type="submit" className="w-full" disabled={pending}>{pending ? 'Sending…' : 'Send recovery link'}</Button><Link to="/login" className="flex items-center justify-center gap-1 text-sm font-medium text-cyan-900"><ArrowLeft size={14} /> Back to sign in</Link></form>
          : <form onSubmit={submit} className="space-y-4">
            {!passwordSetup && <Input id="email" name="email" label="Email address" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />}
            {passwordSetup && user?.email && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Account: <strong>{user.email}</strong></p>}
            <Input id="password" name="password" label={passwordSetup ? 'New password' : 'Password'} type="password" autoComplete={passwordSetup ? 'new-password' : 'current-password'} minLength={passwordSetup ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />
            {passwordSetup && <Input id="confirmation" name="confirmation" label="Confirm password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />}
            <Button type="submit" className="w-full" disabled={pending || (passwordSetup && !user)}>{pending ? 'Please wait…' : passwordSetup ? 'Save password' : 'Sign in'} {!pending && <ArrowRight size={16} />}</Button>
            {!passwordSetup && <Link to="/login?flow=forgot" className="block text-center text-sm font-medium text-cyan-900 hover:underline">Forgot password?</Link>}
            {passwordSetup && !user && <p role="alert" className="text-sm text-rose-700">{flow === 'invite' ? 'Open the invitation link from your email to set your password.' : 'Open the recovery link from your email to set a new password.'}</p>}
          </form>}

      {(error || identityError) && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm leading-5 text-rose-800">{error || `We could not verify your classroom account: ${identityError}`}</p>}
      {success && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm leading-5 text-emerald-800">{success}</p>}
      {authMessage && !success && <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{authMessage}</p>}
      {user && !identityLoading && (!profile || !membership || !classroom) && !identityError && <div className="mt-4 space-y-3 rounded-lg bg-amber-50 p-3 text-sm leading-5 text-amber-950"><p>Your account is signed in, but classroom setup is incomplete. Ask an administrator to assign your membership; roles cannot be selected here.</p><Button variant="outline" size="sm" onClick={() => void signOut()}>Sign out</Button></div>}
      {passwordSetup && user && !identityLoading && profile && membership && classroom && <Link to="/" className="mt-4 block text-center text-sm font-semibold text-cyan-900">Continue to your classroom</Link>}
    </Card>
    <p className="mt-5 text-center text-xs text-slate-500">Accounts are created by invitation. Contact your classroom administrator if you need access.</p>
  </div></main>
}
