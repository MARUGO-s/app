import { supabase } from '../src/supabase.js';

async function runDiagnosis() {
    console.log('Skipping listBuckets check (user confirmed bucket exists).');

    // Try upload directly
    console.log('Attempting dummy upload to "recipe-images"...');
    const fileName = 'test_diag_' + Date.now() + '.txt';
    const { data, error } = await supabase.storage
        .from('recipe-images')
        .upload(fileName, 'test content', {
            contentType: 'text/plain',
            upsert: true
        });

    if (error) {
        console.error('Upload failed:', JSON.stringify(error, null, 2));
    } else {
        console.log('Upload success:', data);
        console.log('Cleaning up...');
        const { error: removeError } = await supabase.storage
            .from('recipe-images')
            .remove([fileName]);

        if (removeError) {
            console.error('Cleanup failed:', removeError);
        } else {
            console.log('Cleanup done.');
        }
    }
}

runDiagnosis();
