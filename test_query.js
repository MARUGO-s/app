import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hocbnifuactbvmyjraxy.supabase.co';
const supabaseKey = 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.rpc('admin_list_profiles');
    if (error) {
        console.error('Error fetching profiles via RPC:', error);
    } else {
        for (const p of data.slice(0, 3)) {
            console.log({ id: p.id, display_id: p.display_id, last_sign_in_at: p.last_sign_in_at });
        }
    }
}

check();
