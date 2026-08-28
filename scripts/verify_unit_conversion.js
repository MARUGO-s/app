import { unitConversionService } from '../src/services/unitConversionService.js';

async function verify() {
    console.log('--- Starting Unit Conversion Verification ---');

    const testIngredient = 'Test Flour ' + Date.now();
    const packetSize = 25;
    const packetUnit = 'kg';
    const price = 5000;

    // 1. Save
    console.log(`1. Saving conversion for "${testIngredient}"...`);
    try {
        const saved = await unitConversionService.saveConversion(testIngredient, packetSize, packetUnit, price);
        console.log('   Saved:', saved);
        if (saved.ingredientName !== testIngredient || saved.packetSize !== packetSize) {
            throw new Error('Save result mismatch');
        }
    } catch (err) {
        console.error('   FAILED to save:', err);
        return;
    }

    // 2. Get Single
    console.log(`2. Fetching conversion for "${testIngredient}"...`);
    try {
        const fetched = await unitConversionService.getConversion(testIngredient);
        console.log('   Fetched:', fetched);
        if (!fetched || fetched.packetSize !== packetSize) {
            throw new Error('Fetch result mismatch');
        }
    } catch (err) {
        console.error('   FAILED to fetch:', err);
        return;
    }

    // 3. Get All
    console.log(`3. Fetching ALL conversions...`);
    try {
        const map = await unitConversionService.getAllConversions();
        console.log(`   Fetched ${map.size} conversions.`);
        if (!map.has(testIngredient)) {
            throw new Error('Newly saved ingredient not found in getAll map');
        }
        const fromMap = map.get(testIngredient);
        if (fromMap.packetSize !== packetSize) {
            throw new Error('Map data mismatch');
        }
        console.log('   Verification Successful!');
    } catch (err) {
        console.error('   FAILED in getAll:', err);
        return;
    } // No explicit cleanup since we want to persist for manual testing potentially, but maybe better to clean up?
    // Let's leave it for now.
}

verify();
