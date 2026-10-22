import { Info } from 'lucide-react'
import { supabaseConfigured } from '@/lib/supabase'

export function DemoNotice() {
  if (supabaseConfigured) return null
  return <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><Info size={18} className="mt-0.5 shrink-0 text-amber-700" /><p><strong className="font-semibold">Sample data.</strong> Configure Supabase with <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_URL</code> and <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_PUBLISHABLE_KEY</code> to use your classroom. Changes cannot be saved until Supabase is configured.</p></div>
}
