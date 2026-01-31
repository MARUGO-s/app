
import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hocbnifuactbvmyjraxy.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env or hardcoded');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Target file to look for (User's specific file)
const TARGET_FILENAME = 'プロ仕様ガトーショコラ専門レシピ集.xlsx';

function parseIngredient(text) {
    if (!text) return { name: '', quantity: '', unit: '' };
    text = String(text).trim();

    // Strategy: Split by at least 2 spaces
    const parts = text.split(/\s{2,}/);
    if (parts.length >= 2) {
        const name = parts[0];
        const rest = parts[parts.length - 1];
        return { name: name, quantity: rest, unit: '' };
    }

    // Fallback: split by last single space if it looks like a number
    const lastSpace = text.lastIndexOf(' ');
    if (lastSpace > 0) {
        const name = text.substring(0, lastSpace);
        const rest = text.substring(lastSpace + 1);
        if (/^[\d./]/.test(rest)) {
            return { name: name, quantity: rest, unit: '' };
        }
    }

    return { name: text, quantity: '', unit: '' };
}

async function processFile(filePath) {
    console.log(`Processing ${filePath}...`);

    try {
        await fs.access(filePath);
    } catch {
        console.error(`File not found: ${filePath}`);
        console.error(`Please make sure to copy "${TARGET_FILENAME}" to the project root: ${PROJECT_ROOT}`);
        return;
    }

    console.log(`  Reading Excel file...`);
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];

        // Read as Matrix (Array of Arrays) to detect structure reliably
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (rawData.length === 0) continue;

        // Detect Card Format: Look for specific keys in the first column
        const firstCol = rawData.map(row => String(row[0] || '').trim());
        const hasRecipeName = firstCol.includes('レシピ名');
        const hasIngredients = firstCol.includes('材料');

        if (hasRecipeName && hasIngredients) {
            console.log(`  Sheet '${sheetName}' detected as Recipe Card.`);
            const recipeObj = {};

            // Convert KV rows to object
            for (const row of rawData) {
                if (row.length < 2) continue;
                const key = String(row[0]).trim();
                const val = String(row[1] || '').trim();
                if (key) recipeObj[key] = val;
            }

            console.log(`    DEBUG: Card Sheet '${sheetName}' keys found:`, Object.keys(recipeObj).join(', '));
            console.log(`    DEBUG: Card Sheet '${sheetName}' URL raw:`, recipeObj['URL']);
            console.log(`    DEBUG: Card Sheet '${sheetName}' Ingredients raw len:`, (recipeObj['材料'] || '').length);

            // Map keys
            const mappedRow = {
                title: recipeObj['レシピ名'],
                description: recipeObj['レベル'] || recipeObj['食感と味わい'] || '',
                servings: recipeObj['分量'] || recipeObj['型サイズ'] || '', // Fallback to pan size if yield not present
                ingredients: recipeObj['材料'],
                steps: recipeObj['詳細な作り方'],
                url: recipeObj['URL'],
                source: recipeObj['出典'],
                category: recipeObj['レベル'] // Use Level as category tag
            };

            // Combine extra info into description
            let extraDesc = [];
            if (recipeObj['プロの技術ポイント']) extraDesc.push(`【プロの技術ポイント】\n${recipeObj['プロの技術ポイント']}`);
            if (recipeObj['チョコレート選び']) extraDesc.push(`【チョコレート選び】\n${recipeObj['チョコレート選び']}`);
            if (recipeObj['保存方法']) extraDesc.push(`【保存方法】\n${recipeObj['保存方法']}`);

            if (extraDesc.length > 0) {
                mappedRow.description = mappedRow.description
                    ? `${mappedRow.description}\n\n${extraDesc.join('\n\n')}`
                    : extraDesc.join('\n\n');
            }

            try {
                await processRecipe(mappedRow, filePath);
            } catch (e) {
                console.error(`  Error processing card sheet ${sheetName}:`, e);
            }

        } else {
            // Assume List Format (Standard)
            // Re-read as objects for easier column mapping if it is a list
            const records = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            if (records.length > 0) {
                console.log(`  Sheet '${sheetName}' detected as List (${records.length} rows).`);
                for (const row of records) {
                    try {
                        await processRecipe(row, filePath);
                    } catch (e) {
                        console.error(`  Error processing row in ${sheetName}:`, e);
                    }
                }
            }
        }
    }
}

async function processRecipe(row, sourceFile) {
    // Normalize keys to lower case for easier matching
    const keys = Object.keys(row).reduce((acc, k) => {
        acc[k.toLowerCase().replace(/\s+/g, '_')] = k; // e.g. "Source URL" -> "source_url"
        return acc;
    }, {});

    const getVal = (keyPart) => {
        // Find a key that contains the keyPart
        const key = Object.keys(keys).find(k => k.includes(keyPart));
        return key ? row[keys[key]] : '';
    };

    const title = getVal('title') || getVal('name') || getVal('レシピ名');
    if (!title) {
        // If no title, skip
        return;
    }

    console.log(`  Importing: ${title}`);

    // Fields
    const course = getVal('course') || '';
    const category = getVal('category') || getVal('category_') || '';
    let description = getVal('description') || getVal('desc') || '';

    // URL Support - Explicitly look for 'url' or 'source'
    const sourceUrl = getVal('url') || getVal('link') || getVal('source') || '';
    console.log(`    DEBUG: sourceUrl resolved:`, sourceUrl);

    // Servings
    const servingsRaw = getVal('yield') || getVal('servings') || getVal('分量') || '2';
    const servingsStr = String(servingsRaw);
    const servings = parseInt(servingsStr.match(/(\d+)/)?.[1] || '2', 10);

    const prepTime = getVal('prep_time') || '';
    const cookTime = getVal('cook_time') || '';

    // Append URL to description since 'source_url' column might not exist
    if (sourceUrl) {
        description = description ? `${description}\n\nSource: ${sourceUrl}` : `Source: ${sourceUrl}`;
    }

    // Ingredients
    const ingredientsRaw = getVal('ingredients') || getVal('材料') || '';
    const ingredients = String(ingredientsRaw).split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(parseIngredient);

    // Steps
    const stepsRaw = getVal('directions') || getVal('steps') || getVal('手順') || getVal('作り方') || '';
    const steps = String(stepsRaw).split('\n')
        .map(line => line.trim().replace(/^\d+\.\s*/, ''))
        .filter(Boolean);

    // DB Upsert Record
    const dbRecord = {
        title,
        description,
        servings,
        prep_time: prepTime,
        cook_time: cookTime,
        ingredients,
        steps,
        tags: [course, category].filter(Boolean),
        course,
        category
        // source_url removed to avoid DB error
    };

    // Check exist
    const { data: existing } = await supabase
        .from('recipes')
        .select('id')
        .eq('title', title)
        .single();

    if (existing) {
        // Update
        const updatePayload = { ...dbRecord };
        delete updatePayload.title;

        const { error } = await supabase
            .from('recipes')
            .update(updatePayload)
            .eq('id', existing.id);

        if (error) console.error(`    Update failed: ${error.message}`);
        else console.log(`    Updated: ${title}`);
    } else {
        // Insert
        const { error } = await supabase.from('recipes').insert([dbRecord]);
        if (error) console.error(`    Insert failed: ${error.message}`);
        else console.log(`    Inserted: ${title}`);
    }
}

async function main() {
    console.log('Starting Excel Import...');
    const targetPath = path.join(PROJECT_ROOT, TARGET_FILENAME);
    await processFile(targetPath);
    console.log('Done.');
}

main().catch(console.error);
