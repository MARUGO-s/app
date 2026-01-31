
const SUPABASE_URL = 'https://hocbnifuactbvmyjraxy.supabase.co';
// Using the key found in src/supabase.js
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvY2JuaWZ1YWN0YnZteWpyYXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzQ2OTgsImV4cCI6MjA4Mjk1MDY5OH0.q33wfcASsQf0Fec3S6fa5CVG2KC9m5Q912Szu7KIyN0';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/scrape-recipe`;

async function main() {
    console.log('Testing Edge Function:', FUNCTION_URL);
    const urlToScrape = 'https://www.thespruceeats.com/basque-cake-recipe-3083191';

    try {
        console.log('Sending request...');
        const res = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: urlToScrape })
        });

        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body:', text.slice(0, 1000)); // Truncate if too long

    } catch (e) {
        console.error('Fetch error:', e);
    }
}

main();
