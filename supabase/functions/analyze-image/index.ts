
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
            ingredients: [] as { name: string, quantity: string, unit: string }[],
            steps: [] as string[]
        };

        let currentSection = 'unknown'; // title, ingredients, steps

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
            const isStepLine = stepNumberPattern.test(line);
            const isSentence = sentencePattern.test(line);
            // Ingredient heuristic: contains unit/qty AND is short AND not a step number AND not a sentence
            const isIngLine = ingredientPattern.test(line) && line.length < 50 && !isSentence;

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
                    // Search for Number+Unit at the END of the line via backward regex strategy
                    // Extract the last run of [digits/chars] at end of line.
                    const lastPartMatch = line.match(/[\d\.\/]+[\s]*[a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF%]+$/);

                    if (lastPartMatch) {
                        const qtyString = lastPartMatch[0]; // e.g. "70g"
                        const namePart = line.substring(0, line.length - qtyString.length).replace(/[\.…]+$/, '').trim();

                        // Parse qtyString into val + unit
                        const valMatch = qtyString.match(/^([\d\.\/]+)\s*(.*)$/);
                        if (valMatch) {
                            recipe.ingredients.push({
                                name: namePart,
                                quantity: valMatch[1],
                                unit: valMatch[2]
                            });
                        } else {
                            recipe.ingredients.push({ name: namePart, quantity: qtyString, unit: '' });
                        }
                    } else {
                        // Fallback to splitting at first digit if end-of-line fail
                        const match = line.match(/(.*?)(\d+.*)/);
                        if (match) {
                            const qSection = match[2].trim();
                            const qMatch = qSection.match(/^([\d\.\/]+)\s*(.*)$/);
                            if (qMatch) {
                                recipe.ingredients.push({ name: match[1].trim(), quantity: qMatch[1], unit: qMatch[2] });
                            } else {
                                recipe.ingredients.push({ name: match[1].trim(), quantity: qSection, unit: '' });
                            }
                        } else {
                            recipe.ingredients.push({ name: line, quantity: '', unit: '' });
                        }
                    }
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
