
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeImageMimeType(file: File) {
    const type = String(file?.type || '').toLowerCase();
    if (type.startsWith('image/')) return type;

    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.gif')) return 'image/gif';
    if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
}

// --------------------------------------------------------------------------
// Gemini API Integration
// --------------------------------------------------------------------------
async function analyzeImageWithGemini(file: File) {
    const apiKey = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VISION_API_KEY');
    if (!apiKey) {
        console.warn("Skipping Gemini: No API Key found");
        return null;
    }

    try {
        const MAX_GEMINI_IMAGE_BYTES = 4_000_000;
        if (file.size > MAX_GEMINI_IMAGE_BYTES) {
            return { error: `画像サイズが大きすぎるためGeminiをスキップします (${Math.round(file.size / 1_000_000)}MB)` };
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Image = encode(arrayBuffer);
        const mimeType = normalizeImageMimeType(file);

        const prompt = `
あなたは世界最高峰のパティシエかつ料理研究家です。
渡された画像（手書きのメモやスクリーンショット）から料理のレシピ情報を正確に読み取ってください。

【最重要: 手書き文字の認識】
- 手書きの文字、特に数字や単位、独特な略し方（例: "tsp"や"大"など）を文脈から推測して正確に読み取ってください。
- 画像が少しぼやけていたり、斜めになっていても、最大限補正して読み取ってください。
- 読み取れない箇所がある場合は、前後の文脈から推測するか、正直に空欄にしてください。

【出力フォーマット】
以下のJSONフォーマットで出力してください。JSON以外の余計な文章（「分かりました」など）は一切不要です。
\`\`\`json
{
  "title": "料理名",
  "description": "料理の説明や特徴（もし画像にあれば）",
  "ingredients": [
    {
      "name": "材料名",
      "quantity": "分量数値（例: 200, 1/2）",
      "unit": "単位（例: g, ml, 個, 大さじ, cup）。単位がない場合は空文字",
      "group": "グループ名（あれば。例: A, ソース用, トッピング）。なければnull"
    }
  ],
  "steps": [
    "手順1の文章...",
    "手順2の文章...",
    "手順3の文章..."
  ]
}
\`\`\`

【詳細ルール】
1. タイトル: 画像内で一番目立つ料理名を採用してください。
2. 材料:
   - 「A」「●」などでグループ化されている場合は \`group\` フィールドに入れてください。
   - "卵 1個" -> name: "卵", quantity: "1", unit: "個"
   - "塩コショウ 少々" -> name: "塩コショウ", quantity: "", unit: "少々" (quantityは数字のみが望ましいですが、"少々"などの場合はunitに入れてquantityは空でも可)
   - 【単位変換】: "大さじ", "小さじ", "カップ" (ccも含む) などの体積単位は、可能な限り "ml" (ミリリットル) または "g" (グラム) に換算してください。
     - 大さじ1 -> 15ml
     - 小さじ1 -> 5ml
     - 1カップ -> 200ml
     - "大さじ2" -> quantity: "30", unit: "ml"
     - 液体の場合はml、固体の場合は可能ならgに換算（難しければmlのままで可）。算出できない場合は元の単位のままでも良いですが、積極的な換算を試みてください。
3. 手順: 番号（1, ①, Step1）などのプレフィックスは削除して文章のみにしてください。
4. 画像から読み取れる情報のみを使用してください。存在しない情報を捏造しないでください。
`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55_000);

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: base64Image
                                    }
                                }
                            ]
                        }]
                    }),
                    signal: controller.signal,
                },
            );

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text();
                console.error("Gemini API Error:", response.status, errText);
                return { error: `Gemini API Error: ${response.status} ${errText}` };
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            if (!candidate) return { error: "No candidate returned from Gemini" };

            const rawText = candidate.content?.parts?.[0]?.text;
            if (!rawText) return { error: "No text content in Gemini response" };

            // Extract JSON from code blocks if present
            let jsonStr = rawText;
            if (jsonStr.includes('```json')) {
                jsonStr = jsonStr.split('```json')[1].split('```')[0];
            } else if (jsonStr.includes('```')) {
                jsonStr = jsonStr.split('```')[1].split('```')[0];
            }

            try {
                return {
                    recipe: JSON.parse(jsonStr.trim()),
                    rawText: rawText?.slice?.(0, 20_000) ?? rawText
                };
            } catch (parseErr) {
                console.error("JSON Parse Failed:", parseErr);
                return {
                    error: "JSON Parse Failed",
                    rawText: rawText?.slice?.(0, 20_000) ?? rawText
                };
            }
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            throw fetchErr;
        }

    } catch (e) {
        console.error("Gemini Analysis Failed:", e);
        if (e?.name === 'AbortError') {
            return { error: 'Gemini API がタイムアウトしました' };
        }
        return { error: e?.message || String(e) };
    }
}

