const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('supabase/.env', 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';

envContent.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim();
});

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('recipes')
        .select('id, title, user_id, author_id, tags')
        .limit(3);

    if (error) {
        console.error('Error fetching recipes:', error);
    } else {
        console.log('Recipes:', JSON.stringify(data, null, 2));
    }
}

check();
