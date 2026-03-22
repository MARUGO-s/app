
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://hocbnifuactbvmyjraxy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing credentials");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkAdminProfile() {
    console.log("Checking Admin Profiles...");

    // 1. Get current session (likely won't work in script without login, but we can list all admins)
    // We will just list all profiles with role 'admin' or display_id 'pingus0428' or email like 'pingus%'

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .or('role.eq.admin,display_id.eq.pingus0428,display_id.eq.admin');

    if (error) {
        console.error("Error fetching profiles:", error);
    } else {
        console.log("Found Profiles:");
        console.table(profiles);
    }
}

checkAdminProfile();
