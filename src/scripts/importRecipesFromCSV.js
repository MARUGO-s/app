
import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Configuration
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hocbnifuactbvmyjraxy.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Default CSV files to look for
const TARGET_FILES = ['recipe.csv', 'Tuiles.csv', 'test_recipe.csv', 'test_recipe.xlsx', 'recipe1.xlsx'];

function parseIngredient(text) {
    if (!text) return { name: '', quantity: '', unit: '' };
    text = String(text).trim(); // Ensure string

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

    // Check existence first
    try {
        await fs.access(filePath);
    } catch {
        // try adding xlsx extension if original failed
        const xlsxPath = filePath.replace(/\.csv$/i, '.xlsx');
        if (xlsxPath !== filePath) {
            try {
                await fs.access(xlsxPath);
                filePath = xlsxPath;
                console.log(`  Found alternative: ${filePath}`);
            } catch {
                console.log(`  Skipping (not found): ${filePath} (checked csv and xlsx)`);
                return;
            }
        } else {
            console.log(`  Skipping (not found): ${filePath}`);
            return;
        }
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.xlsx' || ext === '.xls') {
        // Handle Excel
        console.log(`  Reading Excel file...`);
        const fileBuffer = await fs.readFile(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            if (rawData.length === 0) continue;

            // Detect Format: List vs Card
            // Card format usually has keys in first column: "レシピ名", "材料" etc.
            // List format has headers in first row: "Title", "Ingredients" etc.

            const firstCell = String(rawData[0][0] || '').trim();
            const keysCol = rawData.map(r => String(r[0] || '').trim());
            const hasRecipeNameKey = keysCol.includes('レシピ名');
            const hasIngredientsKey = keysCol.includes('材料');

            if (hasRecipeNameKey && hasIngredientsKey) {
                // It's a Recipe Card
                console.log(`  Sheet '${sheetName}' detected as Recipe Card.`);
                await processRecipeCard(rawData, filePath);
            } else {
                // Assume List
                const records = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                if (records.length > 0) {
                    // Check if it's a summary sheet effectively empty of real data (like just links)
                    // If it has 'レシピ名' header but no ingredients column, skip? 
                    // Actually let's try to process it, processRecipe will skip if missing title
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

    } else {
        // Handle CSV
        let content = await fs.readFile(filePath, 'utf-8');
        const records = parse(content, {
            columns: true,
            skip_empty_lines: true,
            bom: true,
            trim: true
        });
        console.log(`  Found ${records.length} records in CSV.`);
        for (const row of records) {
            try {
                await processRecipe(row, filePath);
            } catch (e) {
                console.error(`  Error processing row:`, e);
            }
        }
    }
}

async function processRecipeCard(rows, sourceFile) {
    // Convert KV rows to object
    // Assuming Col 0 is Key, Col 1 is Value
    const record = {};
    for (const row of rows) {
        if (row.length < 2) continue;
        const key = String(row[0]).trim();
        const val = String(row[1] || '').trim();
        if (key) record[key] = val;
    }

    // Map Japanese Keys to internal keys
    const mapped = {
        title: record['レシピ名'],
        description: record['レベル'] || record['用途'] || '', // Combine?
        category: record['用途'] || '',
        servings: record['分量'],
        ingredients: record['材料'],
        steps: record['詳細な作り方'], // "Detailed Directions"
        source_url: record['URL'] || '',
        source: record['出典']
    };

    // If description/category info is spread, verify
    if (record['レベル']) mapped.tags = [record['レベル']];
    if (record['用途']) mapped.tags = (mapped.tags || []).concat(record['用途']);

    await processRecipe(mapped, sourceFile);
}

async function processRecipe(row, sourceFile) {
    // Normalize keys to lower case for easier matching
    const keys = Object.keys(row).reduce((acc, k) => {
        acc[k.toLowerCase().replace(/\s+/g, '_')] = k;
        return acc;
    }, {});

    const getVal = (keyPart) => {
        const key = Object.keys(keys).find(k => k.includes(keyPart));
        return key ? row[keys[key]] : '';
    };

    const title = getVal('title') || getVal('name'); // fallback
    if (!title) {
        console.warn('  Skipping row with no title');
        return;
    }

    console.log(`  Importing: ${title}`);

    // Fields
    const course = getVal('course') || '';
    const category = getVal('category') || '';
    const description = getVal('description') || course;

    // Servings: handle logic to ensure string before match
    const servingsRaw = getVal('yield') || getVal('servings') || '2';
    const servingsStr = String(servingsRaw);
    const servings = parseInt(servingsStr.match(/(\d+)/)?.[1] || '2', 10);

    const prepTime = getVal('prep_time') || '';
    const cookTime = getVal('cook_time') || '';

    // Ingredients (often newline separated in CSV/Excel)
    const ingredientsRaw = getVal('ingredients') || '';
    const ingredients = String(ingredientsRaw).split('\n') // Ensure string
        .map(line => line.trim())
        .filter(Boolean)
        .map(parseIngredient);

    // Steps
    const stepsRaw = getVal('directions') || getVal('steps') || '';
    const steps = String(stepsRaw).split('\n')
        .map(line => line.trim().replace(/^\d+\.\s*/, ''))
        .filter(Boolean);

    // Image
    const imageFile = getVal('photo') || getVal('image');
    let publicUrl = null;

    if (imageFile) {
        // Assume image is relative to CSV or in 'images' folder or absolute?
        // Check local existence. 
        // 1. Same dir as CSV
        // 2. 'images' subdir
        // 3. '1' subdir (legacy)

        const fileDir = path.dirname(sourceFile);
        const candidates = [
            imageFile,
            path.join(fileDir, imageFile),
            path.join(fileDir, 'images', imageFile),
            path.join(PROJECT_ROOT, '1', imageFile)
        ];

        let foundPath = null;
        for (const p of candidates) {
            try {
                await fs.access(p);
                foundPath = p;
                break;
            } catch { }
        }

        if (foundPath) {
            const fileName = path.basename(foundPath);
            const ext = path.extname(fileName).toLowerCase().slice(1);
            const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

            try {
                const fileData = await fs.readFile(foundPath);
                const { data, error } = await supabase.storage
                    .from('recipe-images')
                    .upload(fileName, fileData, { contentType, upsert: false });

                if (error && (error.message.includes('Duplicate') || error.message.includes('already exists'))) {
                    // Get public URL
                    const { data: { publicUrl: pub } } = supabase.storage
                        .from('recipe-images')
                        .getPublicUrl(fileName);
                    publicUrl = pub;
                } else if (!error) {
                    const { data: { publicUrl: pub } } = supabase.storage
                        .from('recipe-images')
                        .getPublicUrl(fileName);
                    publicUrl = pub;
                }
            } catch (e) {
                console.warn(`    Failed to upload image ${foundPath}: ${e.message}`);
            }
        }
    }

    // DB Upsert
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
        category,
        image: publicUrl
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
        delete updatePayload.title; // don't update key
        if (!publicUrl) delete updatePayload.image; // look don't overwrite image if we fail to upload new one?

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
    console.log('Starting Data Import...');
    for (const file of TARGET_FILES) {
        const p = path.join(PROJECT_ROOT, file);
        await processFile(p);
    }
    console.log('Done.');
}

main().catch(console.error);
