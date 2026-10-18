import type { ReactNode } from 'react'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-cyan-800">{eyebrow}</p>}<h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action && <div className="shrink-0">{action}</div>}</div>
}
