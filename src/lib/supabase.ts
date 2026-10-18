import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublicKey)

// Keep the interface available in demo mode when backend configuration is absent.
export const supabase: SupabaseClient<Database> | null = supabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabasePublicKey as string)
  : null
