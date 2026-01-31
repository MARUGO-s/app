import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hocbnifuactbvmyjraxy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CmEv4H4dXwtqm65i_jpsCQ_8BtDOucx';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    console.log("Checking for 'course' and 'category' columns...");

    // Attempt to select the specific columns
    const { data, error } = await supabase
        .from('recipes')
        .select('id, title, course, category')
        .limit(1);

    if (error) {
        console.error("Error accessing columns:", error.message);
        console.log("DETAILS: The columns 'course' or 'category' likely do not exist.");
    } else {
        console.log("Success! Columns exist.");
        console.log("Sample Data:", data);
    }
}

check();
