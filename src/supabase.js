import { createClient } from '@supabase/supabase-js'

// Use environment variables if available, otherwise fallback to hardcoded (legacy/dev)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hocbnifuactbvmyjraxy.supabase.co';
// WARNING: The hardcoded key 'sb_publishable_...' appears to be invalid for Edge Functions. 
// Please ensure VITE_SUPABASE_ANON_KEY is set in your .env file with a valid Anon JWT (starts with eyJ...).
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
