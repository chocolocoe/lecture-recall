import { type ClassValue, clsx } from 'clsx'

// Utility function for merging class names
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Date formatting utilities
export function formatDate(date: string | Date): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

export function formatDateTime(date: string | Date): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}
