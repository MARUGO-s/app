import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env manually since we are in a simple script context
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) env[key.trim()] = val.trim();
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const runMigration = async () => {
    const isCommit = process.argv.includes('--commit');
    console.log(`Starting migration in ${isCommit ? 'COMMIT' : 'DRY RUN'} mode...`);

    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*');

    if (error) {
        console.error('Error fetching recipes:', error);
        return;
    }

    console.log(`Fetched ${recipes.length} recipes.`);

    for (const recipe of recipes) {
        let modified = false;

        // Helper to process a list of ingredients
        const processList = (list) => {
            return list.map(item => {
                // Skip if already has unit or no quantity
                if (item.unit || !item.quantity) return item;

                const qStr = String(item.quantity).trim();

                // Matches "number" then optional "space" then "text"
                // Group 1: Number (integer or float, including fractions like 1/2 if we wanted, but let's stick to decimals for now)
                // Actually regex for simple decimal: ^([\d.]+)\s*(.*)$
                const match = qStr.match(/^([\d.]+)\s*(.*)$/);

                if (match) {
                    const qty = parseFloat(match[1]);
                    const unit = match[2];

                    // Only modify if we actually found a unit or if we want to convert string "100" to number 100
                    if (!isNaN(qty)) {
                        modified = true;
                        // console.log(`Parsed: "${qStr}" -> ${qty} [${unit}]`);
                        return {
                            ...item,
                            quantity: qty,
                            unit: unit || '' // Ensure unit is string
                        };
                    }
                }
                return item;
            });
        };

        let newIngredients = recipe.ingredients;

        if (Array.isArray(recipe.ingredients)) {
            // Handle "bread" type packing specially if needed, but our generic traversal might be enough if structure is flat.
            // recipeService says: [ { _meta... }, ...flours, ...others ]
            // So we can just map the whole array.
            newIngredients = processList(recipe.ingredients);
        }

        if (modified) {
            console.log(`[Recipe: ${recipe.title}]`);
            // Show diff
            recipe.ingredients.forEach((oldItem, i) => {
                const newItem = newIngredients[i];
                if (oldItem.quantity !== newItem.quantity || oldItem.unit !== newItem.unit) {
                    console.log(`  - "${oldItem.quantity}" -> Qty: ${newItem.quantity}, Unit: "${newItem.unit}"`);
                }
            });

            if (isCommit) {
                const { error: updateError } = await supabase
                    .from('recipes')
                    .update({ ingredients: newIngredients })
                    .eq('id', recipe.id);

                if (updateError) {
                    console.error(`  FAILED to update: ${updateError.message}`);
                } else {
                    console.log(`  Saved.`);
                }
            }
        }
    }

    console.log('Done.');
};

runMigration();
