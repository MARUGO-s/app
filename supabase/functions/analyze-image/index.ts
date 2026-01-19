
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const formData = await req.formData();
        const imageFile = formData.get('image');

        if (!imageFile || !(imageFile instanceof File)) {
            throw new Error('No image file provided');
        }

        const AZURE_DI_KEY = Deno.env.get('AZURE_DI_KEY');
        const AZURE_DI_ENDPOINT = Deno.env.get('AZURE_DI_ENDPOINT');

        if (!AZURE_DI_KEY || !AZURE_DI_ENDPOINT) {
            throw new Error('Azure credentials not configured');
        }

        console.log(`Analyzing image: ${imageFile.name}, size: ${imageFile.size}`);

        // Call Azure Document Intelligence (prebuilt-layout)
        // API Version: 2023-07-31 (General Availability) for Layout
        const apiUrl = `${AZURE_DI_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_DI_KEY,
                'Content-Type': imageFile.type, // e.g. image/jpeg, image/png
            },
            body: imageFile
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Azure API Error:", response.status, errText);
            throw new Error(`Azure API Failed: ${response.statusText}`);
        }

        const pollerHeaders = response.headers;
        const operationLocation = pollerHeaders.get('Operation-Location');

        if (!operationLocation) {
            throw new Error('No Operation-Location header received from Azure');
        }

        // Poll for results
        let result = null;
        let status = 'notStarted';
        let retries = 0;
        while (status !== 'succeeded' && status !== 'failed' && retries < 30) {
            await new Promise(r => setTimeout(r, 1000)); // Wait 1 sec
            const pollRes = await fetch(operationLocation, {
                headers: { 'Ocp-Apim-Subscription-Key': AZURE_DI_KEY }
            });
            const pollData = await pollRes.json();
            status = pollData.status;
            if (status === 'succeeded') {
                result = pollData.analyzeResult;
            } else if (status === 'failed') {
                throw new Error('Analysis failed');
            }
            retries++;
        }

        if (!result) {
            throw new Error('Analysis timeout');
        }

        // Parse the result into a recipe format
        // Strategy: Look for "ingredients" and "steps" headers roughly.
        // Since this is a simple implementation, we'll try to group lines.

        // We will extract ALL text lines and return them to the frontend, 
        // OR try to do some smart parsing here.
        // Let's do a "smart-ish" parsing.

        let fullText = result.content || "";
        const lines = (result.pages?.[0]?.lines || []).map((l: any) => l.content);

        // Simple Heuristic Parser
        const recipe = {
            title: "",
            description: "",
            ingredients: [] as { name: string, quantity: string, unit: string, group?: string }[],
            steps: [] as { text: string, group?: string }[]
        };

        let currentSection = 'unknown'; // title, ingredients, steps
        let currentGroup = ''; // Track ingredient group (e.g. 'A', 'Sauce')

        // Assumption: Title is usually the first line or largest text (not checking font size here for simplicity)
        if (lines.length > 0) {
            recipe.title = lines[0];
        }

        // Iterate and classify
        // Keywords
        const ingKeywords = ['材料', 'Ingredients', '用意するもの', '買い物リスト'];
        const stepKeywords = ['作り方', 'つくり方', '手順', 'Directions', 'Method', 'Steps', 'How to cook'];
        const excludeKeywords = ['保存方法', '使いみち', 'ポイント', 'advice', 'memo'];

        // Heuristics:
        // Exclude explicit step numbers (e.g. "1.", "1 ", "①") from implicit ingredients
        const ingredientPattern = /(\d+|g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円)/i;
        const stepNumberPattern = /^(\d+[\.\)\s]|①|②|③|❶|❷|❸|I\s|II\s|■|●|・)/;
        const sentencePattern = /[。\.]$/;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Check for section headers
            if (ingKeywords.some(k => line.includes(k))) {
                currentSection = 'ingredients';
                continue;
            }
            if (stepKeywords.some(k => line.includes(k))) {
                currentSection = 'steps';
                continue;
            }
            // Check for exclusion headers -> switch to unknown/description
            if (excludeKeywords.some(k => line.includes(k))) {
                currentSection = 'unknown';
                recipe.description += "\n" + line + "\n";
                continue;
            }

            // Implicit section detection / Correction
            let isStepLine = stepNumberPattern.test(line);
            const isSentence = sentencePattern.test(line);
            // Ingredient heuristic: contains unit/qty AND is short AND not a step number AND not a sentence
            const isIngLine = ingredientPattern.test(line) && line.length < 50 && !isSentence;

            // FIX: If it looks like a step ("1 ...") but also starts with "Number Unit", it's likely an ingredient (e.g. "450 g")
            if (isStepLine) {
                const startsWithUnit = /^\d+\s*(g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円|%)/i.test(line);
                if (startsWithUnit) {
                    isStepLine = false;
                }
            }

            if (isStepLine) {
                currentSection = 'steps';
            } else if (isIngLine && currentSection !== 'ingredients') {
                currentSection = 'ingredients';
            }

            if (currentSection === 'ingredients') {
                if (isSentence && !isStepLine) {
                    // Fallback: If it's a sentence, it's likely a step or description, not an ingredient
                    if (currentSection === 'ingredients') {
                        currentSection = 'steps'; // Assume step
                        recipe.steps.push(line);
                        continue;
                    }
                }

                // ---------------------------------------------------------
                // Helper: Normalize Unit Strings (e.g. Japanese -> cc)
                // ---------------------------------------------------------
                const normalizeUnit = (str: string) => {
                    if (!str) return str;
                    // Normalize Full-width numbers to Half-width for Regex compatibility
                    let s = str.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
                        .replace(/[．]/g, '.');

                    const parseNum = (n: string) => {
                        if (n.includes('/')) {
                            const [a, b] = n.split('/');
                            return parseFloat(a) / parseFloat(b);
                        }
                        return parseFloat(n);
                    };

                    // 大さじ (Tbsp) -> 15cc
                    s = s.replace(/大さじ\s*(\d+(?:\.\d+)?(?:\/\d+)?)/g, (_, n) => {
                        const val = parseNum(n);
                        return isNaN(val) ? _ : `${val * 15}cc`;
                    });
                    // 小さじ (Tsp) -> 5cc
                    s = s.replace(/小さじ\s*(\d+(?:\.\d+)?(?:\/\d+)?)/g, (_, n) => {
                        const val = parseNum(n);
                        return isNaN(val) ? _ : `${val * 5}cc`;
                    });
                    // カップ (Cup) -> 200cc
                    s = s.replace(/(\d+(?:\.\d+)?(?:\/\d+)?)\s*カップ/g, (_, n) => {
                        const val = parseNum(n);
                        return isNaN(val) ? _ : `${val * 200}cc`;
                    });
                    return s;
                };

                const parseIngredient = (text: string) => {
                    text = text.trim().replace(/\s+/g, ' ');
                    text = normalizeUnit(text);

                    // A. Specific Format: "Name: Quantity"
                    if (text.includes('：') || text.includes(':')) {
                        const parts = text.split(/[：:]/);
                        const name = parts[0].trim();
                        const rawQty = parts.slice(1).join(' ').trim();
                        if (rawQty.length < 30) {
                            // Try to parse the right side as Quantity + Unit
                            const numberPattern = `[\\d\\s\\.,/\\u00BC-\\u00BE\\u2150-\\u215E]+`;
                            const amountRegex = new RegExp(`^(${numberPattern})\\s*([a-zA-Z%]+|cc|g|ml|kg|tbsp|tsp|cup|個|本|枚|つ|かけ|片|束|cm)?(.*)$`);

                            const match = rawQty.match(amountRegex);
                            if (match) {
                                const num = match[1].trim();
                                const unit = (match[2] || '').trim();
                                const suffix = match[3].trim();
                                return {
                                    name,
                                    quantity: num,
                                    unit: unit + (suffix ? ` ${suffix}` : '')
                                };
                            }
                            return { name, quantity: rawQty, unit: '' };
                        }
                    }

                    const numberPattern = `[\\d\\s\\.,/\\u00BC-\\u00BE\\u2150-\\u215E]+`;
                    const units = [
                        'g', 'kg', 'mg', 'oz', 'lb', 'lbs', 'tsp', 'tbsp', 'cup', 'cups', 'ml', 'cl', 'l', 'liter', 'quart', 'pint', 'box', 'bag', 'slice', 'slices', 'piece', 'pieces', 'clove', 'cloves', 'pinch', 'dash', 'can', 'jar', 'package',
                        'g', 'gr', 'kgs', 'c.à.s', 'c.à.c', 'cuillère', 'cuillères', 'verre', 'verres', 'tranche', 'tranches', 'pincée', 'brin', 'feuille', 'feuilles', 'gousse', 'gousses',
                        'cucharada', 'cucharadita', 'taza', 'vaso', 'hoja', 'spicchi', 'bicchiere', 'fetta',
                        '個', '本', '束', '枚', '杯', 'g', 'ml', 'cc', 'cm', 'かけ', '片'
                    ].join('|').replace(/\./g, '\\.');

                    // Pattern 1: Quantity Starts (Western)
                    const westernRegex = new RegExp(`^(${numberPattern})\\s*(${units}|cc)?\\s+(.*)$`, 'i');
                    const westernMatch = text.match(westernRegex);
                    if (westernMatch) {
                        const rawNum = westernMatch[1].trim();
                        if (/[\d\u00BC-\u00BE\u2150-\u215E]/.test(rawNum)) {
                            return { name: westernMatch[3].trim(), quantity: rawNum, unit: (westernMatch[2] || '').trim() };
                        }
                    }

                    // Pattern 2: Quantity Ends (Japanese/Eastern) "Beef 200g"
                    const easternRegex = new RegExp(`^(.*)\\s+(${numberPattern})\\s*(${units}|個|本|枚|つ|かけ|片|束|head|heads|cc)?$`, 'i');
                    const easternMatch = text.match(easternRegex);

                    if (easternMatch) {
                        const rawName = easternMatch[1].trim();
                        const rawNum = easternMatch[2].trim();
                        const rawUnit = (easternMatch[3] || '').trim();
                        if (/[\d\u00BC-\u00BE\u2150-\u215E]/.test(rawNum)) {
                            return { name: rawName, quantity: rawNum, unit: rawUnit };
                        }
                    }

                    // Pattern 3: Tight Packing "NameQuantity"
                    const easternRegexTight = new RegExp(`^(.*?)(${numberPattern})\\s*(${units}|個|本|枚|つ|かけ|片|束|head|heads|cc)$`, 'i');
                    const tightMatch = text.match(easternRegexTight);

                    if (tightMatch) {
                        const rawName = tightMatch[1].trim();
                        const rawNum = tightMatch[2].trim();
                        const rawUnit = tightMatch[3].trim();

                        if (rawName.length > 0 && /[\d\u00BC-\u00BE\u2150-\u215E]/.test(rawNum)) {
                            return { name: rawName, quantity: rawNum, unit: rawUnit };
                        }
                    }

                    return { name: text, quantity: '', unit: '' };
                };

                if (currentSection === 'steps') {
                    recipe.steps.push(line);
                } else {
                    // Pre-check for Group Header
                    // Heuristic: Must end with colon OR be very specific keywords to avoid skipping ingredients like "Milk"
                    // "Sauce:" or "ソース："
                    const isGroupHeader = /[:：]$/.test(line) || /^\s*[\[【].*[\]】]\s*$/.test(line);

                    if (isGroupHeader) {
                        currentGroup = line.replace(/[:：\[\]【】]/g, '').trim();
                        continue;
                    }

                    // 1. Normalize the line first to handle Japanese units/numbers
                    const normalizedLine = normalizeUnit(line).trim();

                    // 2. Check if this line is PURELY a quantity (e.g. "15cc", "450g", "1个")
                    // If so, try to merge with the previous ingredient if it lacks quantity
                    const isQtyOnly = /^[\d\.]+\s*(cc|g|ml|kg|tbsp|tsp|cup|個|本|枚|かけ|片|束|%|cm)$/i.test(normalizedLine);

                    if (isQtyOnly) {
                        const lastIng = recipe.ingredients.length > 0 ? recipe.ingredients[recipe.ingredients.length - 1] : null;

                        // Merge if last ingredient exists, has name, but no quantity, and group matches (or is implicit)
                        if (lastIng && !lastIng.quantity && lastIng.name && (!lastIng.group || lastIng.group === currentGroup)) {
                            const match = normalizedLine.match(/^([\d\.]+)\s*(.*)$/);
                            if (match) {
                                lastIng.quantity = match[1];
                                lastIng.unit = match[2];
                                continue; // merged, move to next line
                            }
                        }
                    }

                    // 3. Normal Parse
                    const parsed = parseIngredient(line);
                    recipe.ingredients.push({
                        ...parsed,
                        group: currentGroup
                    });
                }
            } else if (currentSection === 'steps') {
                recipe.steps.push(line);
            } else {
                recipe.description += line + "\n";
            }
        }
        recipe.description = recipe.description.trim();

        return new Response(
            JSON.stringify({ recipe, rawText: fullText }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        console.error(error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    }
})
