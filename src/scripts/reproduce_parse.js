
const lines = [
    "レシピの粉",
    "強力粉",
    "450 g ( 75 %)",
    "薄力粉",
    "150 g ( 25 %)",
    "粉の合計",
    "600 g ( 100 %)",
    "レシピの材料",
    "水",
    "240 g ( 40 %)"
];

const ingKeywords = ['材料', 'Ingredients', '用意するもの', '買い物リスト'];
const stepKeywords = ['作り方', 'つくり方', '手順', 'Directions', 'Method', 'Steps', 'How to cook'];
const excludeKeywords = ['保存方法', '使いみち', 'ポイント', 'advice', 'memo'];

const ingredientPattern = /(\d+|g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円)/i;
const stepNumberPattern = /^(\d+[\.\)\s]|①|②|③|❶|❷|❸|I\s|II\s|■|●|・)/;
const sentencePattern = /[。\.]$/;

const recipe = {
    title: "",
    description: "",
    ingredients: [],
    steps: []
};

let currentSection = 'unknown';

console.log("--- Start Parsing ---");

for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    console.log(`\nLine: "${line}"`);
    console.log(`Current Section: ${currentSection}`);

    // Check for section headers
    if (ingKeywords.some(k => line.includes(k))) {
        currentSection = 'ingredients';
        console.log("-> Detected Section: ingredients");
        continue;
    }
    // ... (other headers omitted for brevity as they assume standard headers)


    // Implicit section detection
    let isStepLine = stepNumberPattern.test(line);
    const isSentence = sentencePattern.test(line);
    // Stricter Ing Line: Must match pattern and be short
    const isIngLine = ingredientPattern.test(line) && line.length < 50 && !isSentence;

    // FIX 1: If it looks like a step ("1 ...") but also starts with "Number Unit", it's an ingredient.
    // e.g. "450 g" -> Starts with 450, matches step pattern \d+\s
    if (isStepLine) {
        // Check if it starts with Number + Space? + Unit
        // Units list from ingredientPattern: g, ml, kg, cc, tbsp, tsp, cup, 個, 本, 枚, 円
        // Also add % just in case
        const startsWithUnit = /^\d+\s*(g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円|%)/i.test(line);
        if (startsWithUnit) {
            console.log("-> override: isStepLine = false (Starts with Number+Unit)");
            isStepLine = false;
        }
    }

    console.log(`isStepLine: ${isStepLine}, isIngLine: ${isIngLine}`);

    if (isStepLine) {
        currentSection = 'steps';
        console.log("-> Switched to steps (Step Line Match)");
    } else if (isIngLine && currentSection !== 'ingredients') {
        currentSection = 'ingredients';
        console.log("-> Switched to ingredients (Ing Line Match)");
    }

    if (currentSection === 'ingredients') {
        if (isSentence && !isStepLine) {
            currentSection = 'steps'; // Assume step
            recipe.steps.push(line);
            console.log("-> Added to steps (Sentence fallback)");
            continue;
        }

        if (currentSection === 'steps') {
            recipe.steps.push(line);
            console.log("-> Added to steps (Late switch)");
        } else {
            // Smart Split logic
            let namePart = "";
            let qtyPart = "";
            let unitPart = "";

            // Check if the line STARTS with a Quantity+Unit pattern (likely orphaned quantity)
            const startMatch = line.match(/^([\d\.\/]+)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF%]+)(.*)$/);
            // We need to be careful not to match "1. Cut" as quantity "1" unit "." (if unit allowed dot)
            // But our unit regex is specific.

            // Reuse the startsWithUnit logic we defined earlier for consistency
            const startsWithUnit = /^\d+\s*(g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円|%)/i.test(line);

            if (startsWithUnit && startMatch) {
                console.log("-> Strategy: Start-of-line Quantity");
                const q = startMatch[1];
                const u = startMatch[2];
                const rem = startMatch[3].trim();

                // Check last ingredient for merge
                const lastIng = recipe.ingredients.length > 0 ? recipe.ingredients[recipe.ingredients.length - 1] : null;
                if (lastIng && !lastIng.quantity && lastIng.name) {
                    console.log(`-> Merging with last ingredient: "${lastIng.name}"`);
                    lastIng.quantity = q;
                    lastIng.unit = u;
                    // Continue to next line
                    continue;
                }

                // Else check description
                if (recipe.description) {
                    const descLines = recipe.description.trim().split('\n');
                    if (descLines.length > 0) {
                        const lastDesc = descLines[descLines.length - 1].trim();
                        if (lastDesc.length < 20 && !/[。\.]$/.test(lastDesc)) {
                            console.log(`-> Merging name from description: "${lastDesc}"`);
                            namePart = lastDesc;
                            descLines.pop();
                            recipe.description = descLines.join('\n');
                            recipe.ingredients.push({ name: namePart, quantity: q, unit: u });
                            continue;
                        }
                    }
                }

                // Else add as orphan
                namePart = "";
                qtyPart = q;
                unitPart = u;
            } else {
                console.log("-> Strategy: End-of-line Quantity");
                // Existing backward search strategy
                // Remove ( ) from regex to avoid matching "(75%)" as part of unit if it's at end
                // Use stricter unit pattern
                const lastPartMatch = line.match(/[\d\.\/]+[\s]*[a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF%]+$/);

                if (lastPartMatch) {
                    const qtyString = lastPartMatch[0];
                    namePart = line.substring(0, line.length - qtyString.length).replace(/[\.…]+$/, '').trim();
                    const valMatch = qtyString.match(/^([\d\.\/]+)\s*(.*)$/);
                    if (valMatch) {
                        qtyPart = valMatch[1];
                        unitPart = valMatch[2];
                    } else {
                        qtyPart = qtyString;
                    }
                } else {
                    // Fallback: If no match at end, maybe it's just a name
                    namePart = line;
                }
            }

            // Only push if we didn't continue above
            console.log(`-> Parsed Ingredient: Name="${namePart}", Qty="${qtyPart}", Unit="${unitPart}"`);
            recipe.ingredients.push({ name: namePart, quantity: qtyPart, unit: unitPart });
        }


    } else if (currentSection === 'steps') {
        recipe.steps.push(line);
        console.log("-> Added to steps");
    } else {
        recipe.description += line + "\n";
        console.log("-> Added to description");
    }
}

console.log("\n--- Result ---");
console.log("Description:", recipe.description);
console.log("Steps:", recipe.steps);
console.log("Ingredients:", recipe.ingredients);
