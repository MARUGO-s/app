import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Card } from './Card';
import { Button } from './Button';
import './ImportModal.css';

export const ImportModal = ({ onClose, onImport, initialMode = 'url' }) => {
    const [mode, setMode] = useState(initialMode); // 'url' | 'image' | 'confirm-translation'
    const [pendingRecipe, setPendingRecipe] = useState(null);
    const [scrapedUrl, setScrapedUrl] = useState('');
    const [url, setUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);

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
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
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
            alert("翻訳に失敗しました。元の言語のまま取り込みます。");
            return recipe;
        }
    };

    // State for streaming logs
    const [progressLog, setProgressLog] = useState([]);

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
                const formData = new FormData();
                formData.append('image', imageFile);

                // Use fetch directly for streaming support (Supabase client doesn't support streaming easily yet)
                const { data: { session } } = await supabase.auth.getSession();
                const functionUrl = `${supabase.supabaseUrl}/functions/v1/analyze-image`;

                const headers = {
                    'Authorization': `Bearer ${session?.access_token || supabase.supabaseKey}`
                };

                const response = await fetch(functionUrl, {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Server Error: ${response.statusText}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let recipeResult = null;
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');

                    // Keep the last part in buffer as it might be incomplete
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
                                } else if (eventData.type === 'error') {
                                    throw new Error(eventData.message);
                                }
                            } catch (e) {
                                console.warn("Failed to parse SSE event", e);
                            }
                        }
                    }
                }

                if (!recipeResult) {
                    throw new Error("ストリームが終了しましたが、結果が受信できませんでした。");
                }
                data = recipeResult;
                // data.recipe is already inside recipeResult from backend (eventData.recipe)
            }

            if (data.error) throw new Error(data.error);
            if (!data.recipe) throw new Error("No recipe found");

            let finalRecipe = data.recipe;

            // Normalize fields to ensure compatibility (backend might return title/servings or name/recipeYield)
            finalRecipe.name = finalRecipe.name || finalRecipe.title || '';
            finalRecipe.recipeYield = finalRecipe.recipeYield || finalRecipe.servings || '';
            // Ensure consistency for other components
            finalRecipe.description = finalRecipe.description || '';

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
            const msg = err.message || "Import failed. Please try again.";
            setError(msg);
        } finally {
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
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
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
                                <p>レシピの画像（スクリーンショットや写真）をアップロードしてください。</p>
                                <div className="image-upload-wrapper">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        id="recipe-image-upload"
                                        className="image-upload-input"
                                    />
                                    <label
                                        htmlFor="recipe-image-upload"
                                        onDragEnter={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDragOver={handleDrag}
                                        onDrop={handleDrop}
                                        className={`image-upload-label ${isDragActive ? 'drag-active' : ''}`}
                                    >
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="image-upload-preview" />
                                        ) : (
                                            isDragActive ? "ここに画像をドロップ" : "クリックして画像を選択、またはドラッグ＆ドロップ"
                                        )}
                                    </label>
                                </div>
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
                                disabled={mode === 'url' ? !url : !imageFile}
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

