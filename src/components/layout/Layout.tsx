import { useState } from 'react'
import type { ReactNode } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="min-h-screen bg-[#f5f7fa] text-slate-800">
    <Header onMenuClick={() => setMenuOpen((open) => !open)} />
    <div className="mx-auto flex max-w-[1440px]"><Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  </div>
}
