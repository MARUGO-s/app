
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Default locations for local sample artifacts (gitignored).
const recipesFile = process.argv[2] || 'samples/json/chiffon_recipes.json';

async function importRecipes() {
    if (!fs.existsSync(recipesFile)) {
        console.error('File not found:', recipesFile);
        return;
    }

    const recipes = JSON.parse(fs.readFileSync(recipesFile, 'utf8'));
    console.log(`Importing ${recipes.length} recipes...`);

    for (const recipe of recipes) {
        // Prepare ingredients payload
        // Needs structure: [ { _meta: true, type: 'normal' }, { name, quantity, unit, id, ... } ]

        const ingredients = recipe.ingredients.map((ing, index) => ({
            id: `ing-${Date.now()}-${index}`,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit || '',
            // Optional: cost, purchaseCost, etc. default to 0
            cost: '0',
            purchaseCost: '0'
        }));

        const ingredientsPayload = [
            { _meta: true, type: 'normal' },
            ...ingredients
        ];

        const payload = {
            title: recipe.title,
            description: recipe.description,
            image: null, // No images extracted
            servings: 1, // Default
            course: '', // Default
            category: 'シフォンケーキ', // Tag/Category
            store_name: 'PDF Import',
            ingredients: ingredientsPayload,
            steps: recipe.steps,
            tags: ['シフォンケーキ', 'PDF取り込み']
        };

        const { data, error } = await supabase
            .from('recipes')
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error(`Error adding recipe "${recipe.title}":`, error.message);
        } else {
            console.log(`Successfully added recipe: ${data.title} (ID: ${data.id})`);
        }
    }
}

importRecipes();
