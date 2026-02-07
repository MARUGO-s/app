
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual simple env parser
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (!fs.existsSync(envPath)) return {};
        const content = fs.readFileSync(envPath, 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                if (key && !key.startsWith('#')) env[key] = val;
            }
        });
        return env;
    } catch (e) {
        return {};
    }
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTags() {
    console.log("Checking Recipe Tags...");

    // 1. Get Master Tags via RPC
    const { data: masterTags, error: rpcError } = await supabase.rpc('get_master_recipe_owner_tags');
    if (rpcError) console.error("RPC Error:", rpcError);
    else console.log("Master Owner Tags:", masterTags);

    const masterSet = new Set(masterTags || []);

    // 2. Fetch All Recipes
    const { data: recipes, error: recipeError } = await supabase
        .from('recipes')
        .select('id, title, tags, updated_at');

    if (recipeError) {
        console.error("Recipe Fetch Error:", recipeError);
    } else {
        console.log(`Fetched ${recipes.length} recipes.`);
        // console.log(JSON.stringify(recipes, null, 2));

        let visibleCount = 0;
        recipes.forEach(r => {
            const tags = Array.isArray(r.tags) ? r.tags : [];
            const ownerTags = tags.filter(t => t.startsWith('owner:'));

            const isMaster = ownerTags.some(t => masterSet.has(t));
            const isNoOwner = ownerTags.length === 0;

            let status = "HIDDEN";
            if (isMaster) status = "VISIBLE (Master)";
            else if (isNoOwner) status = "VISIBLE (Legacy/NoOwner)";
            else status = `HIDDEN (Owner: ${ownerTags.join(', ')})`;

            console.log(`[${status}] ${r.title} (Tags: ${tags.join(', ')})`);
        });
    }
}

checkTags();
