// Reusable card component

import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}