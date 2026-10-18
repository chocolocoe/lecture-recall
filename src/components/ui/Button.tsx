// Reusable button component

import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-[#102a43] text-white hover:bg-[#183b58]',
        variant === 'secondary' && 'bg-cyan-700 text-white hover:bg-cyan-800',
        variant === 'outline' && 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-700',
        size === 'sm' && 'px-3 py-2 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-5 py-3 text-sm',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
