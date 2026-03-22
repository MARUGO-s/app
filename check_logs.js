import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hocbnifuactbvmyjraxy.supabase.co';
const supabaseKey = 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: users, error: rpcError } = await supabase.rpc('admin_list_profiles');
    if (rpcError) {
        console.error('Error fetching admin_list_profiles:', rpcError);
    } else {
        for (const p of users.slice(0, 3)) {
            console.log('User:', p.email, p.display_id, 'Last Sign In:', p.last_sign_in_at);

            const { data: logs, error: lError } = await supabase.rpc('admin_get_login_logs', { p_user_id: p.id });
            if (lError) {
                console.error('Error fetching logs for', p.display_id, lError);
            } else {
                console.log('  Logs:', logs);
            }
        }
    }
}

check();
