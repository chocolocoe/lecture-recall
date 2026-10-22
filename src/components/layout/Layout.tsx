import { useState } from 'react'
import type { ReactNode } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { SettingsModalContext } from '@/features/settings/settingsModalContext'
import { SettingsPage } from '@/features/settings/SettingsPage'

export function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  return <SettingsModalContext.Provider value={() => setSettingsOpen(true)}><div className="min-h-screen bg-[#f5f7fa] text-slate-800">
    <Header onMenuClick={() => setMenuOpen((open) => !open)} onSettingsClick={() => setSettingsOpen(true)} />
    <div className="mx-auto flex max-w-[1440px]"><Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
    {settingsOpen && <SettingsPage onClose={() => setSettingsOpen(false)} />}
  </div></SettingsModalContext.Provider>
}
