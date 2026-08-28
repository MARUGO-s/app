
// ... imports same as before ...
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function scan() {
    console.log('Scanning for traditional units...');
    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*');

    if (error) { console.error(error); return; }

    const traditionalCounts = {
        '大さじ': 0,
        '小さじ': 0,
        'カップ': 0,
        'ml (cc)': 0,
        'l (liter)': 0
    };

    // Explicit matches for "大さじ" in quantity or unit
    const matches = [];

    recipes.forEach(r => {
        if (!r.ingredients || !Array.isArray(r.ingredients)) return;
        r.ingredients.forEach(i => {
            if (i._meta) return;
            const q = String(i.quantity || '');
            const u = String(i.unit || '');
            const combined = `${q} ${u}`;

            if (combined.includes('大さじ')) {
                traditionalCounts['大さじ']++;
                if (matches.length < 5) matches.push({ title: r.title, raw: `${i.name}: ${q} [${u}]` });
            }
            if (combined.includes('小さじ')) traditionalCounts['小さじ']++;
            if (combined.includes('カップ')) traditionalCounts['カップ']++;
            if (combined.includes('cc') || u === 'cc') traditionalCounts['ml (cc)']++;
            if (u === 'l' || u === 'ℓ' || u === 'リットル') traditionalCounts['l (liter)']++;
        });
    });

    console.table(traditionalCounts);
    console.log('\nSample Matches for "大さじ":');
    matches.forEach(m => console.log(`- [${m.title}] ${m.raw}`));
}

scan();
