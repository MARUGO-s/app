import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env manually
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

const IMAGE_PATH = '/Users/yoshito/.gemini/antigravity/brain/717a3f38-3ed8-4d17-8a54-0047a1b11cf8/uploaded_image_1768373544605.jpg';

const runUpdate = async () => {
    const isCommit = process.argv.includes('--commit');
    console.log(`Starting bulk image update in ${isCommit ? 'COMMIT' : 'DRY RUN'} mode...`);

    // 1. Upload Image (Only in commit mode or if we check properly, but for dry run we can skip or mock URL)
    let publicUrl = 'DRY_RUN_URL';

    if (isCommit) {
        console.log('Uploading image...');
        if (!fs.existsSync(IMAGE_PATH)) {
            console.error(`Image file not found at: ${IMAGE_PATH}`);
            return;
        }

        const fileContent = fs.readFileSync(IMAGE_PATH);
        const fileName = `sauce_default_${Date.now()}.jpg`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('recipe-images')
            .upload(fileName, fileContent, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (uploadError) {
            console.error('Image upload failed:', uploadError);
            return;
        }

        const { data: urlData } = supabase.storage
            .from('recipe-images')
            .getPublicUrl(fileName);

        publicUrl = urlData.publicUrl;
        console.log(`Image uploaded to: ${publicUrl}`);
    }

    // 2. Fetch target recipes
    // We need to fetch all and filter in JS because Supabase filter for text array containment OR text match might be tricky in one go via simple client, 
    // or we can use .or() syntax.
    // .or('category.eq.ソース,tags.cs.{ソース}') // cs = contains (set/array)
    // Note: tags is likely JSONB or Array type. If JSONB, we use .contains. If Array, .cs.
    // Let's assume tags is text[] or jsonb.
    // Let's fetch matching logic: 

    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*');

    if (error) {
        console.error('Error fetching recipes:', error);
        return;
    }

    const TARGET_KEYWORD = 'ソース';

    const targets = recipes.filter(r => {
        const catMatch = r.category && r.category.trim() === TARGET_KEYWORD;
        const tagMatch = Array.isArray(r.tags) && r.tags.includes(TARGET_KEYWORD);
        return catMatch || tagMatch;
    });

    console.log(`Found ${targets.length} matching recipes.`);

    for (const recipe of targets) {
        console.log(`[Target] ${recipe.title} (ID: ${recipe.id})`);
        console.log(`  Current Image: ${recipe.image}`);
        console.log(`  New Image:     ${publicUrl}`);

        if (isCommit) {
            const { error: updateError } = await supabase
                .from('recipes')
                .update({ image: publicUrl })
                .eq('id', recipe.id);

            if (updateError) {
                console.error(`  FAILED to update: ${updateError.message}`);
            } else {
                console.log(`  Updated.`);
            }
        }
    }

    console.log('Done.');
};

runUpdate();