// --------------------------------------------------------------------------
// Azure Document Intelligence Fallback
// --------------------------------------------------------------------------
async function analyzeImageWithAzure(file: File) {
    const AZURE_DI_KEY = Deno.env.get('AZURE_DI_KEY');
    const AZURE_DI_ENDPOINT = Deno.env.get('AZURE_DI_ENDPOINT');

    if (!AZURE_DI_KEY || !AZURE_DI_ENDPOINT) {
        return { error: 'Azure credentials are not configured on the server.' };
    }

    try {
        const apiUrl = `${AZURE_DI_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
        const azureContentType = normalizeImageMimeType(file);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_DI_KEY,
                'Content-Type': azureContentType,
            },
            body: file,
        });

        if (!response.ok) {
            const errText = await response.text();
            return { error: `Azure API Failed: ${response.statusText} (${errText})` };
        }

        const operationLocation = response.headers.get('Operation-Location');
        if (!operationLocation) {
            return { error: 'Azureからの応答に Operation-Location が含まれていません。' };
        }

        // Poll for results
        let result = null;
        let status = 'notStarted';
        let retries = 0;
        while (status !== 'succeeded' && status !== 'failed' && retries < 30) {
            await new Promise(r => setTimeout(r, 1000));
            const pollRes = await fetch(operationLocation, {
                headers: { 'Ocp-Apim-Subscription-Key': AZURE_DI_KEY },
            });
            const pollData = await pollRes.json();
            status = pollData.status;

            if (status === 'succeeded') {
                result = pollData.analyzeResult;
            } else if (status === 'failed') {
                return { error: 'Azureでの解析処理が失敗しました。' };
            }
            retries++;
        }

        if (!result) {
            return { error: '解析がタイムアウトしました。' };
        }

        const fullText = result.content || "";
        const lines = (result.pages?.[0]?.lines || []).map((l: any) => l.content);
        const recipe = parseAzureResult(lines, fullText);

        return { recipe, rawText: fullText?.slice?.(0, 20_000) ?? fullText, source: 'azure' };

    } catch (e) {
        console.error("Azure Analysis Failed:", e);
        return { error: e?.message || String(e) };
    }
}


serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const formData = await req.formData();
        const imageFile = formData.get('image');

        if (!imageFile || !(imageFile instanceof File)) {
            return new Response(
                JSON.stringify({ error: 'No image file provided' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const logs: string[] = [];
        logs.push('🚀 画像解析プロセスを開始しました...');
        logs.push('📸 画像を受信しました。解析準備中...');

        // --------------------------------------------------------------------------
        // 1. Try Gemini
        // --------------------------------------------------------------------------
        const geminiKey = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VISION_API_KEY');

        if (geminiKey) {
            logs.push('🤖 Gemini (最新AI) で解析中...');

            const geminiResult = await analyzeImageWithGemini(imageFile);

            if (geminiResult && geminiResult.recipe && geminiResult.recipe.title) {
                logs.push('✅ Geminiによる解析に成功しました！');

                // Return SSE-formatted response for compatibility with existing frontend
                const events = [
                    ...logs.map(msg => `data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`),
                    `data: ${JSON.stringify({ type: 'result', recipe: geminiResult.recipe, rawText: geminiResult.rawText, source: 'gemini' })}\n\n`
                ].join('');

                return new Response(events, {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                    },
                });
            } else {
                const reason = geminiResult?.error || 'JSONの抽出に失敗';
                logs.push(`⚠️ Gemini解析失敗: ${reason}`);
            }
        } else {
            logs.push('⚠️ Google API Keyが見つかりません。Geminiをスキップします。');
        }

        // --------------------------------------------------------------------------
        // 2. Fallback to Azure Document Intelligence
        // --------------------------------------------------------------------------
        logs.push('🔄 従来の解析エンジン（Azure AI）に切り替えています...');

        const azureResult = await analyzeImageWithAzure(imageFile);

        if (azureResult && azureResult.recipe) {
            logs.push('✅ Azure解析に成功しました！');

            const events = [
                ...logs.map(msg => `data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`),
                `data: ${JSON.stringify({ type: 'result', recipe: azureResult.recipe, rawText: azureResult.rawText, source: azureResult.source })}\n\n`
            ].join('');

            return new Response(events, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                },
            });
        }

        // Both failed
        const errorMsg = azureResult?.error || '画像の解析に失敗しました。';
        logs.push(`❌ ${errorMsg}`);

        const events = [
            ...logs.map(msg => `data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`),
            `data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`
        ].join('');

        return new Response(events, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
        });

    } catch (error) {
        console.error(error);
        const errMsg = error?.message ? String(error.message) : String(error);

        const events = `data: ${JSON.stringify({ type: 'error', message: errMsg || '不明なエラーが発生しました' })}\n\n`;

        return new Response(events, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
        });
    }
})

// Helper functions for parsing Azure results
function parseAzureResult(lines: string[], fullText: string) {
    const recipe = {
        title: "",
        description: "",
        ingredients: [] as any[],
        steps: [] as string[]
    };

    let currentSection = 'unknown';
    let currentGroup = '';

    if (lines.length > 0) recipe.title = lines[0];

    const ingKeywords = ['材料', 'Ingredients', '用意するもの', '買い物リスト'];
    const stepKeywords = ['作り方', 'つくり方', '手順', 'Directions', 'Method', 'Steps', 'How to cook'];
    const excludeKeywords = ['保存方法', '使いみち', 'ポイント', 'advice', 'memo'];

    const ingredientPattern = /(\d+|g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円)/i;
    const stepNumberPattern = /^(\d+[\.\)\s]|①|②|③|❶|❷|❸|I\s|II\s|■|●|・)/;
    const sentencePattern = /[。\.]$/;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (ingKeywords.some(k => line.includes(k))) { currentSection = 'ingredients'; continue; }
        if (stepKeywords.some(k => line.includes(k))) { currentSection = 'steps'; continue; }
        if (excludeKeywords.some(k => line.includes(k))) { currentSection = 'unknown'; recipe.description += "\\n" + line + "\\n"; continue; }

        let isStepLine = stepNumberPattern.test(line);
        const isSentence = sentencePattern.test(line);
        const isIngLine = ingredientPattern.test(line) && line.length < 50 && !isSentence;

        if (isStepLine) {
            const startsWithUnit = /^\d+\s*(g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円|%)/i.test(line);
            if (startsWithUnit) isStepLine = false;
        }

        if (isStepLine) currentSection = 'steps';
        else if (isIngLine && currentSection !== 'ingredients') currentSection = 'ingredients';

        if (currentSection === 'ingredients') {
            if (isSentence && !isStepLine) {
                if (currentSection === 'ingredients') {
                    currentSection = 'steps';
                    recipe.steps.push(line);
                    continue;
                }
            }
            recipe.ingredients.push({ name: line, quantity: '', unit: '', group: currentGroup });
        } else if (currentSection === 'steps') {
            recipe.steps.push(line);
        } else {
            recipe.description += line + "\\n";
        }
    }
    recipe.description = recipe.description.trim();
    return recipe;
}
