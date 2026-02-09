
import fs from 'fs';
import path from 'path';

// Default locations for local sample artifacts (gitignored).
const RECIPES_FILE = process.argv[2] || 'samples/json/recipes.json';
const OUTPUT_FILE = process.argv[3] || 'samples/json/recipes_converted.json';

// Density Map (g/ml per Tbsp/15ml)
// Default liquid: 15g (1g/ml)
const DENSITIES = {
    // Oils (12g/15ml = 0.8g/ml)
    'オリーブオイル': 12,
    'サラダ油': 12,
    'ごま油': 12,

    // Heavy Liquids (18g/15ml = 1.2g/ml)
    '醤油': 18,

    // Sweeteners
    'はちみつ': 22, // ~1.5g/ml
    '砂糖': 9,      // Granulated sugar is light

    // Pastes
    'マヨネーズ': 12,
    'ケチャップ': 15,
    'ディジョンマスタード': 15,
    '粒マスタード': 15,
    'サワークリーム': 15,
    'みそ': 18,
    'アンチョビペースト': 15,

    // Solids
    '塩': 18,
    '白すりごま': 9,
    'ごま（白・黑）': 9,
    'パルメザンチーズ（すりおろし）': 6, // Grated cheese is light
    '黑こしょう': 6,
    '塩・こしょう': 18, // Treat as salt
    'パプリカパウダー': 6,
    'にんにくパウダー': 6,

    // Vegetables (Grated/Minced ~ Water density)
    '玉ねぎ（すりおろし）': 15,
    '玉ねぎ（みじん切り）': 15,
    'にんにく（すりおろし）': 15,
    'しょうが（すりおろし）': 15,
    'パセリ（みじん切り）': 3, // Herbs are very light
    'ディル（みじん切り）': 3,
    'ピクルス（みじん切り）': 15,
    'レモンの皮（すりおろし）': 6,
};

// Standard Volumes (ml)
const VOLUMES = {
    '大さじ': 15,
    '小さじ': 5,
    'カップ': 200,
    'cc': 1,
    'ml': 1,
};

function convertQuantity(name, quantity) {
    if (!quantity) return { quantity: '', unit: '' };

    // Check for "少々" (Pinch)
    if (quantity.includes('少々')) return { quantity: quantity, unit: '' };

    // Parse ranges like "大さじ1〜2"
    const rangeMatch = quantity.match(/(\d+(?:\.\d+)?)〜(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
        // Simplifying for now: take average or format as range?
        // Let's format as range string for display, but we need unit.
        // Hard to return strict struct if it's a range string. 
        // Let's try to convert the unit part and keep the numbers.
    }

    // Detect Unit
    let unitKey = null;
    let numVal = 0;

    for (const key of Object.keys(VOLUMES)) {
        if (quantity.includes(key)) {
            unitKey = key;
            // Extract number: "大さじ3" -> 3
            // Handle "1/2" fractions
            let numStr = quantity.replace(key, '').trim();

            if (numStr.includes('〜')) {
                // Range detected with unit
                // "大さじ1〜2"
                const parts = numStr.split('〜');
                const v1 = evalFraction(parts[0]);
                const v2 = evalFraction(parts[1]);

                const c1 = calculateMetric(name, unitKey, v1);
                const c2 = calculateMetric(name, unitKey, v2);

                if (c1.unit === c2.unit) {
                    return { quantity: `${c1.value}〜${c2.value}`, unit: c1.unit };
                }
            }

            numVal = evalFraction(numStr);
            break;
        }
    }

    if (unitKey) {
        const res = calculateMetric(name, unitKey, numVal);
        return { quantity: String(res.value), unit: res.unit };
    }

    // Fallback
    return { quantity, unit: '' };
}

function evalFraction(str) {
    if (!str) return 0;
    if (str.includes('/')) {
        const [n, d] = str.split('/');
        return parseFloat(n) / parseFloat(d);
    }
    return parseFloat(str);
}

function calculateMetric(name, unitKey, amount) {
    const volMl = VOLUMES[unitKey] * amount;

    // Determine if we convert to 'g' (weight) or 'ml' (volume)
    // Generally prefer 'g' for solids/pastes/oils, 'ml' for water/vinegar/milk?
    // User asked for "g or ml".
    // Pro kitchens use weight (g) for almost everything except maybe water/milk.
    // Let's check density map.

    const density = DENSITIES[name];

    if (density !== undefined) {
        // Known density -> convert to g
        // Density is per 15ml (Tbsp)
        // g = (volMl / 15) * density
        const grams = (volMl / 15) * density;
        return { value: Math.round(grams * 10) / 10, unit: 'g' };
    }

    // Unknown density.
    // Liquids -> ml
    // Solids -> unknown?
    // Check keywords
    if (name.includes('汁') || name.includes('ビネガー') || name.includes('酢') || name.includes('水') || name.includes('牛乳') || name.includes('酒')) {
        return { value: Math.round(volMl), unit: 'ml' };
    }

    // Default to g (assuming density ~1 for unknown pastes/solids or mixed)
    // "15g (1g/ml)" default logic
    const grams = volMl;
    return { value: Math.round(grams), unit: 'g' };
}

function main() {
    const raw = fs.readFileSync(RECIPES_FILE, 'utf8');
    const recipes = JSON.parse(raw);

    const converted = recipes.map(r => {
        const newIng = r.ingredients.map(i => {
            const { quantity, unit } = convertQuantity(i.name, i.quantity);
            // If unit is empty, maybe quantity holds the string "少々"?
            // Or if original had no unit?

            // Reconstruct logic: 
            // Original: name="塩", quantity="少々", unit=""
            // Converted: quantity="少々", unit=""

            // Original: name="オリーブオイル", quantity="大さじ3", unit=""
            // Converted: quantity="36", unit="g"

            return {
                ...i,
                quantity: quantity,
                unit: unit || i.unit
            };
        });

        return { ...r, ingredients: newIng };
    });

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(converted, null, 2));
    console.log(`Converted ${converted.length} recipes.`);
}

main();
