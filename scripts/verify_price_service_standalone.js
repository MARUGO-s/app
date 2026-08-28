import 'dotenv/config'; // Loads .env into process.env
import { purchasePriceService } from '../src/services/purchasePriceService.js';

async function run() {
    console.log('--- Verification: purchasePriceService ---');
    console.log('Fetching price list...');

    try {
        const fileList = await purchasePriceService.getFileList();
        console.log('CSV Files found in storage:', fileList.map(f => f.name));

        if (fileList.length === 0) {
            console.warn('No CSV files found. Cannot verify price fetching.');
            return;
        }

        const priceList = await purchasePriceService.getPriceListArray();
        console.log(`Total ingredients loaded: ${priceList.length}`);

        if (priceList.length > 0) {
            console.log('Sample ingredients:');
            priceList.slice(0, 5).forEach(item => {
                console.log(`  - ${item.name}: ¥${item.price} / ${item.unit} (${item.vendor})`);
            });

            // Test specific getPrice
            const sample = priceList[0];
            console.log(`\nTesting getPrice('${sample.name}')...`);
            const fetched = await purchasePriceService.getPrice(sample.name);

            if (fetched && fetched.price === sample.price) {
                console.log('✅ getPrice returned correct data:', fetched);
            } else {
                console.error('❌ getPrice returned mismatch or null:', fetched);
            }

        } else {
            console.log('Price list is empty.');
        }

    } catch (err) {
        console.error('Verification failed:', err);
    }
}

run();
