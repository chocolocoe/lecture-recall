import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { user, profile, membership, classroom, loading, identityLoading, identityError, refreshIdentity, signOut } = useAuth()

  if (loading || (user && identityLoading)) {
    return <main className="flex min-h-screen items-center justify-center px-4"><p role="status" className="text-sm font-medium text-slate-600">Checking your classroom account…</p></main>
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  if (identityError) {
    return <AccountProblem title="We couldn't verify your classroom access" message={identityError} onRetry={() => void refreshIdentity()} onSignOut={() => void signOut()} />
  }
  if (!profile || !membership || !classroom) {
    return <AccountProblem
      title="Your account needs classroom setup"
      message="This signed-in account is missing a profile, classroom membership, or accessible classroom. Ask your classroom administrator or project owner to finish setup. You cannot choose your own role or classroom."
      onRetry={() => void refreshIdentity()}
      onSignOut={() => void signOut()}
    />
  }

  return children
}

function AccountProblem({ title, message, onRetry, onSignOut }: { title: string; message: string; onRetry: () => void; onSignOut: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] px-4 py-10"><section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-bold uppercase tracking-wide text-cyan-800">Lecture Recall account</p><h1 className="mt-3 text-xl font-bold text-slate-900">{title}</h1><p role="alert" className="mt-3 text-sm leading-6 text-slate-600">{message}</p><div className="mt-6 flex flex-wrap gap-3"><Button onClick={onRetry}>Try again</Button><Button variant="outline" onClick={onSignOut}>Sign out</Button></div></section></main>
}
