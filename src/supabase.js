import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hocbnifuactbvmyjraxy.supabase.co'
const supabaseAnonKey = 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
