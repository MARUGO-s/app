
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: resolve(__dirname, '../.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function verify() {
    console.log('Verifying recipe_sources table...')

    // Try to insert a dummy row or just select. 
    // Since we have a unique constraint on (recipe_id, url) and recipe_id references recipes, 
    // an empty select is safer. If table assumes error, it will fail.

    const { data, error } = await supabase
        .from('recipe_sources')
        .select('*')
        .limit(1)

    if (error) {
        if (error.code === '42P01') { // undefined_table
            console.error('❌ Table recipe_sources does NOT exist.')
            console.error('Migration might not have been applied.')
        } else {
            console.error('❌ Error accessing table:', error.message)
        }
    } else {
        console.log('✅ Table recipe_sources exists and is accessible.')
        console.log('Current rows:', data.length)
    }
}

verify()
