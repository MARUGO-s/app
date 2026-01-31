
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyStorage() {
    console.log('Verifying "app-data" bucket access...');

    // 1. Check bucket existence (Public method or just try to list)
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();

    if (bucketError) {
        console.error('Error listing buckets:', bucketError);
        // Sometimes listBuckets is restricted. We can try to list files directly.
    } else {
        const appDataBucket = buckets.find(b => b.name === 'app-data');
        if (!appDataBucket) {
            console.error('Bucket "app-data" NOT found in bucket list.');
            // Proceed anyway to see if we can access it (maybe hidden/private?)
        } else {
            console.log('Bucket "app-data" found.');
        }
    }

    // 2. List files
    console.log('Listing files in "app-data"...');
    const { data: files, error: listError } = await supabase.storage
        .from('app-data')
        .list();

    if (listError) {
        console.error('Error listing files in "app-data":', listError);
        return;
    }

    console.log(`Found ${files.length} files.`);

    // 3. Upload test file if empty
    if (files.length === 0) {
        console.log('Bucket is empty. Uploading test CSV...');
        const testCsvContent = 'Material,Price,Unit,Vendor\nTestFlour,150,1kg,TestVendor';
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('app-data')
            .upload('test_prices.csv', testCsvContent, {
                contentType: 'text/csv',
                upsert: true
            });

        if (uploadError) {
            console.error('Error uploading test file:', uploadError);
            console.log('Ensure the bucket "app-data" is set to PUBLIC or has proper RLS policies for upload.');
            return;
        }
        console.log('Test file uploaded successfully.');
    } else {
        console.log('Existing files found, skipping upload.');
    }

    // 4. Download and Verify
    const targetFile = files.length > 0 ? files[0].name : 'test_prices.csv';
    console.log(`Attempting to download ${targetFile}...`);

    const { data: downloadData, error: downloadError } = await supabase.storage
        .from('app-data')
        .download(targetFile);

    if (downloadError) {
        console.error('Error downloading file:', downloadError);
        return;
    }

    const buffer = await downloadData.arrayBuffer();
    const decoder = new TextDecoder('shift-jis'); // Using shift-jis as per app default
    const text = decoder.decode(buffer);

    console.log('--- File Content Preview ---');
    console.log(text.slice(0, 200));
    console.log('----------------------------');
    console.log('VERIFICATION SUCCESSFUL: Storage is accessible and readable.');
}

verifyStorage().catch(err => console.error('Unexpected error:', err));
