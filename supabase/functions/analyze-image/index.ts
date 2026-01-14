
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

                if (currentSection === 'steps') {
                    recipe.steps.push(line);
                } else {
                    // Smart Split for Ingredients
                    let namePart = "";
                    let qtyPart = "";
                    let unitPart = "";
                    let groupPart = currentGroup; // Use current tracked group

                    // Pre-check: Is this line actually a GROUP HEADER? 
                    // Heuristic: Short, No Digits, Ends with colon? or just short text
                    const hasDigits = /\d/.test(line);
                    // allow some length, but not too long. prevent sentence-like descriptions.
                    if (!hasDigits && line.length < 20 && !/。$/.test(line)) {
                        // Likely a group header! e.g. "Sauce:" or "For the filling"
                        currentGroup = line.replace(/[:：]/g, '').trim();
                        continue; // Skip adding this as ingredient, just update group
                    }

                    // Strategy 1: Check if line STARTS with Quantity+Unit (Orphaned Quantity or "Qty Name")
                    const startMatch = line.match(/^([\d\.\/]+)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF%]+)(.*)$/);
                    const startsWithUnit = /^\d+\s*(g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円|%)/i.test(line);

                    if (startsWithUnit && startMatch) {
                        const q = startMatch[1];
                        const u = startMatch[2];

                        // Check if we check for merge... (existing logic usually good)

                        // Check if we should merge with the LAST ingredient (if it has name but no qty)
                        const lastIng = recipe.ingredients.length > 0 ? recipe.ingredients[recipe.ingredients.length - 1] : null;
                        if (lastIng && !lastIng.quantity && lastIng.name && (!lastIng.group || lastIng.group === groupPart)) {
                            // Only merge if group matches or looks safe
                            lastIng.quantity = q;
                            lastIng.unit = u;
                            continue;
                        }

                        // Normal add
                        const remainder = startMatch[3].trim();
                        if (remainder.length > 0 && !/^[\(\)0-9%\s]+$/.test(remainder)) {
                            namePart = remainder;
                            qtyPart = q;
                            unitPart = u;
                        } else {
                            qtyPart = q;
                            unitPart = u;
                        }
                    } else {
                        // Strategy 2: End-of-line Quantity
                        const lastPartMatch = line.match(/[\d\.\/]+[\s]*[a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF%\(\)\s]+$/);

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
                            // Fallback
                            namePart = line;
                        }
                    }

                    recipe.ingredients.push({
                        name: namePart,
                        quantity: qtyPart,
                        unit: unitPart,
                        group: groupPart
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
