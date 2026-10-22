import { KeyRound, Settings, UserRound } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PageHeading } from '@/components/ui/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useOpenSettings } from '@/features/settings/settingsModalContext'

export function ProfilePage() {
  const { profile, membership, classroom } = useAuth()
  const openSettings = useOpenSettings()
  return <>
    <PageHeading eyebrow="Your account" title="Profile" description="Your classroom identity and account details." action={<button type="button" onClick={openSettings} className="inline-flex items-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#183b58]"><Settings size={15} /> Edit profile</button>} />
    <Card className="max-w-2xl"><div className="flex items-center gap-4 border-b border-slate-100 pb-5"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-cyan-900"><UserRound size={21} /></div><div><h2 className="font-bold text-slate-900">{profile?.display_name || profile?.full_name || 'Classroom member'}</h2><p className="mt-1 text-sm text-slate-500">@{profile?.username ?? '—'}</p></div></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Role</dt><dd className="mt-1 font-medium capitalize text-slate-800">{membership?.role === 'admin' ? 'Administrator' : membership?.role ?? '—'}</dd></div><div><dt className="text-slate-500">Classroom</dt><dd className="mt-1 font-medium text-slate-800">{classroom?.name ?? '—'}</dd></div><div><dt className="text-slate-500">Account created</dt><dd className="mt-1 font-medium text-slate-800">{profile?.created_at ? new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(profile.created_at)) : '—'}</dd></div></dl><button type="button" onClick={openSettings} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-800"><KeyRound size={15} /> Profile and password settings</button></Card>
  </>
}
