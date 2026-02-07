
import { supabase } from '../src/supabase.js';

async function diagnose() {
    console.log("=== DIAGNOSTIC START ===");

    // 1. Fetch Master Owner Tags (The "Allow List")
    const { data: masterTags, error: tagError } = await supabase.rpc('get_master_recipe_owner_tags');
    if (tagError) {
        console.error("RPC Error (get_master_recipe_owner_tags):", tagError);
        return;
    }
    const masterSet = new Set(masterTags);
    console.log("Master Owner Tags (RPC Result):", masterTags);

    // 2. Fetch User Profiles to check 'show_master_recipes' status
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_id, role, show_master_recipes');

    if (profileError) {
        console.error("Profile Fetch Error:", profileError);
    } else {
        console.log("\n--- User Profiles ---");
        profiles.forEach(p => {
            console.log(`[${p.display_id || p.id}] Role: ${p.role}, Show Master: ${p.show_master_recipes}`);
        });
    }

    // 3. Fetch All Recipes and Check Visibility Logic
    const { data: recipes, error: recipeError } = await supabase
        .from('recipes')
        .select('id, title, tags, created_at, store_name')
        .order('created_at', { ascending: false });

    if (recipeError) {
        console.error("Recipe Fetch Error:", recipeError);
    } else {
        console.log("\n--- Recipes Analysis ---");
        console.log(`Total Recipes Found: ${recipes.length}`);

        let masterRecipeCount = 0;
        let hiddenRecipes = [];

        recipes.forEach(r => {
            const tags = Array.isArray(r.tags) ? r.tags : (r.tags ? String(r.tags).split(',') : []);
            const ownerTags = tags.filter(t => t && t.startsWith('owner:'));

            // Logic Check
            const isMaster = ownerTags.some(t => masterSet.has(t));
            const hasOwner = ownerTags.length > 0;
            const isPublic = tags.includes('public');

            // "Visibility Status" for a generic user with show_master_recipes = TRUE
            // accessible if (isMaster) OR (isOwner) OR (isPublic)
            // We are simulating "User X with showMaster=TRUE checking availability"

            let status = "";
            if (isMaster) {
                status = "[MASTER]";
                masterRecipeCount++;
            } else if (isPublic) {
                status = "[PUBLIC]";
            } else if (hasOwner) {
                status = "[PRIVATE] (Owner only)";
                hiddenRecipes.push(r);
            } else {
                status = "[LEGACY/SHARED] (No owner tag)";
            }

            // Only log Master recipes or potentially problematic ones
            if (isMaster || status.includes("PRIVATE")) {
                console.log(`- ${status} ${r.title} (ID: ${r.id}) Tags: [${tags.join(', ')}]`);
            }
        });

        console.log(`\nSummary: ${masterRecipeCount} recipes confirm as 'Master' (visible to users with permission).`);
        console.log(`Users with 'show_master_recipes: true' should see exactly these ${masterRecipeCount} recipes + their own + public.`);
    }

    console.log("=== DIAGNOSTIC END ===");
    process.exit(0);
}

diagnose();
