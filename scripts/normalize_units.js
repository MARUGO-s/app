
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

const DRY_RUN = !process.argv.includes('--commit');

async function normalize() {
    console.log(`Starting normalization (${DRY_RUN ? 'DRY RUN' : 'COMMIT'})...`);

    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*');

    if (error) { console.error(error); return; }

    let updatedCount = 0;

    for (const r of recipes) {
        if (!r.ingredients || !Array.isArray(r.ingredients)) continue;

        let modified = false;
        const newIngredients = r.ingredients.map(i => {
            if (i._meta) return i;

            let q = i.quantity;
            let u = i.unit ? i.unit.trim() : '';
            let origQ = q;
            let origU = u;

            // 1. Normalize 'cc' -> 'ml'
            if (u === 'cc') {
                u = 'ml';
            }

            // 2. Normalize 'l', 'ℓ', 'リットル' -> 'ml' (* 1000)
            if (['l', 'ℓ', 'リットル'].includes(u)) {
                if (!isNaN(parseFloat(q))) {
                    q = parseFloat(q) * 1000;
                    u = 'ml';
                }
            }

            // 3. Parse unparsed quantities if unit is empty or generic
            if (!u || u === '') {
                // Check if quantity has embedded unit
                const str = String(q).trim();
                // Regex for number followed by potential unit
                // Handles: "200g", "1/2個", "3cm", etc.
                const match = str.match(/^([\d./]+)\s*([^\d\s].*)$/);
                if (match) {
                    // Verify the captured unit part looks like a unit
                    // (2+ chars or specific single chars like 'g', 'l')
                    const valPart = match[1];
                    const unitPart = match[2];

                    // Simple check: is valPart a number?
                    // (Could be 1/2, so simple parseFloat might fail if not careful, 
                    // but let's assume decimal for now or implement fraction parser if needed.
                    // The scan showed mostly decimals or integers).
                    if (!isNaN(parseFloat(valPart))) {
                        q = valPart;
                        u = unitPart;
                    }
                }
            }

            // 4. Specific fix for "g" sometimes appearing in quantity like "200g" even if unit was not empty? 
            // The scan showed (none) for unit but "200g" in quantity.

            // Check changes
            if (q != origQ || u != origU) {
                // If quantity became string "200" from "200g", ensure we store it cleanly
                // Try to convert to number if it looks like one
                if (!isNaN(Number(q)) && String(q).trim() !== '') {
                    q = Number(q);
                }

                if (q != origQ || u != origU) {
                    modified = true;
                    console.log(`[${r.title}] ${i.name}: "${origQ}" [${origU}] -> "${q}" [${u}]`);
                    return { ...i, quantity: q, unit: u };
                }
            }

            return i;
        });

        if (modified) {
            updatedCount++;
            if (!DRY_RUN) {
                const { error: updateError } = await supabase
                    .from('recipes')
                    .update({ ingredients: newIngredients })
                    .eq('id', r.id);

                if (updateError) console.error(`Failed to update ${r.title}:`, updateError);
            }
        }
    }

    console.log(`\nFound ${updatedCount} recipes to update.`);
    if (DRY_RUN) console.log('Run with --commit to apply changes.');
}

normalize();
