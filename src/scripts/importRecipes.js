import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

// Resolve current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// Configuration
const HTML_FILE = path.join(PROJECT_ROOT, '1/recipes.html');
const BASE_IMG_DIR = path.join(PROJECT_ROOT, '1');
// Hardcoded creds from src/supabase.js
const SUPABASE_URL = 'https://hocbnifuactbvmyjraxy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseIngredient(text) {
    text = text.trim();
    // Regex to separate Name from Amount+Unit
    // Strategy: Look for the last chunk of whitespace, everything after is amount/unit?
    // Ex: "Sugar 100g" -> Name: Sugar, Qty: 100g.
    // Ex: "Salt" -> Name: Salt
    // Ex: "Olive Oil 1 tbsp" -> Name: Olive Oil, Qty: 1 tbsp

    // Attempt: Split by at least 2 spaces (often used in formatting)
    const parts = text.split(/\s{2,}/);
    if (parts.length >= 2) {
        const name = parts[0];
        const rest = parts[parts.length - 1]; // Assume last part is amount
        // improved: name is everything except last part
        // Actually Recipe Keeper export often formats with lots of spaces or tabs.
        return { name: name, quantity: rest, unit: '' };
    }

    // Fallback: split by last single space if it looks like a number
    const lastSpace = text.lastIndexOf(' ');
    if (lastSpace > 0) {
        const name = text.substring(0, lastSpace);
        const rest = text.substring(lastSpace + 1);
        // Check if rest starts with number
        if (/^[\d./]/.test(rest)) {
            return { name: name, quantity: rest, unit: '' };
        }
    }

    return { name: text, quantity: '', unit: '' };
}

async function main() {
    console.log('Reading HTML file...');
    let html;
    try {
        html = await fs.readFile(HTML_FILE, 'utf-8');
    } catch (e) {
        console.error(`Failed to read file at ${HTML_FILE}`);
        console.error(e);
        process.exit(1);
    }

    const $ = cheerio.load(html);
    const recipes = [];

    $('.recipe-details').each((i, el) => {
        const $el = $(el);
        const title = $el.find('h2[itemprop="name"]').text().trim();
        if (!title) return;

        const course = $el.find('span[itemprop="recipeCourse"]').text().trim();
        const categoryMeta = $el.find('meta[itemprop="recipeCategory"]').attr('content');
        const category = categoryMeta || '';

        const servingsText = $el.find('span[itemprop="recipeYield"]').text().trim();
        // extract number from servings if possible
        let servings = 2;
        const servMatch = servingsText.match(/(\d+)/);
        if (servMatch) servings = parseInt(servMatch[1], 10);

        // Prep/Cook time (often empty in export but let's try)
        // Looking for structure div > span + meta?
        // HTML: <div>準備時間: <span></span><meta...></div>

        // Ingredients
        const ingredients = [];
        $el.find('.recipe-ingredients p').each((j, p) => {
            const txt = $(p).text();
            if (txt.trim()) {
                ingredients.push(parseIngredient(txt));
            }
        });

        // Steps
        const steps = [];
        $el.find('div[itemprop="recipeDirections"] p').each((j, p) => {
            const txt = $(p).text().trim();
            // Remove numbering "1." at start if present
            const cleanTxt = txt.replace(/^\d+\.\s*/, '');
            if (cleanTxt) steps.push(cleanTxt);
        });

        // Image
        // <img src="images/..." class="recipe-photo"/>
        const imgSrc = $el.find('img.recipe-photo').attr('src');
        let imagePath = null;
        if (imgSrc) {
            // imgSrc is like images/uuid.jpg
            // decodeURI in case of spaces? usually not in uuid.
            imagePath = path.join(BASE_IMG_DIR, imgSrc);
        }

        recipes.push({
            title,
            description: course, // Use course as description fallback
            servings,
            ingredients,
            steps,
            tags: [course, category].filter(Boolean),
            imagePath
        });
    });

    console.log(`Found ${recipes.length} recipes. Starting import...`);

    for (const recipe of recipes) {
        console.log(`Importing: ${recipe.title}`);

        let publicUrl = null;
        if (recipe.imagePath) {
            try {
                // Check file exists
                await fs.access(recipe.imagePath);

                const fileData = await fs.readFile(recipe.imagePath);
                const fileName = path.basename(recipe.imagePath);
                const ext = path.extname(fileName).toLowerCase().slice(1);
                const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

                // Upload
                const { data, error } = await supabase.storage
                    .from('recipe-images')
                    .upload(fileName, fileData, { contentType, upsert: false });

                if (error) {
                    // Ignore duplicate error
                    if (error.message.includes('Duplicate') || error.message.includes('The resource already exists')) {
                        // Get URL anyway
                        const { data: { publicUrl: pub } } = supabase.storage
                            .from('recipe-images')
                            .getPublicUrl(fileName);
                        publicUrl = pub;
                    } else {
                        console.error(`  Upload error for ${fileName}:`, error.message);
                    }
                } else {
                    const { data: { publicUrl: pub } } = supabase.storage
                        .from('recipe-images')
                        .getPublicUrl(fileName);
                    publicUrl = pub;
                }
            } catch (e) {
                console.warn(`  Image skipped (${recipe.imagePath}):`, e.message);
            }
        }

        // Check if recipe exists to avoid duplicates or update image
        const { data: existing } = await supabase
            .from('recipes')
            .select('id')
            .eq('title', recipe.title)
            .single();

        if (existing) {
            // Update image if we have one, AND update metadata (course/category) to migrate legacy data
            const updatePayload = {
                course: recipe.tags[0] || null, // First tag is usually course in this export
                category: recipe.tags[1] || null   // Second is category
            };

            if (publicUrl) {
                updatePayload.image = publicUrl;
            }

            const { error } = await supabase
                .from('recipes')
                .update(updatePayload)
                .eq('id', existing.id);

            if (error) console.error(`  Update failed for ${recipe.title}:`, error.message);
            else console.log(`  Updated metadata/image for ${recipe.title}`);
        } else {
            // Prepare DB Object
            const dbRecord = {
                title: recipe.title,
                description: recipe.description || '',
                servings: recipe.servings,
                prep_time: '',
                cook_time: '',
                ingredients: recipe.ingredients,
                steps: recipe.steps,
                tags: recipe.tags, // Keep tags for backward compat if needed, or clear them? Keeping for now.
                course: recipe.tags[0] || null,
                category: recipe.tags[1] || null,
                image: publicUrl
            };

            const { error } = await supabase.from('recipes').insert([dbRecord]);
            if (error) {
                console.error(`  Insert failed: ${error.message}`);
            } else {
                console.log(`  Inserted: ${recipe.title}`);
            }
        }
    }
}

main().catch(console.error);
