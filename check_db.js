import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'supabase/.env' });

const supabaseUrl = process.env.SUPABASE_URL || 'https://hocbnifuactbvmyjraxy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error('No service key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('account_backups')
        .select('id, backup_data, recipe_count')
        .limit(1);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Result count:', data?.length);
        if (data && data[0]) {
            console.log('recipe_count:', data[0].recipe_count);
            console.log('backup_data length (array length):', data[0].backup_data?.length);
            console.log('backup_data sample:', JSON.stringify(data[0].backup_data || []).substring(0, 200));
        }
    }
}

check();
