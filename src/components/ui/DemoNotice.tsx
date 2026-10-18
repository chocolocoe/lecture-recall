import { Info } from 'lucide-react'
import { supabaseConfigured } from '@/lib/supabase'

export function DemoNotice() {
  const backendMessage = supabaseConfigured
    ? 'Supabase is configured, but the dashboard metrics and activity feed are still preview data.'
    : <>Add <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_URL</code> and a public key as <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_PUBLISHABLE_KEY</code> to configure Supabase.</>
  return <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><Info size={18} className="mt-0.5 shrink-0 text-amber-700" /><p><strong className="font-semibold">Preview mode.</strong> This screen uses sample data. {backendMessage} No changes here are saved.</p></div>
}
