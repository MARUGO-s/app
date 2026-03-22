
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Usage: node import_run.js <json_file>');
    process.exit(1);
}

async function importRecipes() {
    if (!fs.existsSync(inputFile)) {
        console.error('File not found:', inputFile);
        return;
    }

    const raw = fs.readFileSync(inputFile, 'utf8');
    const recipes = JSON.parse(raw);

    console.log(`Importing ${recipes.length} recipes from ${inputFile}...`);

    for (const r of recipes) {
        // Map fields
        // Parser output: name, description, ingredients, steps
        // DB expects: title, description, ingredients (with _meta), steps

        const title = r.title || r.name || 'Untitled Recipe';

        // Construct ingredients with meta
        const ingredients = [
            { _meta: true, type: 'normal', groups: [{ id: 'default', name: '材料' }] },
            ...r.ingredients.map(i => ({
                ...i,
                groupId: 'default',
                // Ensure quantity is clean logic?
                // The convert_units.js already cleaned it up mostly.
            }))
        ];

        const payload = {
            title: title,
            description: r.description || '',
            ingredients: ingredients,
            steps: r.steps || [],
            category: 'ドレッシング', // Default for this batch per user request context
            course: 'ソース・ドレッシング',
            // Default tags
            tags: ['PDF Import', 'ドレッシング']
        };

        const { data, error } = await supabase
            .from('recipes')
            .insert([payload])
            .select('id, title');

        if (error) {
            console.error(`Failed to import "${title}":`, error.message);
        } else {
            console.log(`Imported "${title}" (ID: ${data[0].id})`);
        }
    }

    console.log('Done.');
}

importRecipes();
