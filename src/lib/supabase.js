import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL na Anon Key hazikuwekwa katika .env.local')
}

// Public client — anon key, limited RLS
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client — service_role key, bypasses RLS
// Used for admin operations (creating users, etc.)
// Add VITE_SUPABASE_SERVICE_ROLE_KEY to .env.local
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null
