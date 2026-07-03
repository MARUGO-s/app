const e=`import React, { useEffect, useRef, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../supabase';
import { Card } from './Card';
import { Button } from './Button';
import { useToast } from '../contexts/useToast';
import { parseRecipePdfFile } from '../utils/parseRecipePdf';
import { normalizeImportedRecipe } from '../utils/importedRecipeMapper';
import { RECIPE_CATEGORY_OPTIONS, normalizeRecipeCategory } from '../constants/recipeCategories';
import './ImportModal.css';

export const ImportModal = ({ onClose, onImport, onImportBatch, initialMode = 'url' }) => {
    const toast = useToast();
    const [mode, setMode] = useState(initialMode); // 'url' | 'image' | 'pdf' | 'pdf-preview' | 'confirm-translation'
    const [pendingRecipe, setPendingRecipe] = useState(null);
    const [pendingImportOptions, setPendingImportOptions] = useState(null);
    const [scrapedUrl, setScrapedUrl] = useState('');
    const [url, setUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [pdfFile, setPdfFile] = useState(null);
    const [pdfRecipes, setPdfRecipes] = useState([]);
    const [pdfSelected, setPdfSelected] = useState(() => new Set());
    // 抽出した各レシピのカテゴリ（AI分類を初期値とし、プレビューで修正可能）。pdfRecipes と同じ index で対応。
    const [pdfCategories, setPdfCategories] = useState([]);
    // 登録方法: 'separate'（それぞれ独立したレシピ）/ 'merge'（1つのレシピに統合してパーツごとにセクション分け）
    const [pdfRegisterMode, setPdfRegisterMode] = useState('separate');
    const [pdfMergeTitle, setPdfMergeTitle] = useState('');
    const [pdfMergeCategory, setPdfMergeCategory] = useState('');
    const [importAsBreadPdf, setImportAsBreadPdf] = useState(false);
    const [importAsBread, setImportAsBread] = useState(false);
    // Image analysis engine preference. This is only a hint; the server may still fall back.
    // - groq: Groq (Vision) first. If it fails and Azure OCR is configured, do OCR -> Groq (Text).
    // - auto: best-effort. Groq -> (Azure OCR -> Groq) -> Gemini last.
    // - gemini: Gemini only (better for handwriting, higher cost).
    // - groq_vision: Groq (Vision) only (no OCR). Fast/cheap, but handwriting may be weaker.
    const DEFAULT_IMAGE_ENGINE = 'groq';
    const [imageEngine, setImageEngine] = useState(() => {
        try {
            const saved = localStorage.getItem('preferredImageEngine');
            // Force 'groq' as default if the user previously had 'auto' (Best Effort) selected
            if (!saved || saved === 'auto') {
                return DEFAULT_IMAGE_ENGINE;
            }
            return saved;
        } catch {
            return DEFAULT_IMAGE_ENGINE;
        }
    });
    const [isImagePreparing, setIsImagePreparing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const [isPdfDragActive, setIsPdfDragActive] = useState(false);
    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const pdfInputRef = useRef(null);
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

    useEffect(() => {
        try {
            localStorage.setItem('preferredImageEngine', imageEngine);
        } catch {
            // ignore (private mode, etc.)
        }
    }, [imageEngine]);

    useEffect(() => {
        setIsDragActive(false);
        setIsPdfDragActive(false);
    }, [mode]);

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
                    .replace(/\\.[^/.]+$/, '')
                    .slice(0, 80);

                resolveOnce(new File([blob], \`\${baseName}.jpg\`, { type: 'image/jpeg' }));
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

    const getFileExtension = (fileName) => {
        const name = String(fileName || '').trim();
        const idx = name.lastIndexOf('.');
        if (idx < 0 || idx === name.length - 1) return '';
        return name.slice(idx + 1).toLowerCase();
    };

    const isPdfFileSync = (file) => {
        if (!(file instanceof File)) return false;
        const mimeType = String(file.type || '').split(';')[0].trim().toLowerCase();
        const ext = getFileExtension(file.name);
        if (mimeType === 'application/pdf' || ext === 'pdf') return true;
        if (
            (mimeType === 'application/octet-stream' || mimeType === 'binary/octet-stream' || mimeType === '')
            && ext === 'pdf'
        ) {
            return true;
        }
        return false;
    };

    const isPdfFile = async (file) => {
        if (isPdfFileSync(file)) return true;
        try {
            const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
            return header.length >= 4
                && header[0] === 0x25
                && header[1] === 0x50
                && header[2] === 0x44
                && header[3] === 0x46;
        } catch {
            return false;
        }
    };

    const normalizePdfFile = (file) => {
        if (!(file instanceof File)) return file;
        const mimeType = String(file.type || '').split(';')[0].trim().toLowerCase();
        if (mimeType === 'application/pdf' && /\\.pdf$/i.test(String(file.name || ''))) {
            return file;
        }
        const baseName = String(file.name || 'recipe')
            .replace(/[\\\\/]+$/, '')
            .replace(/\\.[^.\\\\/]+$/, '')
            || 'recipe';
        const nextName = /\\.pdf$/i.test(String(file.name || '')) ? file.name : \`\${baseName}.pdf\`;
        return new File([file], nextName, {
            type: 'application/pdf',
            lastModified: file.lastModified,
        });
    };

    const setSelectedPdfFile = async (file) => {
        if (!file) return;
        const maxBytes = 20 * 1024 * 1024;
        if (file.size > maxBytes) {
            setError('PDFは20MB以下にしてください。');
            return;
        }
        if (!(await isPdfFile(file))) {
            setError('PDFファイルを選択してください。');
            return;
        }
        setPdfFile(normalizePdfFile(file));
        setPdfRecipes([]);
        setPdfSelected(new Set());
        setPdfCategories([]);
        setPdfRegisterMode('separate');
        setPdfMergeTitle('');
        setPdfMergeCategory('');
        setError(null);
    };

    const openPdfPicker = () => {
        if (isLoading) return;
        pdfInputRef.current?.click?.();
    };

    const handlePdfDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsPdfDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsPdfDragActive(false);
        }
    };

    const handlePdfDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsPdfDragActive(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) void setSelectedPdfFile(file);
    };

    // Helper to detect if text contains Japanese
    const hasJapanese = (text) => {
        return /[ぁ-んァ-ン一-龠]/.test(text || '');
    };

    const getStepText = (step) => {
        if (typeof step === 'string') return step.trim();
        if (step && typeof step === 'object') {
            return String(step.text || step.name || '').trim();
        }
        return '';
    };

    const translateRecipe = async (recipe) => {
        // Prepare text array for batch translation
        const textsToTranslate = [];

        // 1. Title
        textsToTranslate.push((recipe.name || recipe.title || '').trim());
        // 2. Description
        textsToTranslate.push((recipe.description || '').trim());

        // 3. Ingredients names
        const ingredientIndices = [];
        if (Array.isArray(recipe.ingredients)) {
            recipe.ingredients.forEach((ing, idx) => {
                if (typeof ing === 'string') {
                    const text = ing.trim();
                    if (!text) return;
                    textsToTranslate.push(text);
                    ingredientIndices.push(idx);
                    return;
                }
                const text = String(ing?.name || ing?.text || '').trim();
                if (text) {
                    textsToTranslate.push(text);
                    ingredientIndices.push(idx);
                }
            });
        }

        // 4. Steps
        const stepIndices = [];
        if (Array.isArray(recipe.steps)) {
            recipe.steps.forEach((step, idx) => {
                const stepText = getStepText(step);
                if (!stepText) return;
                textsToTranslate.push(stepText);
                stepIndices.push(idx);
            });
        }

        if (!textsToTranslate.some(text => String(text || '').trim())) return recipe;

        // Always refresh to ensure a valid JWT (DeepL proxy requires verify_jwt=true).
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        const session = refreshData?.session;
        if (refreshErr || !session?.access_token) {
            const msg = refreshErr?.message || '';
            const needReLogin = /refresh_token|session|expired|invalid|not found/i.test(msg);
            throw new Error(needReLogin
                ? 'セッションの有効期限が切れています。一度ログアウトしてから再ログインしてください。'
                : (msg || 'ログイン情報が取得できませんでした。再ログインしてください。'));
        }

        const functionUrl = \`\${SUPABASE_URL}/functions/v1/translate\`;
        const res = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': \`Bearer \${session.access_token}\`,
            },
            body: JSON.stringify({
                text: textsToTranslate,
                target_lang: 'JA',
            }),
        });

        if (!res.ok) {
            const status = res.status;
            if (status === 401) {
                throw new Error('認証の有効期限が切れています。一度ログアウトしてから再ログインしてください。');
            }
            let detail = '';
            try {
                const text = await res.text();
                if (text) {
                    try {
                        const parsed = JSON.parse(text);
                        detail = parsed?.error || parsed?.message || text;
                    } catch {
                        detail = text;
                    }
                }
            } catch {
                // ignore
            }
            throw new Error(detail || \`翻訳に失敗しました（エラー: \${status}）。\`);
        }

        const data = await res.json();
        if (data && data.error) {
            throw new Error(String(data.error));
        }
        if (!Array.isArray(data?.translations)) {
            throw new Error('翻訳の応答が不正です。');
        }

        const translatedTexts = data.translations.map(t => t.text);

        // Reconstruct recipe
        let cursor = 0;
        const newRecipe = { ...recipe };

        // 1. Title
        const translatedTitle = translatedTexts[cursor++] || newRecipe.name || newRecipe.title || '';
        newRecipe.name = translatedTitle;
        newRecipe.title = translatedTitle;
        // 2. Description
        newRecipe.description = translatedTexts[cursor++] || newRecipe.description;

        // 3. Ingredients
        if (ingredientIndices.length > 0) {
            const translatedIngredientMap = new Map();
            ingredientIndices.forEach((index, offset) => {
                translatedIngredientMap.set(index, translatedTexts[cursor + offset]);
            });
            newRecipe.ingredients = newRecipe.ingredients.map((ing, idx) => {
                const translated = translatedIngredientMap.get(idx);
                if (!translated) return ing;
                if (typeof ing === 'string') {
                    return translated;
                }
                if (ing && typeof ing === 'object') {
                    return { ...ing, name: translated };
                }
                return ing;
            });
            cursor += ingredientIndices.length;
        }

        // 4. Steps
        if (stepIndices.length > 0) {
            const translatedStepMap = new Map();
            stepIndices.forEach((index, offset) => {
                translatedStepMap.set(index, translatedTexts[cursor + offset]);
            });
            newRecipe.steps = newRecipe.steps.map((step, idx) => {
                const translated = translatedStepMap.get(idx);
                if (!translated) return step;
                if (step && typeof step === 'object') {
                    return { ...step, text: translated };
                }
                return translated;
            });
        }

        return newRecipe;
    };

    // State for streaming logs
    const [progressLog, setProgressLog] = useState([]);

    const getSelectedPdfRecipes = () => pdfRecipes.filter((_, index) => pdfSelected.has(index));

    const handlePdfFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) void setSelectedPdfFile(file);
        e.target.value = '';
    };

    const handleParsePdf = async () => {
        if (!pdfFile) return;
        setIsLoading(true);
        setError(null);
        setProgressLog(['PDFを解析しています…（複数レシピの抽出には1〜2分かかることがあります）']);
        try {
            const { recipes, partial, warning } = await parseRecipePdfFile(pdfFile);
            setPdfRecipes(recipes);
            setPdfSelected(new Set(recipes.map((_, index) => index)));
            // AIが返した category を正規化して各レシピの既定カテゴリにする（無ければタイトル等から推測）。
            const cats = recipes.map((r) => normalizeRecipeCategory(r?.category, r));
            setPdfCategories(cats);
            // 「1つに統合」時の既定値: 名前=親デザート名（無ければ各パーツ名を連結）、カテゴリ=最頻カテゴリ
            const parentDish = recipes.map((r) => String(r?.dishName || '').trim()).find(Boolean) || '';
            const joinedTitles = recipes.map((r) => r?.title || r?.name).filter(Boolean).join(' / ');
            setPdfMergeTitle(parentDish || joinedTitles);
            const freq = {};
            cats.forEach((c) => { freq[c] = (freq[c] || 0) + 1; });
            setPdfMergeCategory(cats.slice().sort((a, b) => (freq[b] || 0) - (freq[a] || 0))[0] || 'デザート・お菓子');
            setPdfRegisterMode('separate');
            setMode('pdf-preview');
            if (partial && warning) {
                toast.warning(warning);
            }
            toast.success(\`\${recipes.length}件のレシピを検出しました\`);
        } catch (err) {
            console.error(err);
            setError(err?.message || 'PDFの解析に失敗しました');
        } finally {
            setIsLoading(false);
            setProgressLog([]);
        }
    };

    const togglePdfRecipeSelection = (index) => {
        setPdfSelected((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const setPdfCategory = (index, value) => {
        setPdfCategories((prev) => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    const handlePdfImportToForm = () => {
        const selectedIndexes = pdfRecipes.map((_, i) => i).filter((i) => pdfSelected.has(i));
        if (selectedIndexes.length !== 1) {
            setError('編集画面へ反映するには、レシピを1件だけ選択してください');
            return;
        }
        const idx = selectedIndexes[0];
        const importOptions = { mode: 'pdf', recipeType: importAsBreadPdf ? 'bread' : 'normal' };
        const finalRecipe = normalizeImportedRecipe(pdfRecipes[idx]);
        finalRecipe.category = pdfCategories[idx] || normalizeRecipeCategory(pdfRecipes[idx]?.category, pdfRecipes[idx]);
        finalRecipe.dishName = String(pdfRecipes[idx]?.dishName || '').trim();
        onImport(finalRecipe, \`pdf:\${pdfFile?.name || ''}\`, importOptions);
        onClose();
    };

    // 選択した複数パーツを「1つのレシピ」に統合する。各パーツはパーツ名のセクション（group）として
    // 材料・手順を分けて保持する（既存のグループ機能で表示・原価計算に対応）。
    const buildMergedRecipe = (selectedIndexes) => {
        const title = (pdfMergeTitle || '').trim()
            || selectedIndexes.map((i) => pdfRecipes[i]?.title || pdfRecipes[i]?.name).filter(Boolean).join(' / ');
        const category = pdfMergeCategory
            || normalizeRecipeCategory(pdfRecipes[selectedIndexes[0]]?.category, pdfRecipes[selectedIndexes[0]]);
        const ingredients = [];
        const steps = [];
        const descParts = [];
        selectedIndexes.forEach((i, order) => {
            const part = normalizeImportedRecipe(pdfRecipes[i]);
            const sectionName = String(part.title || part.name || \`パーツ\${order + 1}\`).trim();
            (Array.isArray(part.ingredients) ? part.ingredients : []).forEach((ing) => {
                ingredients.push({ ...ing, group: sectionName });
            });
            (Array.isArray(part.steps) ? part.steps : []).forEach((s) => {
                const text = typeof s === 'string' ? s : (s?.text || '');
                if (text) steps.push({ text, group: sectionName });
            });
            const desc = String(part.description || '').trim();
            if (desc) descParts.push(\`【\${sectionName}】\\n\${desc}\`);
        });
        return {
            title,
            name: title,
            category,
            dishName: title,
            description: descParts.join('\\n\\n'),
            ingredients,
            steps,
        };
    };

    const handlePdfMergeRegister = async ({ toForm = false } = {}) => {
        const selectedIndexes = pdfRecipes.map((_, i) => i).filter((i) => pdfSelected.has(i));
        if (selectedIndexes.length === 0) {
            setError('統合するレシピを1件以上選択してください');
            return;
        }
        const merged = buildMergedRecipe(selectedIndexes);
        if (!merged.title) {
            setError('統合後のレシピ名を入力してください');
            return;
        }
        // 統合は常に通常レシピ（パン用分割は行わない）
        const importOptions = { mode: 'pdf', recipeType: 'normal' };

        if (toForm || !onImportBatch) {
            onImport(normalizeImportedRecipe(merged), \`pdf:\${pdfFile?.name || ''}\`, importOptions);
            onClose();
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            await onImportBatch([merged], importOptions, \`pdf:\${pdfFile?.name || ''}\`);
            onClose();
        } catch (err) {
            console.error(err);
            setError(err?.message || '統合登録に失敗しました');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePdfRegisterBatch = async () => {
        const selected = getSelectedPdfRecipes();
        if (selected.length === 0) {
            setError('登録するレシピを1件以上選択してください');
            return;
        }
        if (!onImportBatch) {
            if (selected.length === 1) {
                handlePdfImportToForm();
                return;
            }
            setError('一括登録は一覧画面の「PDFから追加」から利用してください');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const importOptions = { mode: 'pdf', recipeType: importAsBreadPdf ? 'bread' : 'normal' };
            const selectedIndexes = pdfRecipes.map((_, i) => i).filter((i) => pdfSelected.has(i));
            const normalized = selectedIndexes.map((i) => {
                const rec = normalizeImportedRecipe(pdfRecipes[i]);
                rec.category = pdfCategories[i] || normalizeRecipeCategory(pdfRecipes[i]?.category, pdfRecipes[i]);
                rec.dishName = String(pdfRecipes[i]?.dishName || '').trim();
                return rec;
            });
            await onImportBatch(normalized, importOptions, \`pdf:\${pdfFile?.name || ''}\`);
            onClose();
        } catch (err) {
            console.error(err);
            setError(err?.message || '一括登録に失敗しました');
        } finally {
            setIsLoading(false);
        }
    };

    const handleImport = async () => {
        setIsLoading(true);
        setError(null);
        setProgressLog([]); // Reset logs

        try {
            let data;
            let currentUrl = '';
            let importOptions = mode === 'image'
                ? { mode: 'image', recipeType: importAsBread ? 'bread' : 'normal' }
                : { mode: 'url' };

            if (mode === 'url') {
                if (!url) return;
                currentUrl = url;

                // 有効なトークンを取得し、fetch で明示的にヘッダに付けて呼ぶ（invoke ではトークンが届かない場合があるため）
                const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
                const session = refreshData?.session;
                if (refreshErr || !session?.access_token) {
                    const msg = refreshErr?.message || '';
                    const needReLogin = /refresh_token|session|expired|invalid|not found/i.test(msg);
                    throw new Error(needReLogin
                        ? 'セッションの有効期限が切れています。一度ログアウトしてから再ログインしてください。'
                        : (msg || 'ログイン情報が取得できませんでした。再ログインしてください。'));
                }

                const functionUrl = \`\${SUPABASE_URL}/functions/v1/scrape-recipe\`;
                const res = await fetch(functionUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': \`Bearer \${session.access_token}\`,
                    },
                    body: JSON.stringify({ url }),
                });

                if (!res.ok) {
                    const status = res.status;
                    if (status === 401) {
                        throw new Error('認証の有効期限が切れています。一度ログアウトしてから再ログインしてください。');
                    }
                    if (status === 403) {
                        throw new Error('このURLへのアクセスが拒否されました。サイトの利用規約をご確認ください。');
                    }
                    if (status >= 500) {
                        throw new Error('サーバーで一時的なエラーが発生しました。しばらく経ってからお試しください。');
                    }
                    let detail = '';
                    try {
                        const text = await res.text();
                        if (text) {
                            try {
                                const parsed = JSON.parse(text);
                                detail = parsed?.error || parsed?.message || text;
                            } catch {
                                detail = text;
                            }
                        }
                    } catch {
                        // ignore
                    }
                    throw new Error(detail || \`URLの取得に失敗しました（エラー: \${status}）。\`);
                }

                const resData = await res.json();
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

                // Edge Function 経由のみで画像解析（Gemini/Azureなどの外部APIキーはサーバー側で管理）
                setProgressLog(prev => [...prev, '🔄 サーバー経由で解析中...']);

                const formData = new FormData();
                formData.append('image', imageFile);
                formData.append('engine', imageEngine);

                // 必ずログイン先と同じプロジェクトのURL・キーを使う（プロジェクト不一致で Invalid JWT にならないように）
                const supabaseUrl = SUPABASE_URL;
                const anonKey = SUPABASE_ANON_KEY;
                const functionUrl = \`\${supabaseUrl}/functions/v1/analyze-image\`;

                // 有効なJWTを送るため、先にセッションを更新。失敗したら古いトークンは送らず再ログインを促す
                const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
                const session = refreshData?.session;
                if (refreshErr || !session?.access_token) {
                    const msg = refreshErr?.message || '';
                    const needReLogin = /refresh_token|session|expired|invalid/i.test(msg);
                    throw new Error(needReLogin
                        ? 'セッションの有効期限が切れています。一度ログアウトしてから再ログインしてください。'
                        : (msg || 'ログイン情報が取得できませんでした。再ログインしてください。'));
                }

                const bearerToken = session.access_token;
                const headers = {
                    'apikey': anonKey,
                    'Authorization': \`Bearer \${bearerToken}\`,
                    // ゲートウェイ経由で Authorization が落ちる環境向けのフォールバック（関数側で検証）
                    'X-User-JWT': bearerToken,
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

                // If the token expired/was invalid, refresh session and retry once.
                if (response.status === 401) {
                    let detail = '';
                    try {
                        detail = await response.text();
                    } catch {
                        // ignore
                    }

                    const shouldRetry = /invalid\\s+jwt|jwt\\s+expired|token\\s+expired/i.test(String(detail || ''));
                    if (shouldRetry) {
                        try {
                            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
                            const nextSession = refreshed?.session;
                            if (refreshError || !nextSession?.access_token) {
                                throw refreshError || new Error('No session after refresh');
                            }

                            const nextToken = nextSession.access_token;
                            headers.Authorization = \`Bearer \${nextToken}\`;
                            headers['X-User-JWT'] = nextToken;
                            response = await fetch(functionUrl, {
                                method: 'POST',
                                headers: headers,
                                body: formData,
                                signal: controller.signal
                            });
                        } catch (e) {
                            console.warn('Session refresh failed:', e);
                            throw new Error('セッションの有効期限が切れました。再ログインしてください。');
                        }
                    }
                }

                if (!response.ok) {
                    const status = response.status;
                    let detail = '';
                    try {
                        const text = await response.text();
                        if (text) {
                            try {
                                const parsed = JSON.parse(text);
                                detail = parsed?.message || parsed?.error || text;
                            } catch {
                                detail = text;
                            }
                        }
                    } catch {
                        // ignore
                    }
                    if (status === 401 && /invalid\\s+jwt|jwt/i.test(String(detail || ''))) {
                        throw new Error('認証エラーです（Invalid JWT）。再ログイン後に再試行してください。改善しない場合は、接続先プロジェクトの不一致がないか確認してください。');
                    }
                    const suffix = detail ? \`: \${detail}\` : '';
                    throw new Error(\`Server Error (\${status})\${suffix}\`);
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
                        const lines = buffer.split('\\n\\n');
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

            if (data.error) throw new Error(data.error);
            if (!data.recipe) throw new Error("No recipe found");

            const finalRecipe = normalizeImportedRecipe(data.recipe);

            // Check for foreign language (lack of Japanese) in Name or Steps
            // We check name and first few steps
            const previewSteps = Array.isArray(finalRecipe.steps)
                ? finalRecipe.steps.slice(0, 3).map(step => getStepText(step)).join('')
                : '';
            const sampleText = \`\${finalRecipe.name || finalRecipe.title || ''}\${previewSteps}\`;

            if (sampleText && !hasJapanese(sampleText)) {
                // Switch to confirmation mode instead of window.confirm
                setPendingRecipe(finalRecipe);
                setPendingImportOptions(importOptions);
                setScrapedUrl(currentUrl);
                setMode('confirm-translation');
                setIsLoading(false); // Stop loading to show UI
                return;
            }

            onImport(finalRecipe, currentUrl, importOptions);
            onClose();

        } catch (err) {
            console.error("Import failed details:", err);
            if (err?.name === 'AbortError') {
                // Cancel/timeout sets a user-facing message via \`cancelAnalyze\`.
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
        setError(null);
        try {
            let finalRecipe = pendingRecipe;
            if (shouldTranslate) {
                finalRecipe = await translateRecipe(pendingRecipe);
            }
            onImport(finalRecipe, scrapedUrl, pendingImportOptions || {});
            onClose();
        } catch (err) {
            console.error("Translation flow error:", err);
            const msg = err?.message || '翻訳に失敗しました。';
            setError(msg);
            toast.warning(msg);
            // Keep the modal open so the user can retry or choose "原文のまま取り込む".
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
                <div className="analyze-status-popup" role="status" aria-live="polite">
                    <div className="analyze-status-popup-inner">
                        <div className="spinner"></div>
                        <p className="analyze-status-title">解析中...</p>
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
                        <div className="analyze-status-actions">
                            <Button type="button" variant="secondary" onClick={() => cancelAnalyze()}>
                                中断
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <Card className="import-modal-card">
                <h3 className="modal-title">
                    {mode === 'confirm-translation'
                        ? '翻訳の確認'
                        : mode === 'pdf-preview'
                            ? 'PDFから抽出したレシピ'
                            : 'レシピを取り込む'}
                </h3>

                {mode === 'pdf-preview' ? (
                    <>
                        <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '12px' }}>
                            {pdfFile?.name && <span>ファイル: {pdfFile.name}<br /></span>}
                            {pdfRecipes.length}件を検出しました。登録方法を選び、登録するレシピにチェックを入れてください。
                        </p>
                        <div className="pdf-register-mode">
                            <div className="pdf-register-mode-title">登録方法</div>
                            <label className={\`pdf-register-mode-option \${pdfRegisterMode === 'separate' ? 'active' : ''}\`}>
                                <input
                                    type="radio"
                                    name="pdfRegisterMode"
                                    checked={pdfRegisterMode === 'separate'}
                                    onChange={() => { setPdfRegisterMode('separate'); setError(null); }}
                                />
                                <span>
                                    <strong>それぞれ独立したレシピとして登録</strong>
                                    <small>各パーツを別々のレシピに（カテゴリ別）</small>
                                </span>
                            </label>
                            <label className={\`pdf-register-mode-option \${pdfRegisterMode === 'merge' ? 'active' : ''}\`}>
                                <input
                                    type="radio"
                                    name="pdfRegisterMode"
                                    checked={pdfRegisterMode === 'merge'}
                                    onChange={() => { setPdfRegisterMode('merge'); setError(null); }}
                                />
                                <span>
                                    <strong>1つのレシピに統合</strong>
                                    <small>選択したパーツを1レシピにまとめ、パーツごとにセクション分け</small>
                                </span>
                            </label>
                        </div>
                        {pdfRegisterMode === 'merge' && (
                            <div className="pdf-merge-settings">
                                <label className="pdf-merge-field">
                                    <span>統合後のレシピ名</span>
                                    <input
                                        type="text"
                                        value={pdfMergeTitle}
                                        onChange={(e) => setPdfMergeTitle(e.target.value)}
                                        placeholder="例: 桃のコンポート / フローズンヨーグルト / クランブル"
                                    />
                                </label>
                                <label className="pdf-merge-field">
                                    <span>カテゴリ</span>
                                    <select
                                        value={pdfMergeCategory}
                                        onChange={(e) => setPdfMergeCategory(e.target.value)}
                                    >
                                        {RECIPE_CATEGORY_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        )}
                        <div className="pdf-recipe-preview-list">
                            {pdfRecipes.map((recipe, index) => {
                                const ingCount = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
                                const stepCount = Array.isArray(recipe.steps) ? recipe.steps.length : 0;
                                const checked = pdfSelected.has(index);
                                const dishName = String(recipe.dishName || '').trim();
                                const category = pdfCategories[index] || '';
                                return (
                                    <div
                                        key={\`pdf-recipe-\${index}\`}
                                        className={\`pdf-recipe-preview-item \${checked ? 'is-selected' : ''}\`}
                                    >
                                        <label className="pdf-recipe-preview-main">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => togglePdfRecipeSelection(index)}
                                            />
                                            <div className="pdf-recipe-preview-body">
                                                <div className="pdf-recipe-preview-title">
                                                    {recipe.title || recipe.name || \`レシピ \${index + 1}\`}
                                                </div>
                                                <div className="pdf-recipe-preview-meta">
                                                    材料 {ingCount} / 手順 {stepCount}
                                                    {(recipe.description || '').trim() ? ' / 説明あり' : ''}
                                                </div>
                                                {dishName && (
                                                    <div className="pdf-recipe-preview-dish">🍽 {dishName}</div>
                                                )}
                                            </div>
                                        </label>
                                        {pdfRegisterMode === 'separate' ? (
                                            <div className="pdf-recipe-preview-category">
                                                <span className="pdf-recipe-category-label">カテゴリ</span>
                                                <select
                                                    className="pdf-recipe-category-select"
                                                    value={category}
                                                    onChange={(e) => setPdfCategory(index, e.target.value)}
                                                >
                                                    {RECIPE_CATEGORY_OPTIONS.map((opt) => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : (
                                            checked && (
                                                <div className="pdf-recipe-preview-section">
                                                    セクション「{recipe.title || recipe.name || \`パーツ \${index + 1}\`}」として統合
                                                </div>
                                            )
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {error && (
                            <div className="error-text pdf-preview-error">{error}</div>
                        )}
                        <div className="modal-actions" style={{ flexDirection: 'column', gap: '8px' }}>
                            {pdfRegisterMode === 'merge' ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={() => handlePdfMergeRegister({ toForm: false })}
                                        isLoading={isLoading}
                                        disabled={pdfSelected.size === 0}
                                        style={{ width: '100%' }}
                                    >
                                        選択した{pdfSelected.size}件を1つのレシピに統合して登録
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => handlePdfMergeRegister({ toForm: true })}
                                        disabled={isLoading || pdfSelected.size === 0}
                                        style={{ width: '100%' }}
                                    >
                                        統合して編集画面で確認
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handlePdfRegisterBatch}
                                        isLoading={isLoading}
                                        disabled={pdfSelected.size === 0}
                                        style={{ width: '100%' }}
                                    >
                                        選択した{pdfSelected.size}件を登録
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handlePdfImportToForm}
                                        disabled={isLoading || pdfSelected.size !== 1}
                                        style={{ width: '100%' }}
                                    >
                                        1件を編集画面へ反映
                                    </Button>
                                </>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => { setMode('pdf'); setError(null); }}
                                disabled={isLoading}
                                style={{ width: '100%' }}
                            >
                                戻る
                            </Button>
                        </div>
                    </>
                ) : mode === 'confirm-translation' ? (
                    <div className="translation-confirm-content">
                        <div style={{ textAlign: 'center', padding: '1rem 0', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌐 ⇄ 🇯🇵</div>
                            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>日本語以外のレシピを検出しました</p>
                            <p style={{ fontSize: '0.9rem', color: '#666' }}>
                                日本語に翻訳して取り込みますか？<br />
                                <span style={{ fontSize: '0.8rem' }}>(DeepL翻訳を使用)</span>
                            </p>
                        </div>
                        {error && (
                            <div className="error-text" style={{
                                color: '#d32f2f',
                                background: '#ffebee',
                                padding: '10px',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                wordBreak: 'break-word',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                marginBottom: '12px',
                            }}>
                                {error}
                            </div>
                        )}
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
                                className={\`tab-btn tab-import-web \${mode === 'url' ? 'active' : ''}\`}
                            >
                                🌐 Web URL
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('image')}
                                className={\`tab-btn tab-import-image \${mode === 'image' ? 'active' : ''}\`}
                            >
                                📷 画像解析
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('pdf')}
                                className={\`tab-btn tab-import-pdf \${mode === 'pdf' ? 'active' : ''}\`}
                            >
                                📄 PDF
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
                        ) : mode === 'pdf' ? (
                            <>
                                <p>
                                    複数レシピが載ったPDFから、料理名・材料・作り方を抽出して登録します。「歴史と起源」などの節がある場合は説明欄に入ります。
                                    解析には1〜2分かかることがあります（20MB以下）。
                                </p>
                                <div className="image-target-panel">
                                    <div className="image-target-label">取り込み先タイプ</div>
                                    <div className="image-target-buttons">
                                        <button
                                            type="button"
                                            className={\`image-target-btn \${!importAsBreadPdf ? 'active' : ''}\`}
                                            onClick={() => setImportAsBreadPdf(false)}
                                            disabled={isLoading}
                                        >
                                            通常
                                        </button>
                                        <button
                                            type="button"
                                            className={\`image-target-btn image-target-btn-bread \${importAsBreadPdf ? 'active' : ''}\`}
                                            onClick={() => setImportAsBreadPdf(true)}
                                            disabled={isLoading}
                                        >
                                            {importAsBreadPdf ? '☑ パン用' : '☐ パン用'}
                                        </button>
                                    </div>
                                </div>
                                <div
                                    className={\`pdf-upload-wrapper \${isPdfDragActive ? 'drag-active' : ''}\`}
                                    onDragEnter={handlePdfDrag}
                                    onDragLeave={handlePdfDrag}
                                    onDragOver={handlePdfDrag}
                                    onDrop={handlePdfDrop}
                                    onClick={openPdfPicker}
                                    onKeyDown={(e) => {
                                        if (isLoading) return;
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            openPdfPicker();
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label="PDFをドラッグ＆ドロップまたはクリックして選択"
                                >
                                    <input
                                        ref={pdfInputRef}
                                        type="file"
                                        accept="application/pdf,.pdf"
                                        onChange={handlePdfFileChange}
                                        className="image-upload-input"
                                    />
                                    <div className="pdf-upload-label">
                                        {isPdfDragActive
                                            ? 'ここにPDFをドロップ'
                                            : (pdfFile
                                                ? pdfFile.name
                                                : 'PDFファイルを選択またはドラッグ＆ドロップ')}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <p>レシピの画像（スクリーンショットや写真）をアップロードしてください。スマホはカメラで撮影して取り込めます。</p>
                                <div className="image-engine-panel">
                                    <label className="image-engine-label">
                                        解析エンジン
                                        <select
                                            className="image-engine-select"
                                            value={imageEngine}
                                            onChange={(e) => setImageEngine(e.target.value)}
                                            disabled={isLoading || isImagePreparing}
                                        >
                                            <option value="groq">Groq優先（おすすめ）</option>
                                            <option value="auto">Best Effort（Groq→Azure OCR→Groq→Gemini）</option>
                                            <option value="gemini">手書き（Gemini）</option>
                                            <option value="groq_vision">Groqのみ（画像）</option>
                                        </select>
                                    </label>
                                    <div className="image-engine-help">
                                        基本はここで使うAIを選んでください。おすすめは「Groq優先」です。うまくいかない場合は「Best Effort」か「手書き（Gemini）」を試してください（Geminiは高コストになりやすいので必要な時だけ）。
                                    </div>
                                </div>
                                <div className="image-target-panel">
                                    <div className="image-target-label">取り込み先タイプ</div>
                                    <div className="image-target-buttons">
                                        <button
                                            type="button"
                                            className={\`image-target-btn \${!importAsBread ? 'active' : ''}\`}
                                            onClick={() => setImportAsBread(false)}
                                            disabled={isLoading || isImagePreparing}
                                        >
                                            通常で取り込む
                                        </button>
                                        <button
                                            type="button"
                                            className={\`image-target-btn image-target-btn-bread \${importAsBread ? 'active' : ''}\`}
                                            onClick={() => setImportAsBread(true)}
                                            disabled={isLoading || isImagePreparing}
                                        >
                                            {importAsBread ? '☑ パン用で取り込む' : '☐ パン用で取り込む'}
                                        </button>
                                    </div>
                                    <div className="image-target-help">
                                        デフォルトは通常です。「パン用」にチェックが付いた時のみ、パンレシピとして挿入します。
                                    </div>
                                </div>
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
                                        className={\`image-upload-label \${isDragActive ? 'drag-active' : ''}\`}
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

                        {error && (
                            <div className="error-text" style={{
                                color: '#d32f2f',
                                background: '#ffebee',
                                padding: '10px',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                wordBreak: 'break-word',
                                maxHeight: '200px',
                                overflowY: 'auto'
                            }}>
                                {error}
                            </div>
                        )}

                        <div className="modal-actions">
                            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>キャンセル</Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={mode === 'pdf' ? handleParsePdf : handleImport}
                                isLoading={isLoading}
                                disabled={
                                    isImagePreparing
                                    || (mode === 'url' ? !url : mode === 'pdf' ? !pdfFile : !imageFile)
                                }
                            >
                                {mode === 'pdf' ? 'PDFを解析' : '取り込む'}
                            </Button>
                        </div>
                    </>
                )}
            </Card>
        </div >
    );
};
`;export{e as default};
