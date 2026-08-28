
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspect() {
    console.log('Fetching recipe...');
    const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .like('title', '%エスカベーシュ用のマリナード%') // Partial match just in case
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Title:', data.title);
    console.log('ID:', data.id);
    console.log('Ingredients:', JSON.stringify(data.ingredients, null, 2));
}

inspect();
