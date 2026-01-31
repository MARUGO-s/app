
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function fix() {
    console.log('Fetching target recipe...');
    const { data: r, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', 118)
        .single();

    if (error) { console.error(error); return; }

    console.log(`Updating ${r.title}...`);

    const newIngredients = r.ingredients.map(i => {
        if (i.unit === 'cc') {
            console.log(`${i.name}: cc -> ml`);
            return { ...i, unit: 'ml' };
        }
        return i;
    });

    const { error: updateError } = await supabase
        .from('recipes')
        .update({ ingredients: newIngredients })
        .eq('id', 118);

    if (updateError) {
        console.error('Update failed:', updateError);
    } else {
        console.log('Success!');
    }
}

fix();
