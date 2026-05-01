import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Supabase環境変数が設定されていません。' +
        '.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。' +
        '（.env.example を参照）'
    )
}

// Export URL for diagnostics in UI (safe to expose).
export const SUPABASE_URL = supabaseUrl
// Publishable anon key (safe to expose in the client).
export const SUPABASE_ANON_KEY = supabaseAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
