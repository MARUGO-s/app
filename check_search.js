import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hocbnifuactbvmyjraxy.supabase.co';
const supabaseKey = 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'pingus0428@icloud.com',
        password: 'password123'
    });

    if (authError) {
        console.log('Login failed:', authError.message);
    } else {
        console.log('Logged in as pingus0428@icloud.com');
    }
}

check();
