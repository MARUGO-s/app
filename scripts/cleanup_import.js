
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function cleanup() {
    console.log('Fetching imported recipes...');
    // Fetch recipes imported recently. ID range observed: 376 - 385
    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*')
        .gte('id', 376);

    if (error) { console.error(error); return; }

    for (const r of recipes) {
        let needsUpdate = false;
        let updates = {};

        // 1. Fix Title
        if (r.title && r.title.endsWith('（')) {
            updates.title = r.title.slice(0, -1);
            needsUpdate = true;
            console.log(`[${r.id}] Fix Title: "${r.title}" -> "${updates.title}"`);
        } else if (r.title && r.title.endsWith('（ ')) {
            updates.title = r.title.trim().slice(0, -1);
            needsUpdate = true;
            console.log(`[${r.id}] Fix Title: "${r.title}" -> "${updates.title}"`);
        }

        // 2. Cleanup "Sauce Chantilly" garbage
        if (r.title.includes('ソース・シャンティイ')) {
            console.log(`[${r.id}] Cleaning up Sauce Chantilly...`);

            // Clean ingredients
            // Remove items where name is "•" or "ておきます" or contains "：" (colon usually implies header like "エシャロットの下処理：")
            // The valid ingredients stop before "ておきます" or "•"
            // based on the JSON view, index 0-6 seem valid. 
            // 0: マヨネーズ
            // 6: シブレット
            // 7: ておきます -> Garbage starts here

            const validIngredients = r.ingredients.filter(i => {
                if (i._meta) return true;
                if (!i.name) return false;
                if (i.name === '•') return false;
                if (i.name.includes('：')) return false; // "エシャロットの下処理："
                if (['ておきます', 'まとめ', 'プロのコツ', '温度管理', '乳化のテクニック'].some(k => i.name.includes(k))) return false;
                // Also empty quantities often indicate garbage text lines in this parser
                if (!i.quantity && i.name.length > 10) return false; // Heuristic
                return true;
            });

            // Clean steps
            // Steps contain "使用例：..." then "フランス料理の..."
            // We want to keep up to "完成です。使う直前に作ります。"

            const validSteps = [];
            for (const s of r.steps) {
                if (s.includes('フランス料理のドレッシングの特徴')) break;
                if (s.includes('使用例：')) {
                    validSteps.push(s); // Keep usage example
                    // But usually usage example lines follow. The parser put them in separate strings?
                    // In JSON: 
                    // "使用例：",
                    // "アスパラガスのサラダ..."
                    continue;
                }
                // Check if it's garbage
                if (s.length < 2 && s.includes('•')) break;

                validSteps.push(s);
            }

            // Further trim steps if "フランス料理の..." was not caught
            // The JSON shows "使用例：" "アスパラガス..." then "フランス料理の..."

            const finalSteps = validSteps.filter(s => !s.includes('フランス料理のドレッシングの特徴') && !s.includes('基本原則'));

            if (validIngredients.length !== r.ingredients.length || finalSteps.length !== r.steps.length) {
                updates.ingredients = validIngredients;
                updates.steps = finalSteps;
                needsUpdate = true;
                console.log(`[${r.id}] Cleaned ingredients: ${r.ingredients.length} -> ${validIngredients.length}`);
                console.log(`[${r.id}] Cleaned steps: ${r.steps.length} -> ${finalSteps.length}`);
            }
        }

        if (needsUpdate) {
            const { error: upError } = await supabase
                .from('recipes')
                .update(updates)
                .eq('id', r.id);

            if (upError) console.error(`Failed to update ${r.id}:`, upError);
        }
    }
    console.log('Cleanup done.');
}

cleanup();
