import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { Card } from './Card';
import { Button } from './Button';
import { useToast } from '../contexts/useToast';
import './ImportModal.css';

export const ImportModal = ({ onClose, onImport, initialMode = 'url' }) => {
    const toast = useToast();
    const [mode, setMode] = useState(initialMode); // 'url' | 'image' | 'confirm-translation'
    const [pendingRecipe, setPendingRecipe] = useState(null);
    const [scrapedUrl, setScrapedUrl] = useState('');
    const [url, setUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isImagePreparing, setIsImagePreparing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const analyzeAbortRef = useRef(null);
    const analyzeTimeoutRef = useRef(null);

    const clearAnalyzeTimers = () => {
        if (analyzeTimeoutRef.current) {
            clearTimeout(analyzeTimeoutRef.current);
            analyzeTimeoutRef.current = null;
        }
    };

    const cancelAnalyze = (message = '解析を中断しました。') => {
        clearAnalyzeTimers();

        if (analyzeAbortRef.current) {
            try {
                analyzeAbortRef.current.abort();
            } catch {
                // ignore
            }
            analyzeAbortRef.current = null;
        }

        setIsLoading(false);
        if (message) setError(message);
    };

    useEffect(() => {
        return () => {
            // Cleanup without setting state.
            clearAnalyzeTimers();
            if (analyzeAbortRef.current) {
                try {
                    analyzeAbortRef.current.abort();
                } catch {
                    // ignore
                }
                analyzeAbortRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!imageFile) {
            setImagePreview(null);
            return undefined;
        }

        const url = URL.createObjectURL(imageFile);
        setImagePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    const optimizeImageFile = (file) => new Promise((resolve) => {
        if (!file || typeof file !== 'object') return resolve(file);

        const type = String(file.type || '').toLowerCase();
        if (!type.startsWith('image/')) return resolve(file);

        // Camera photos can be huge. Also, HEIC/HEIF may not be supported server-side.
        // Keep OCR-friendly but shrink/convert for reliability.
        const SIZE_THRESHOLD_BYTES = 2_000_000; // ~2MB
        const MAX_SIDE_PX = 2000;
        const JPEG_QUALITY = 0.9;
        const name = String(file.name || '').toLowerCase();
        const isHeicLike = type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');

        const srcUrl = URL.createObjectURL(file);

        let didResolve = false;
        const resolveOnce = (next) => {
            if (didResolve) return;
            didResolve = true;
            try {
                URL.revokeObjectURL(srcUrl);
            } catch {
                // ignore
            }
            resolve(next);
        };

        // Safety net: avoid hanging forever on decode/encode in some browsers.
        const safety = setTimeout(() => resolveOnce(file), 15_000);

        const img = new Image();
        img.onload = () => {
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            if (!width || !height) {
                clearTimeout(safety);
                return resolveOnce(file);
            }

            const scale = Math.min(1, MAX_SIDE_PX / Math.max(width, height));
            const targetW = Math.max(1, Math.round(width * scale));
            const targetH = Math.max(1, Math.round(height * scale));

            const shouldResize = scale < 1;
            const shouldConvertOrCompress = isHeicLike || file.size > SIZE_THRESHOLD_BYTES;
            if (!shouldResize && !shouldConvertOrCompress) {
                clearTimeout(safety);
                return resolveOnce(file);
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                clearTimeout(safety);
                return resolveOnce(file);
            }

            ctx.drawImage(img, 0, 0, targetW, targetH);
            canvas.toBlob((blob) => {
                clearTimeout(safety);
                if (!blob) return resolveOnce(file);

                const baseName = String(file.name || 'recipe')
                    .replace(/\.[^/.]+$/, '')
                    .slice(0, 80);

                resolveOnce(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
            }, 'image/jpeg', JPEG_QUALITY);
        };

        img.onerror = () => {
            clearTimeout(safety);
            resolveOnce(file);
        };

        img.src = srcUrl;
    });

    const setSelectedImageFile = async (file) => {
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
            setError('画像ファイルを選択してください。');
            return;
        }

        setError(null);
        setIsImagePreparing(true);
        try {
            const optimized = await optimizeImageFile(file);
            setImageFile(optimized || file);
        } finally {
            setIsImagePreparing(false);
        }
    };

    const openCameraPicker = () => cameraInputRef.current?.click?.();
    const openGalleryPicker = () => galleryInputRef.current?.click?.();

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragActive(true);
        } else if (e.type === "dragleave") {
            setIsDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                void setSelectedImageFile(file);
            }
        }
    };

    // Helper to detect if text contains Japanese
    const hasJapanese = (text) => {
        return /[ぁ-んァ-ン一-龠]/.test(text || '');
    };

    const translateRecipe = async (recipe) => {
        try {
            // Prepare text array for batch translation
            const textsToTranslate = [];

            // 1. Title
            textsToTranslate.push(recipe.name || '');
            // 2. Description
            textsToTranslate.push(recipe.description || '');

            // 3. Ingredients names
            const ingredientIndices = [];
            if (Array.isArray(recipe.ingredients)) {
                recipe.ingredients.forEach((ing, idx) => {
                    if (ing.name) {
                        textsToTranslate.push(ing.name);
                        ingredientIndices.push(idx);
                    }
                });
            }

            // 4. Steps
            // We need to handle the fact that steps might be strings or objects in some contexts, but scrape-recipe returns strings usually?
            // scrape-recipe/index.ts line 516 promises array of strings.
            const stepIndices = [];
            if (Array.isArray(recipe.steps)) {
                recipe.steps.forEach((step, idx) => {
                    textsToTranslate.push(step);
                    stepIndices.push(idx);
                });
            }

            if (textsToTranslate.length === 0) return recipe;

            // Call Translation API
            const { data, error } = await supabase.functions.invoke('translate', {
                body: {
                    text: textsToTranslate,
                    target_lang: 'JA'
                }
            });

            if (error) throw error;

            const translatedTexts = data.translations.map(t => t.text);

            // Reconstruct recipe
            let cursor = 0;
            const newRecipe = { ...recipe };

            // 1. Title
            newRecipe.name = translatedTexts[cursor++] || newRecipe.name;
            // 2. Description
            newRecipe.description = translatedTexts[cursor++] || newRecipe.description;

            // 3. Ingredients
            if (ingredientIndices.length > 0) {
                newRecipe.ingredients = newRecipe.ingredients.map((ing, idx) => {
                    const foundIndex = ingredientIndices.indexOf(idx);
                    if (foundIndex !== -1) {
                        return { ...ing, name: translatedTexts[cursor + foundIndex] };
                    }
                    return ing;
                });
                cursor += ingredientIndices.length;
            }

            // 4. Steps
            if (stepIndices.length > 0) {
                newRecipe.steps = newRecipe.steps.map((step, idx) => {
                    const foundIndex = stepIndices.indexOf(idx);
                    if (foundIndex !== -1) {
                        return translatedTexts[cursor + foundIndex];
                    }
                    return step;
                });
            }

            return newRecipe;

        } catch (err) {
            console.error("Translation failed:", err);
            toast.warning("翻訳に失敗しました。元の言語のまま取り込みます。");
            return recipe;
        }
    };

    // State for streaming logs
    const [progressLog, setProgressLog] = useState([]);

    // Direct Gemini API call from browser (bypasses Edge Function / Docker networking issues)
    const analyzeImageWithGeminiDirect = async (file, signal) => {
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyC0yaHcgqaRDOzk_kW5K8G3XUe1P1vH5zw';
        if (!apiKey) return null;

        const MAX_SIZE = 4_000_000;
        if (file.size > MAX_SIZE) return null;

        const arrayBuffer = await file.arrayBuffer();
        const base64Image = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        const mimeType = file.type || 'image/jpeg';

        const prompt = `あなたは世界最高峰のパティシエかつ料理研究家です。
渡された画像（手書きのメモやスクリーンショット）から料理のレシピ情報を正確に読み取ってください。

【最重要: 手書き文字の認識】
- 手書きの文字、特に数字や単位を文脈から推測して正確に読み取ってください。
- 読み取れない箇所がある場合は、前後の文脈から推測するか、空欄にしてください。

以下のJSONフォーマットで出力してください。JSON以外の文章は不要です。
\`\`\`json
{
  "title": "料理名",
  "description": "料理の説明",
  "ingredients": [
    { "name": "材料名", "quantity": "分量数値", "unit": "単位", "group": null }
  ],
  "steps": ["手順1...", "手順2..."]
}
\`\`\`

【ルール】
- 大さじ1→15ml, 小さじ1→5ml, 1カップ→200ml に換算してください。
- 手順の番号プレフィックスは削除してください。
- 画像から読み取れる情報のみ使用してください。`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: base64Image } }
                        ]
                    }]
                }),
                signal,
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error("Gemini API Error:", response.status, errText);
            throw new Error(`Gemini API Error: ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("Geminiからの応答が空です");

        let jsonStr = rawText;
        if (jsonStr.includes('```json')) {
            jsonStr = jsonStr.split('```json')[1].split('```')[0];
        } else if (jsonStr.includes('```')) {
            jsonStr = jsonStr.split('```')[1].split('```')[0];
        }

        return { recipe: JSON.parse(jsonStr.trim()), rawText };
    };

    const handleImport = async () => {
        setIsLoading(true);
        setError(null);
        setProgressLog([]); // Reset logs

        try {
            let data;
            let currentUrl = '';

            if (mode === 'url') {
                if (!url) return;
                currentUrl = url;
                const { data: resData, error: resError } = await supabase.functions.invoke('scrape-recipe', {
                    body: { url }
                });
                if (resError) throw resError;
                data = resData;
            } else {
                if (!imageFile) return;
                clearAnalyzeTimers();

                const controller = new AbortController();
                analyzeAbortRef.current = controller;
                const ANALYZE_TIMEOUT_MS = 120_000;
                analyzeTimeoutRef.current = setTimeout(() => {
                    cancelAnalyze('解析がタイムアウトしました。画像をトリミングして文字を大きくして再試行してください。');
                }, ANALYZE_TIMEOUT_MS);

                // Strategy 1: Try direct Gemini API call from browser (faster, no Docker issues)
                const geminiApiKey = import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyC0yaHcgqaRDOzk_kW5K8G3XUe1P1vH5zw';
                let geminiSuccess = false;

                if (geminiApiKey) {
                    setProgressLog(prev => [...prev, '🤖 Gemini APIで画像を解析中...']);
                    try {
                        const result = await analyzeImageWithGeminiDirect(imageFile, controller.signal);
                        if (result && result.recipe && result.recipe.title) {
                            setProgressLog(prev => [...prev, '✅ 画像解析に成功しました！']);
                            data = { recipe: result.recipe, rawText: result.rawText };
                            geminiSuccess = true;
                        }
                    } catch (geminiErr) {
                        if (geminiErr.name === 'AbortError') throw geminiErr;
                        console.warn("Direct Gemini failed, falling back to Edge Function:", geminiErr.message);
                        setProgressLog(prev => [...prev, `⚠️ 直接API呼出し失敗: ${geminiErr.message}`]);
                    }
                }

                // Strategy 2: Fallback to Edge Function (for production / Azure)
                if (!geminiSuccess) {
                    setProgressLog(prev => [...prev, '🔄 サーバー経由で解析中...']);

                    const formData = new FormData();
                    formData.append('image', imageFile);

                    const { data: { session } } = await supabase.auth.getSession();
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || supabase.supabaseUrl || 'https://hocbnifuactbvmyjraxy.supabase.co';
                    const functionUrl = `${supabaseUrl}/functions/v1/analyze-image`;

                    const headers = {
                        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY || supabase.supabaseKey}`
                    };

                    let response;
                    try {
                        response = await fetch(functionUrl, {
                            method: 'POST',
                            headers: headers,
                            body: formData,
                            signal: controller.signal
                        });
                    } catch (netErr) {
                        console.error("Network Error:", netErr);
                        throw new Error("サーバーに接続できませんでした。");
                    }

                    if (!response.ok) {
                        const status = response.status;
                        throw new Error(`Server Error: ${response.statusText} (${status})`);
                    }

                    if (!response.body) {
                        data = await response.json();
                    } else {
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        let recipeResult = null;
                        let buffer = '';
                        let gotResult = false;

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                const trimmedLine = line.trim();
                                if (trimmedLine.startsWith('data: ')) {
                                    try {
                                        const eventData = JSON.parse(trimmedLine.slice(6));
                                        if (eventData.type === 'log') {
                                            setProgressLog(prev => [...prev, eventData.message]);
                                        } else if (eventData.type === 'result') {
                                            recipeResult = eventData;
                                            gotResult = true;
                                        } else if (eventData.type === 'error') {
                                            throw new Error(eventData.message);
                                        }
                                    } catch (e) {
                                        if (e.message && !e.message.includes('Failed to parse')) throw e;
                                        console.warn("Failed to parse SSE event", e);
                                    }
                                }
                            }

                            if (gotResult) break;
                        }

                        try { await reader.cancel(); } catch { /* ignore */ }

                        if (!recipeResult) {
                            throw new Error("サーバーからの結果を受信できませんでした。");
                        }
                        data = recipeResult;
                    }
                }
            }

            if (data.error) throw new Error(data.error);
            if (!data.recipe) throw new Error("No recipe found");

            let finalRecipe = data.recipe;

            // Normalize fields to ensure compatibility (backend might return title/servings or name/recipeYield)
            finalRecipe.name = finalRecipe.name || finalRecipe.title || '';
            finalRecipe.recipeYield = finalRecipe.recipeYield || finalRecipe.servings || '';
            // Ensure consistency for other components
            finalRecipe.description = finalRecipe.description || '';

            // FIX: Extract steps erroneously categorized as ingredients
            // First ensure ingredients is populated (some scrapers return recipeIngredient)
            if (!finalRecipe.ingredients && finalRecipe.recipeIngredient) {
                finalRecipe.ingredients = finalRecipe.recipeIngredient;
            }

            if (Array.isArray(finalRecipe.ingredients)) {
                const stepGroupKeywords = ['作り方', '手順', 'method', 'instructions', 'steps', 'preparation'];
                const realIngredients = [];
                const extractedSteps = [];

                finalRecipe.ingredients.forEach(ing => {
                    const groupName = (ing.group || '').trim().toLowerCase();
                    // Check if group name indicates it is actually a step
                    if (groupName && stepGroupKeywords.some(k => groupName === k || groupName.includes(k))) {
                        // Extract text: prefer name or text
                        const stepText = ing.name || ing.text || '';
                        if (stepText) {
                            extractedSteps.push(stepText);
                        }
                    } else {
                        realIngredients.push(ing);
                    }
                });

                if (extractedSteps.length > 0) {
                    console.log("Extracted steps from ingredients:", extractedSteps);
                    finalRecipe.ingredients = realIngredients;
                    // Ensure steps array exists
                    finalRecipe.steps = Array.isArray(finalRecipe.steps) ? finalRecipe.steps : [];
                    // Combine
                    finalRecipe.steps = [...finalRecipe.steps, ...extractedSteps];
                }
            }

            // Check for foreign language (lack of Japanese) in Name or Steps
            // We check name and first few steps
            const sampleText = (finalRecipe.name || '') + (finalRecipe.steps ? finalRecipe.steps.slice(0, 3).join('') : '');

            if (sampleText && !hasJapanese(sampleText)) {
                // Switch to confirmation mode instead of window.confirm
                setPendingRecipe(finalRecipe);
                setScrapedUrl(currentUrl);
                setMode('confirm-translation');
                setIsLoading(false); // Stop loading to show UI
                return;
            }

            onImport(finalRecipe, currentUrl);
            onClose();

        } catch (err) {
            console.error("Import failed details:", err);
            if (err?.name === 'AbortError') {
                // Cancel/timeout sets a user-facing message via `cancelAnalyze`.
                return;
            }
            const msg = err.message || "Import failed. Please try again.";
            setError(msg);
        } finally {
            clearAnalyzeTimers();
            analyzeAbortRef.current = null;
            if (mode !== 'confirm-translation') {
                setIsLoading(false);
            }
        }
    };

    const handleConfirmTranslation = async (shouldTranslate) => {
        setIsLoading(true);
        try {
            let finalRecipe = pendingRecipe;
            if (shouldTranslate) {
                finalRecipe = await translateRecipe(pendingRecipe);
            }
            onImport(finalRecipe, scrapedUrl);
            onClose();
        } catch (err) {
            console.error("Translation flow error:", err);
            setError("Translation failed. Importing original.");
            onImport(pendingRecipe, scrapedUrl);
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) void setSelectedImageFile(file);
        // Allow selecting the same file again.
        e.target.value = '';
    };

    return (
        <div className="modal-overlay fade-in">
            {isLoading && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                    <p>解析中...</p>
                    {progressLog.length > 0 && (
                        <div className="progress-log-container">
                            <div className="progress-log">
                                {progressLog.map((log, index) => (
                                    <div key={index} className="log-entry">
                                        <span className="log-message">{log}</span>
                                    </div>
                                ))}
                                <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })} />
                            </div>
                        </div>
                    )}
                    <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'center' }}>
                        <Button type="button" variant="secondary" onClick={() => cancelAnalyze()}>
                            中断
                        </Button>
                    </div>
                </div>
            )}

            <Card className="import-modal-card">
                <h3 className="modal-title">
                    {mode === 'confirm-translation' ? '翻訳の確認' : 'レシピを取り込む'}
                </h3>

                {mode === 'confirm-translation' ? (
                    <div className="translation-confirm-content">
                        <div style={{ textAlign: 'center', padding: '1rem 0', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌐 ⇄ 🇯🇵</div>
                            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>日本語以外のレシピを検出しました</p>
                            <p style={{ fontSize: '0.9rem', color: '#666' }}>
                                日本語に翻訳して取り込みますか？<br />
                                <span style={{ fontSize: '0.8rem' }}>(DeepL翻訳を使用)</span>
                            </p>
                        </div>
                        <div className="modal-actions" style={{ flexDirection: 'column', gap: '8px' }}>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={() => handleConfirmTranslation(true)}
                                isLoading={isLoading}
                                style={{ width: '100%' }}
                            >
                                翻訳して取り込む
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => handleConfirmTranslation(false)}
                                disabled={isLoading}
                                style={{ width: '100%' }}
                            >
                                原文のまま取り込む
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="import-mode-tabs">
                            <button
                                type="button"
                                onClick={() => setMode('url')}
                                className={`tab-btn tab-import-web ${mode === 'url' ? 'active' : ''}`}
                            >
                                🌐 Web URL
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('image')}
                                className={`tab-btn tab-import-image ${mode === 'image' ? 'active' : ''}`}
                            >
                                📷 画像解析 (Best Effort)
                            </button>
                        </div>

                        {mode === 'url' ? (
                            <>
                                <p>レシピサイトのURLを入力してください。</p>
                                <input
                                    type="url"
                                    placeholder="https://..."
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="import-url-input"
                                    autoFocus
                                />
                            </>
                        ) : (
                            <>
                                <p>レシピの画像（スクリーンショットや写真）をアップロードしてください。スマホはカメラで撮影して取り込めます。</p>
                                <div className="image-upload-wrapper">
                                    <input
                                        ref={cameraInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleFileChange}
                                        className="image-upload-input"
                                    />
                                    <input
                                        ref={galleryInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="image-upload-input"
                                    />
                                    <div
                                        onDragEnter={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDragOver={handleDrag}
                                        onDrop={handleDrop}
                                        className={`image-upload-label ${isDragActive ? 'drag-active' : ''}`}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                            if (isLoading || isImagePreparing) return;
                                            openGalleryPicker();
                                        }}
                                        onKeyDown={(e) => {
                                            if (isLoading || isImagePreparing) return;
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                openGalleryPicker();
                                            }
                                        }}
                                    >
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="image-upload-preview" />
                                        ) : (
                                            isDragActive ? "ここに画像をドロップ" : "カメラで撮影、または写真から選択"
                                        )}
                                    </div>
                                    <div className="image-upload-actions">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={openCameraPicker}
                                            disabled={isLoading || isImagePreparing}
                                        >
                                            カメラで撮影
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={openGalleryPicker}
                                            disabled={isLoading || isImagePreparing}
                                        >
                                            写真から選択
                                        </Button>
                                    </div>
                                </div>
                                {isImagePreparing && (
                                    <p style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>画像を最適化しています...</p>
                                )}
                            </>
                        )}

                        {error && <p className="error-text">{error}</p>}

                        <div className="modal-actions">
                            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>キャンセル</Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={handleImport}
                                isLoading={isLoading}
                                disabled={isImagePreparing || (mode === 'url' ? !url : !imageFile)}
                            >
                                取り込む
                            </Button>
                        </div>
                    </>
                )}
            </Card>
        </div >
    );
};
