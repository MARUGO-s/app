import { createClient } from '@supabase/supabase-js'

// Helper to get env vars in both Vite (import.meta.env) and Node (process.env)
const getEnv = (key) => {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
        return import.meta.env[key];
    }
    const procEnv = globalThis?.process?.env;
    if (procEnv && procEnv[key]) return procEnv[key];
    return null;
};

// Use environment variables if available
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://hocbnifuactbvmyjraxy.supabase.co';
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
