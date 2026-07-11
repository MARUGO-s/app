const e=`import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { STORE_LIST } from '../constants';
import { RecipeFormBread } from './RecipeFormBread';
import { RecipeFormIngredients } from './RecipeFormIngredients';
import { RecipeFormSteps } from './RecipeFormSteps';
import { purchasePriceService } from '../services/purchasePriceService';
import { featureFlagService } from '../services/featureFlagService';
import { VoiceInputButton } from './VoiceInputButton';
import { applyImportedRecipeType } from '../utils/importRecipeType';
import { mapImportedRecipeToSavePayload } from '../utils/importedRecipeMapper';
import { recipeService } from '../services/recipeService';
import {
    continueRecipeAiConversation,
    askRecipeAiQuestion,
    generateRecipeAiIntake,
    generateProductRecipeDraft,
    isSakanaUnlocked,
    serializeRecipeAiDirectionContext,
    unlockSakana,
} from '../services/recipeAiService';
import { recordRecipeAiAdoption } from '../services/recipeAiLearningService';
import {
    loadRecipeMetaSuggestions,
    rememberRecipeMetaFields,
} from '../services/recipeMetaSuggestionService';
import { RecipeMetaDatalist } from './RecipeMetaDatalist';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { Modal } from './Modal';
import { getRecipeAiProgressConfig } from '../constants/recipeAiProgress';
import './RecipeForm.css';
import './RecipeFormMock.css';
import { ImportModal } from './ImportModal';

const formatAiDisplayText = (value) => String(value ?? '')
    .replace(/\\\\r\\\\n|\\\\n|\\\\r/g, '\\n')
    .replace(/\\\\t/g, ' ')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '$1')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();

export const RecipeForm = ({ onSave, onCancel, initialData }) => {
    const safeInitialData = initialData || {};
    const { user } = useAuth();
    const toast = useToast();

    const [workTab, setWorkTab] = useState('ingredients'); // 'ingredients' | 'steps'
    const [importMode, setImportMode] = useState(null); // 'url' | 'image' | 'pdf' | null

    // Price list cache
    const [priceList, setPriceList] = useState(new Map());

    React.useEffect(() => {
        const loadPrices = async () => {
            const prices = await purchasePriceService.fetchPriceList();
            setPriceList(prices);
        };
        loadPrices();
    }, []);

    // Transform initial steps and extract groups (similar to ingredients)
    const processedInitialSteps = useMemo(() => {
        const steps = safeInitialData.steps || [''];
        let stepGroups = safeInitialData.stepGroups || [];

        // If no explicit groups but steps have 'group' property (from import)
        // Steps might be strings or objects here
        const hasStepGroups = steps.some(s => typeof s === 'object' && s.group);

        if (stepGroups.length === 0 && hasStepGroups) {
            const groupMap = new Map();
            steps.forEach(s => {
                if (typeof s === 'object' && s.group && !groupMap.has(s.group)) {
                    groupMap.set(s.group, crypto.randomUUID());
                }
            });
            stepGroups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));
        }

        const finalSteps = steps.map(s => {
            // Handle string or object
            const text = typeof s === 'string' ? s : s.text || '';
            const id = (typeof s === 'object' && s.id) ? s.id : crypto.randomUUID();

            let groupId = (typeof s === 'object') ? s.groupId : undefined;
            const groupName = (typeof s === 'object') ? s.group : undefined;

            if (!groupId && groupName && stepGroups.length > 0) {
                const grp = stepGroups.find(g => g.name === groupName);
                if (grp) groupId = grp.id;
            }

            return { id, text, groupId };
        });

        return { steps: finalSteps, stepGroups };
    }, [safeInitialData]);

    const initialSteps = processedInitialSteps.steps;
    const initialStepGroups = processedInitialSteps.stepGroups;

    // Transform initial ingredients and extract groups if present (for imported recipes)
    const processedInitialData = useMemo(() => {
        const ingredients = safeInitialData.ingredients || [{ name: '', quantity: '', unit: '', cost: '', purchaseCost: '' }];
        let groups = safeInitialData.ingredientGroups || [];

        // If no explicit groups but ingredients have 'group' property (from import)
        if (groups.length === 0 && ingredients.some(i => i.group)) {
            const groupMap = new Map(); // Name -> ID
            // Create groups
            ingredients.forEach(i => {
                if (i.group && !groupMap.has(i.group)) {
                    groupMap.set(i.group, crypto.randomUUID());
                }
            });

            // Build group array
            groups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));

            // Assign groupIds to ingredients
            // Note: Ingredients without group will go to default (handled by RecipeFormIngredients) or we can make a default Main group
            if (groupMap.size > 0 && ingredients.some(i => !i.group)) {
                // Ensure there is a default group if we have mixed content?
                // Usually import is all grouped or not.
            }
        }

        const finalIngredients = ingredients.map(ing => {
            const base = typeof ing === 'string' ? { name: ing, quantity: '', unit: '', cost: '', purchaseCost: '' } : { ...ing, cost: ing.cost || '', purchaseCost: ing.purchaseCost || '' };

            // Map group name to ID if applicable
            let groupId = base.groupId;
            if (!groupId && base.group && groups.length > 0) {
                const grp = groups.find(g => g.name === base.group);
                if (grp) groupId = grp.id;
            }

            return { ...base, id: base.id || crypto.randomUUID(), groupId };
        });

        return { ingredients: finalIngredients, ingredientGroups: groups };
    }, [safeInitialData]);

    const initialIngredients = processedInitialData.ingredients;
    const initialIngredientGroups = processedInitialData.ingredientGroups;

    const [formData, setFormData] = useState({
        title: safeInitialData.title || '',
        description: safeInitialData.description || '',
        image: safeInitialData.image || '',
        imageFile: null, // New state for file upload
        storeName: safeInitialData.storeName || '',
        servings: safeInitialData.servings || '',
        ingredients: initialIngredients,
        ingredientGroups: initialIngredientGroups,
        steps: initialSteps, // Use transformed steps
        stepGroups: initialStepGroups,
        tags: safeInitialData.tags || [''],
        course: safeInitialData.course || '',
        category: safeInitialData.category || '',
        country: safeInitialData.country || '',
        type: safeInitialData.type || 'normal', // 'normal' | 'bread'
        flours: safeInitialData.flours || [],
        breadIngredients: safeInitialData.breadIngredients || [],
        sourceUrl: safeInitialData.sourceUrl || '' // Add sourceUrl state
    });

    const [isDragActive, setIsDragActive] = useState(false);
    const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
    const [metaSuggestions, setMetaSuggestions] = useState({
        course: [],
        category: [],
        country: [],
        servings: [],
        storeName: STORE_LIST,
    });
    const [aiBrief, setAiBrief] = useState('');
    const [aiDraft, setAiDraft] = useState(null);
    const [aiError, setAiError] = useState('');
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [aiConversation, setAiConversation] = useState([]);
    const [aiConversationInput, setAiConversationInput] = useState('');
    const [aiIntake, setAiIntake] = useState(null);
    const [isAiConversing, setIsAiConversing] = useState(false);
    const [isAiPreparingQuestions, setIsAiPreparingQuestions] = useState(false);
    const [aiProvider, setAiProvider] = useState('groq');
    const [sakanaUnlocked, setSakanaUnlocked] = useState(() => isSakanaUnlocked());
    const [aiProgressMode, setAiProgressMode] = useState(null);
    const [aiProgressStepIndex, setAiProgressStepIndex] = useState(0);
    const aiProgressConfig = useMemo(
        () => (aiProgressMode ? getRecipeAiProgressConfig(aiProgressMode) : null),
        [aiProgressMode]
    );
    const isAiProgressOpen = Boolean(aiProgressConfig) && (isAiGenerating || isAiConversing);
    const currentProgressStep = aiProgressConfig?.steps?.[aiProgressStepIndex];
    const isFinalIntegrating = isAiProgressOpen && Boolean(currentProgressStep?.provider?.includes('OpenAI'));

    const ensureSakanaUnlockedForProvider = (provider) => {
        if (!String(provider || '').startsWith('sakana') || sakanaUnlocked) return true;
        const input = window.prompt('Sakana AIはロックされています。解除パスワードを入力してください。');
        if (input === null) return false;
        if (!unlockSakana(input)) {
            toast.error('パスワードが違います。');
            return false;
        }
        setSakanaUnlocked(true);
        toast.success('Sakana AIのロックを解除しました。');
        return true;
    };

    const handleAiProviderChange = (value) => {
        if (!ensureSakanaUnlockedForProvider(value)) {
            return;
        }
        setAiProvider(value);
    };

    useEffect(() => {
        if (!user?.id) return undefined;

        let cancelled = false;
        loadRecipeMetaSuggestions({ storeList: STORE_LIST, currentUser: user }).then((suggestions) => {
            if (!cancelled) setMetaSuggestions(suggestions);
        });
        return () => { cancelled = true; };
    }, [user?.id, user?.displayId]);

    useEffect(() => {
        let isMounted = true;

        const loadVoiceFeatureFlag = async () => {
            try {
                const enabled = await featureFlagService.getVoiceInputEnabled();
                if (isMounted) setVoiceInputEnabled(enabled);
            } catch (error) {
                console.warn('[RecipeForm] failed to load voice input feature flag:', error);
                if (isMounted) setVoiceInputEnabled(false);
            }
        };

        loadVoiceFeatureFlag();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!isAiProgressOpen || !aiProgressConfig) return undefined;
        setAiProgressStepIndex(0);
        const intervalId = window.setInterval(() => {
            setAiProgressStepIndex((current) => Math.min(current + 1, aiProgressConfig.steps.length - 1));
        }, 2200);
        return () => window.clearInterval(intervalId);
    }, [isAiProgressOpen, aiProgressConfig]);

    const handleImportedRecipe = (importedData, sourceUrl = '', importOptions = {}) => {
        const importTypeMode = importOptions?.mode === 'image'
            ? (importOptions?.recipeType === 'bread' ? 'bread' : 'normal')
            : 'auto';
        const typedImportedData = applyImportedRecipeType(importedData, importTypeMode);

        const mapBreadItem = (item) => {
            if (typeof item === 'string') {
                return {
                    id: crypto.randomUUID(),
                    name: item,
                    quantity: '',
                    unit: 'g',
                    cost: '',
                    purchaseCost: '',
                    isAlcohol: false,
                    itemCategory: null,
                };
            }

            return {
                id: crypto.randomUUID(),
                name: item?.name || '',
                quantity: item?.quantity ?? '',
                unit: item?.unit || 'g',
                cost: item?.cost ?? '',
                purchaseCost: item?.purchaseCost ?? '',
                isAlcohol: Boolean(item?.isAlcohol),
                itemCategory: item?.itemCategory ?? item?.item_category ?? null,
            };
        };

        // Map imported ingredients to form structure
        // 1. Extract Groups
        const groupMap = new Map(); // Name -> ID
        const rawIngredients = typedImportedData.ingredients || [];

        rawIngredients.forEach(ing => {
            // Treat 'Main' as a group too (rename to '材料') to ensure it comes first if it appears first
            let gName = ing.group || '材料';
            if (gName === 'Main') gName = '材料';

            if (!groupMap.has(gName)) {
                groupMap.set(gName, crypto.randomUUID());
            }
        });

        const newGroups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));

        // 2. Map Ingredients
        const mappedIngredients = rawIngredients.map(ing => {
            let gName = ing.group || '材料';
            if (gName === 'Main') gName = '材料';

            let groupId = undefined;
            if (groupMap.has(gName)) {
                groupId = groupMap.get(gName);
            }

            return {
                id: crypto.randomUUID(),
                name: ing.name || '',
                quantity: ing.quantity || '',
                unit: ing.unit || '',
                cost: '',
                purchaseCost: '',
                groupId // Assign Group ID
            };
        });

        // Map imported steps
        const stepGroupMap = new Map();
        const rawSteps = importedData.steps || [];

        // 1. Extract Step Groups
        rawSteps.forEach(step => {
            if (typeof step === 'object' && step.group && step.group !== 'Main') {
                if (!stepGroupMap.has(step.group)) {
                    stepGroupMap.set(step.group, crypto.randomUUID());
                }
            }
        });

        const newStepGroups = Array.from(stepGroupMap.entries()).map(([name, id]) => ({ id, name }));

        // 2. Map Steps
        const mappedSteps = rawSteps.map(step => {
            const isObj = typeof step === 'object';
            const text = isObj ? (step.text || '') : step;
            const groupName = isObj ? step.group : null;

            let groupId = undefined;
            if (groupName && stepGroupMap.has(groupName)) {
                groupId = stepGroupMap.get(groupName);
            }

            return {
                id: crypto.randomUUID(),
                text,
                groupId
            };
        });

        setFormData(prev => ({
            ...prev,
            title: typedImportedData.name || typedImportedData.title || prev.title,
            description: typedImportedData.description || prev.description,
            category: sourceUrl?.startsWith('pdf:')
                ? '取り込み'
                : (sourceUrl ? '取り込み' : (typedImportedData.category || prev.category)),
            image: typedImportedData.image || prev.image,
            servings: typedImportedData.recipeYield || typedImportedData.servings || prev.servings,
            ingredients: mappedIngredients,
            ingredientGroups: newGroups, // Set the groups
            steps: mappedSteps,
            stepGroups: newStepGroups, // Set step groups
            type: typedImportedData.type || prev.type,
            flours: typedImportedData.type === 'bread'
                ? (typedImportedData.flours || []).map(mapBreadItem)
                : [],
            breadIngredients: typedImportedData.type === 'bread'
                ? (typedImportedData.breadIngredients || []).map(mapBreadItem)
                : [],
            // Reset sections 
            ingredientSections: undefined,
            stepSections: undefined,
            sourceUrl: sourceUrl || prev.sourceUrl // Save Source URL
        }));
        setImportMode(null);
        setWorkTab('ingredients');
    };

    const handleImportRecipeBatch = async (recipes, importOptions = {}) => {
        if (!user?.id) {
            toast.warning('ログインが必要です');
            return;
        }
        const failed = [];
        let successCount = 0;
        try {
            for (let i = 0; i < recipes.length; i += 1) {
                const raw = recipes[i];
                const title = String(raw?.title || raw?.name || \`レシピ \${i + 1}\`).trim();
                try {
                    const payload = mapImportedRecipeToSavePayload(raw, {
                        category: '取り込み',
                        sourceUrl: '',
                        importOptions,
                    });
                    await recipeService.createRecipe(payload, user);
                    successCount += 1;
                } catch (err) {
                    console.error(\`PDF import failed for "\${title}":\`, err);
                    failed.push({ title, message: err?.message || '保存に失敗しました' });
                }
            }
            if (successCount === 0) {
                throw new Error(failed[0]?.message || '一括登録に失敗しました');
            }
            setImportMode(null);
            if (failed.length > 0) {
                toast.warning(\`\${successCount}件を登録しました（\${failed.length}件は失敗）\`);
            } else {
                toast.success(\`\${successCount}件のレシピを登録しました\`);
            }
            onCancel?.();
        } catch (err) {
            console.error(err);
            toast.error(err?.message || '一括登録に失敗しました');
            throw err;
        }
    };

    const applyAiDraftToForm = (draft) => {
        if (!draft) return;

        const ingredientGroupId = crypto.randomUUID();
        const mappedIngredients = (draft.ingredients || []).map((item) => ({
            id: crypto.randomUUID(),
            name: item.name || '',
            quantity: item.quantity || '',
            unit: item.unit || '',
            cost: '',
            purchaseCost: '',
            note: item.note || '',
            groupId: ingredientGroupId,
        }));
        const mappedSteps = (draft.steps || []).map((item) => ({
            id: crypto.randomUUID(),
            text: item.text || '',
        }));

        setFormData(prev => ({
            ...prev,
            title: draft.title || prev.title,
            description: draft.description || draft.improvementSummary || prev.description,
            course: draft.course || prev.course,
            category: draft.category || prev.category,
            country: draft.country || prev.country,
            servings: draft.servings || prev.servings,
            type: 'normal',
            ingredients: mappedIngredients.length > 0 ? mappedIngredients : prev.ingredients,
            ingredientGroups: mappedIngredients.length > 0 ? [{ id: ingredientGroupId, name: '材料' }] : prev.ingredientGroups,
            steps: mappedSteps.length > 0 ? mappedSteps : prev.steps,
            stepGroups: [],
            ingredientSections: undefined,
            stepSections: undefined,
            flours: [],
            breadIngredients: [],
        }));
        setWorkTab('ingredients');
    };

    const hasMissingRequiredAiIntakeAnswers = (intake) => (intake?.questions || [])
        .some((question) => question?.required !== false && !String(question?.answer || '').trim());

    const handleAiIntakeAnswerChange = (questionId, answer) => {
        setAiIntake((current) => {
            if (!current) return current;
            return {
                ...current,
                questions: (current.questions || []).map((question) => (
                    question.id === questionId
                        ? { ...question, answer }
                        : question
                )),
            };
        });
    };

    const handleFillIntakeWithOmasake = (questionId) => {
        setAiIntake((current) => {
            if (!current?.questions) return current;
            return {
                ...current,
                questions: current.questions.map((q) => {
                    if (q.id !== questionId) return q;
                    let answer = '';
                    if (q.options?.length > 0) {
                        const omasakeOpt = q.options.find(o => o.includes('おまかせ') || o.includes('推奨') || o.includes('AI'));
                        answer = omasakeOpt || q.options[0];
                    } else {
                        answer = 'AIにおまかせ';
                    }
                    return { ...q, answer };
                }),
            };
        });
    };

    const handleFillAllAiIntakeWithOmasake = () => {
        setAiIntake((current) => {
            if (!current?.questions) return current;
            return {
                ...current,
                questions: current.questions.map((q) => {
                    let answer = '';
                    if (q.options?.length > 0) {
                        const omasakeOpt = q.options.find(o => o.includes('おまかせ') || o.includes('推奨') || o.includes('AI'));
                        answer = omasakeOpt || q.options[0];
                    } else {
                        answer = 'AIにおまかせ';
                    }
                    return { ...q, answer };
                }),
            };
        });
    };

    const loadAiDraftIntake = async () => {
        const brief = [aiBrief, formData.title, formData.description].map(v => String(v || '').trim()).filter(Boolean).join('\\n');
        if (!brief) {
            setAiError('開発テーマかレシピ名を入力してください。');
            return null;
        }
        if (!ensureSakanaUnlockedForProvider(aiProvider)) {
            return null;
        }

        setIsAiPreparingQuestions(true);
        setAiError('');
        try {
            const intake = await generateRecipeAiIntake({
                mode: 'product',
                brief,
                provider: aiProvider,
            });
            setAiIntake(intake);
            toast.success('方向性の確認項目を作成しました。回答後に開発を開始してください。');
            return intake;
        } catch (error) {
            console.error('[RecipeForm] AI intake generation failed:', error);
            setAiError(error?.message || '確認項目の作成に失敗しました。');
            return null;
        } finally {
            setIsAiPreparingQuestions(false);
        }
    };

    const handleGenerateAiDraft = async () => {
        const brief = [aiBrief, formData.title, formData.description].map(v => String(v || '').trim()).filter(Boolean).join('\\n');
        if (!brief) {
            setAiError('開発テーマかレシピ名を入力してください。');
            return;
        }
        if (!ensureSakanaUnlockedForProvider(aiProvider)) {
            return;
        }
        if (!aiIntake?.questions?.length) {
            await loadAiDraftIntake();
            return;
        }
        if (hasMissingRequiredAiIntakeAnswers(aiIntake)) {
            setAiError('AIの確認項目に回答してから開発を開始してください。');
            return;
        }

        setAiProgressMode('product-generate');
        setAiProgressStepIndex(0);
        setIsAiGenerating(true);
        setAiError('');
        try {
            const draft = await generateProductRecipeDraft({
                brief,
                provider: aiProvider,
                directionContext: serializeRecipeAiDirectionContext(aiIntake),
            });
            setAiDraft(draft);
            applyAiDraftToForm(draft);
            setAiConversation([]);
            setAiConversationInput('');
            toast.success('AIドラフトをフォームに反映しました。');
        } catch (error) {
            console.error('[RecipeForm] AI draft generation failed:', error);
            setAiError(error?.message || 'AIドラフトの生成に失敗しました。');
        } finally {
            setIsAiGenerating(false);
            setAiProgressMode(null);
            setAiProgressStepIndex(0);
        }
    };

    const handleAskAiDraftFollowUp = async () => {
        const question = aiConversationInput.trim();
        if (!question) {
            setAiError('質問内容を入力してください。');
            return;
        }
        if (!aiDraft) {
            setAiError('先にAIドラフトを作成してください。');
            return;
        }
        if (!ensureSakanaUnlockedForProvider(aiProvider)) {
            return;
        }

        // Q&Aのみのチャットでは、進捗ダイアログ（Modal）は表示しない
        setIsAiConversing(true);
        setAiError('');
        const userMessage = { role: 'user', content: question };
        const nextConversation = [...aiConversation, userMessage];
        setAiConversation(nextConversation);
        setAiConversationInput('');

        try {
            const answer = await askRecipeAiQuestion({
                recipe: formData,
                proposal: aiDraft,
                conversation: nextConversation,
                question,
                provider: aiProvider,
                mode: 'product',
            });
            setAiConversation([
                ...nextConversation,
                { role: 'assistant', content: answer },
            ]);
            toast.success('AIが質問に回答しました。');
        } catch (error) {
            console.error('[RecipeForm] AI Q&A failed:', error);
            setAiError(error?.message || 'AI回答の生成に失敗しました。');
            setAiConversation(nextConversation);
        } finally {
            setIsAiConversing(false);
        }
    };

    const handleApplyConversationToDraft = async () => {
        if (!aiDraft) return;
        if (aiConversation.length === 0) {
            setAiError('先にAIと会話で相談を行ってください。');
            return;
        }

        // ドラフト再作成の時は、進捗ダイアログ（Modal）を表示する
        setAiProgressMode('product-conversation');
        setAiProgressStepIndex(0);
        setIsAiGenerating(true);
        setAiError('');

        try {
            const lastUserQuestion = [...aiConversation].reverse().find(m => m.role === 'user')?.content || 'これまでの会話内容を踏まえてドラフトを再作成してください。';

            const response = await continueRecipeAiConversation({
                recipe: formData,
                proposal: aiDraft,
                conversation: aiConversation,
                question: lastUserQuestion,
                provider: aiProvider,
                mode: 'product',
                directionContext: serializeRecipeAiDirectionContext(aiIntake),
            });
            setAiDraft(response.proposal);
            applyAiDraftToForm(response.proposal);
            setAiConversation([
                ...aiConversation,
                { role: 'assistant', content: 'これまでの相談内容を反映して、新しいドラフトレシピを作成・反映しました！' },
            ]);
            toast.success('新しいドラフトを作成しました。');
        } catch (error) {
            console.error('[RecipeForm] Apply conversation failed:', error);
            setAiError(error?.message || 'ドラフトの更新に失敗しました。');
        } finally {
            setIsAiGenerating(false);
            setAiProgressMode(null);
            setAiProgressStepIndex(0);
        }
    };

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
                setFormData(prev => ({
                    ...prev,
                    imageFile: file,
                    image: URL.createObjectURL(file) // Preview URL
                }));
            }
        }
    };

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData(prev => ({
                ...prev,
                imageFile: file,
                image: URL.createObjectURL(file) // Preview URL
            }));
        }
    };

    const ingredientCount = useMemo(() => {
        if (formData.type === 'bread') {
            return (formData.flours?.length || 0) + (formData.breadIngredients?.length || 0);
        }
        const sections = formData.ingredientSections || [];
        if (sections.length > 0) {
            return sections.reduce((sum, s) => sum + ((s?.items?.length) || 0), 0);
        }
        return formData.ingredients?.length || 0;
    }, [formData.breadIngredients, formData.flours, formData.ingredientSections, formData.ingredients, formData.type]);

    const stepCount = useMemo(() => {
        const sections = formData.stepSections || [];
        if (sections.length > 0) {
            return sections.reduce((sum, s) => sum + ((s?.items?.length) || 0), 0);
        }
        return formData.steps?.length || 0;
    }, [formData.stepSections, formData.steps]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Basic validation could go here

        let finalIngredients = [];
        let finalGroups = [];

        if (formData.type === 'bread') {
            finalIngredients = formData.ingredients.map((item) => {
                const { id: _id, ...rest } = item;
                return rest;
            });
        } else {
            // Reconstruct ingredients from sections
            const sections = formData.ingredientSections || []; // Should be populated

            // If never populated (e.g. immediate submit without render?), fallback to ingredients
            if (sections.length === 0 && formData.ingredients.length > 0) {
                finalIngredients = formData.ingredients.map((item) => {
                    const { id: _id, ...rest } = item;
                    return rest;
                });
            } else {
                finalIngredients = sections.flatMap(section =>
                    section.items.map(item => ({
                        ...item,
                        groupId: section.id,
                    }))
                ).map((item) => {
                    const { id: _id, ...rest } = item;
                    return rest;
                }); // Remove UI IDs

                finalGroups = sections.map(s => ({ id: s.id, name: s.name }));
            }
        }

        // Automatically derive tags from course and category
        const tagSet = new Set(formData.tags || []); // Start with existing tags to preserve 'owner:*' etc.
        if (formData.course) tagSet.add(formData.course);
        if (formData.category) tagSet.add(formData.category);
        if (formData.type === 'bread') {
            tagSet.add('パン');
        }

        // Remove empty strings
        const derivedTags = Array.from(tagSet).filter(Boolean);

        // Process Steps Sections
        let finalSteps = [];
        let finalStepGroups = [];
        const stepSections = formData.stepSections || [];

        if (stepSections.length === 0 && formData.steps.length > 0) {
            // Fallback if no sections loaded/edited (though they should be init on mount)
            // Ensure steps are objects if possible or strings
            finalSteps = formData.steps.map(s => typeof s === 'string' ? { text: s } : s);
        } else {
            finalSteps = stepSections.flatMap(section =>
                section.items.map(item => ({
                    text: item.text,
                    groupId: section.id
                }))
            );
            finalStepGroups = stepSections.map(s => ({ id: s.id, name: s.name }));
        }

        rememberRecipeMetaFields({
            course: formData.course,
            category: formData.category,
            country: formData.country,
            servings: formData.servings,
            storeName: formData.storeName,
        }, user);

        const payload = {
            ...formData,
            ingredients: finalIngredients,
            ingredientGroups: finalGroups,
            steps: finalSteps, // Now passing objects with groupId instead of strings!
            stepGroups: finalStepGroups,
            image: formData.imageFile || formData.image,
            id: safeInitialData.id || Date.now(),
            tags: derivedTags,
            // Clean up temporary UI state
            ingredientSections: undefined,
            stepSections: undefined,
        };

        const savedRecipe = await onSave(payload);
        if (savedRecipe && aiDraft) {
            await recordRecipeAiAdoption({
                modeFamily: 'product',
                proposal: aiDraft,
                finalRecipe: savedRecipe,
                baseRecipe: payload,
                sourceRunId: aiDraft?.learningMeta?.runId || null,
                adoptionType: 'accepted_proposal',
                feedbackNote: 'AI商品開発ドラフトをレシピとして保存',
                metadata: {
                    isEdit,
                },
            });
        }
    };

    const isEdit = Boolean(safeInitialData?.id);

    return (
        <form className="recipe-form-mock fade-in" onSubmit={handleSubmit}>
            {importMode && (
                <ImportModal
                    onClose={() => setImportMode(null)}
                    onImport={handleImportedRecipe}
                    onImportBatch={handleImportRecipeBatch}
                    initialMode={importMode}
                />
            )}
            <Modal
                isOpen={isAiProgressOpen && !isFinalIntegrating}
                onClose={() => {}}
                title={aiProgressConfig?.title || 'AIエージェント進行中'}
                size="small"
                showCloseButton={false}
                maxWidth="520px"
            >
                <div className="recipe-ai-progress">
                    {(() => {
                        const currentStep = aiProgressConfig?.steps?.[aiProgressStepIndex];
                        const activeProvider = currentStep?.provider || '';
                        const isPerplexityActive = activeProvider.includes('Perplexity');
                        const isGroqActive = activeProvider.includes('Groq');
                        const isOpenAiActive = activeProvider.includes('OpenAI') || activeProvider.includes('gpt-') || activeProvider.includes('o4-');

                        return (
                            <div className="recipe-ai-progress__providers-status">
                                <div className={\`provider-status-badge provider-status-badge--perplexity \${isPerplexityActive ? 'is-active' : ''}\`}>
                                    <span className="provider-status-badge__dot" />
                                    <span className="provider-status-badge__name">Perplexity (Web調査)</span>
                                </div>
                                <div className={\`provider-status-badge provider-status-badge--groq \${isGroqActive ? 'is-active' : ''}\`}>
                                    <span className="provider-status-badge__dot" />
                                    <span className="provider-status-badge__name">Groq (高速論理)</span>
                                </div>
                                <div className={\`provider-status-badge provider-status-badge--openai \${isOpenAiActive ? 'is-active' : ''}\`}>
                                    <span className="provider-status-badge__dot" />
                                    <span className="provider-status-badge__name">OpenAI (監査・統合)</span>
                                </div>
                            </div>
                        );
                    })()}
                    <p className="recipe-ai-progress__description">
                        {aiProgressConfig?.description}
                    </p>
                    <div className="recipe-ai-progress__status">
                        <span className="recipe-ai-progress__pulse" />
                        <div>
                            <strong>現在の工程</strong>
                            {aiProgressConfig?.steps?.[aiProgressStepIndex] ? (
                                <p>
                                    {aiProgressConfig.steps[aiProgressStepIndex].label}
                                    <span className="recipe-ai-progress__status-provider">{aiProgressConfig.steps[aiProgressStepIndex].provider}</span>
                                </p>
                            ) : <p>進行状況を確認中</p>}
                        </div>
                    </div>
                    <div className="recipe-ai-progress__bar" aria-hidden="true">
                        <span
                            className="recipe-ai-progress__bar-fill"
                            style={{
                                width: \`\${(((aiProgressStepIndex + 1) / Math.max(aiProgressConfig?.steps?.length || 1, 1)) * 100).toFixed(0)}%\`,
                            }}
                        />
                    </div>
                    <div className="recipe-ai-progress__steps">
                        {(aiProgressConfig?.steps || []).map((step, index) => (
                            <div
                                key={\`\${step.label}-\${index}\`}
                                className={\`recipe-ai-progress__step\${index < aiProgressStepIndex ? ' is-complete' : ''}\${index === aiProgressStepIndex ? ' is-active' : ''}\`}
                            >
                                <span className="recipe-ai-progress__step-index">{index + 1}</span>
                                <div className="recipe-ai-progress__step-content">
                                    <span className="recipe-ai-progress__step-label">{step.label}</span>
                                    <span className="recipe-ai-progress__step-provider">{step.provider}</span>
                                    <span className="recipe-ai-progress__step-detail">{step.description}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            {isFinalIntegrating && (
                <Modal
                    isOpen={true}
                    onClose={() => {}}
                    title="👨‍🍳 最終統合・クオリティ監査を実行中"
                    size="small"
                    showCloseButton={false}
                    maxWidth="500px"
                >
                    <div className="final-integration-popup">
                        <div className="final-integration-popup__animation">
                            <div className="chef-hat-glow">
                                <span className="chef-emoji" role="img" aria-label="chef">👨‍🍳</span>
                            </div>
                            <div className="integration-ring ring-1"></div>
                            <div className="integration-ring ring-2"></div>
                            <div className="integration-ring ring-3"></div>
                            <div className="integration-particles">
                                <span></span><span></span><span></span><span></span>
                                <span></span><span></span><span></span><span></span>
                            </div>
                        </div>
                        <h3 className="final-integration-popup__title">
                            レシピの最終統合と監査を行っています
                        </h3>
                        <p className="final-integration-popup__description">
                            複数の専門家AI（食品科学、安全性、本場比較）の所見をすり合わせ、矛盾のない黄金比率のレシピ構成へ統合・レビューを行っています。
                        </p>
                        <div className="final-integration-popup__status-label">
                            現在のプロセス: <span className="highlight-step">{currentProgressStep?.label}</span> ({currentProgressStep?.provider})
                        </div>
                        <div className="final-integration-popup__warning">
                            <span className="spin-loader"></span>
                            <span>これには30秒〜60秒ほどかかります。画面を閉じずにお待ちください。</span>
                        </div>
                    </div>
                </Modal>
            )}
            <div className="recipe-form-mock__page">
                <div className="recipe-form-mock__commandbar" role="banner">
                    <div className="recipe-form-mock__commandbar-inner">
                        <div className="recipe-form-mock__crumb">
                            <span className="recipe-form-mock__crumb-app">レシピ</span>
                            <span className="recipe-form-mock__crumb-sep">/</span>
                            <span className="recipe-form-mock__crumb-page">
                                {isEdit ? 'レシピ編集' : '新規レシピ作成'}
                            </span>
                        </div>
                        <div className="recipe-form-mock__actions">
                            <Button type="button" variant="ghost" onClick={onCancel}>キャンセル</Button>
                            <Button type="submit" variant="primary">レシピを保存</Button>
                        </div>
                    </div>
                </div>

                <div className="recipe-form-mock__sheet">
                    <header className="recipe-form-mock__doc">
                        <div className="recipe-form-mock__doc-title">
                            <input
                                id="title"
                                className="recipe-form-mock__title-input"
                                value={formData.title}
                                onChange={handleChange}
                                placeholder="レシピ名を入力"
                                required
                            />
                            <div className="recipe-form-mock__doc-sub">
                                まずはレシピ名と基本情報を入力し、材料と作り方を追加します。
                            </div>
                        </div>

                        <div className="recipe-form-mock__meta-grid">
                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="コース"
                                    id="course"
                                    value={formData.course}
                                    onChange={handleChange}
                                    placeholder="例: 前菜, メイン"
                                    list="course-options"
                                    wrapperClassName="input-group--no-margin"
                                />
                                <RecipeMetaDatalist id="course-options" values={metaSuggestions.course} />
                            </div>

                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="カテゴリー"
                                    id="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    placeholder="例: ソース, 付け合わせ"
                                    list="category-options"
                                    wrapperClassName="input-group--no-margin"
                                />
                                <RecipeMetaDatalist id="category-options" values={metaSuggestions.category} />
                            </div>

                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="国"
                                    id="country"
                                    value={formData.country}
                                    onChange={handleChange}
                                    placeholder="例: アルゼンチン, 日本"
                                    list="country-options"
                                    wrapperClassName="input-group--no-margin"
                                />
                                <RecipeMetaDatalist id="country-options" values={metaSuggestions.country} />
                            </div>

                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="店舗名"
                                    id="storeName"
                                    value={formData.storeName}
                                    onChange={handleChange}
                                    placeholder="店舗名を入力または選択"
                                    list="store-options"
                                    wrapperClassName="input-group--no-margin"
                                />
                                <RecipeMetaDatalist id="store-options" values={metaSuggestions.storeName} />
                            </div>

                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="分量"
                                    id="servings"
                                    value={formData.servings}
                                    onChange={handleChange}
                                    placeholder="4人分"
                                    list="servings-options"
                                    wrapperClassName="input-group--no-margin"
                                />
                                <RecipeMetaDatalist id="servings-options" values={metaSuggestions.servings} />
                            </div>
                        </div>
                    </header>

                    <div className="recipe-form-mock__grid">
                        <aside className="recipe-form-mock__col recipe-form-mock__col--side">
                            {!safeInitialData?.id && (
                                <Card className="recipe-form-mock__card recipe-form-mock__card--ai">
                                    <div className="recipe-form-mock__card-title">マルチAI商品開発</div>
                                    <div className="recipe-ai-form">
                                        <label className="recipe-ai-form__label">
                                            AIプロバイダー
                                            <select
                                                className="recipe-ai-form__select"
                                                value={aiProvider}
                                                onChange={(e) => handleAiProviderChange(e.target.value)}
                                                disabled={isAiGenerating}
                                            >
                                                <option value="groq-express">格安エクスプレス（Groq・高速/数銭）</option>
                                                <option value="groq">マルチエージェント（推奨・自動振分）</option>
                                                <option value="sakana-subscription">{sakanaUnlocked ? 'Sakana AI（サブスク）' : '🔒 Sakana AI（サブスク）'}</option>
                                                <option value="sakana-payg">{sakanaUnlocked ? 'Sakana AI（従量課金）' : '🔒 Sakana AI（従量課金）'}</option>
                                            </select>
                                        </label>
                                        <p className="recipe-ai-form__hint">
                                            通常は、研究系は内容に応じて Perplexity、最終監査・統合・反証は OpenAI、それ以外は主に Groq を自動使用します。
                                        </p>
                                        <label className="recipe-ai-form__label">
                                            開発テーマ
                                            <textarea
                                                className="recipe-ai-form__textarea"
                                                value={aiBrief}
                                                onChange={(e) => setAiBrief(e.target.value)}
                                                placeholder="例: ランチ向けの軽い魚料理。仕込みは前日可、提供は5分以内。"
                                                disabled={isAiGenerating}
                                            />
                                        </label>
                                        <div className="recipe-ai-form__actions">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                block
                                                isLoading={isAiPreparingQuestions}
                                                disabled={isAiGenerating || isAiConversing}
                                                onClick={loadAiDraftIntake}
                                            >
                                                方向性の確認項目を出す
                                            </Button>
                                        </div>
                                        {aiIntake?.questions?.length > 0 && (
                                            <div className="recipe-ai-intake">
                                                <div className="recipe-ai-intake__header">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                                        <strong>開発前の確認項目</strong>
                                                        <button
                                                            type="button"
                                                            className="recipe-ai-intake__all-omasake-btn"
                                                            onClick={handleFillAllAiIntakeWithOmasake}
                                                            disabled={isAiGenerating || isAiConversing}
                                                            style={{
                                                                background: 'linear-gradient(135deg, #ff8c00 0%, #ff5e00 100%)',
                                                                border: 'none',
                                                                color: '#fff',
                                                                borderRadius: '4px',
                                                                padding: '4px 10px',
                                                                fontSize: '12px',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer',
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                                                transition: 'opacity 0.2s',
                                                            }}
                                                        >
                                                            🪄 全ておまかせで埋める
                                                        </button>
                                                    </div>
                                                    {aiIntake.summary && <p>{formatAiDisplayText(aiIntake.summary)}</p>}
                                                </div>
                                                <div className="recipe-ai-intake__list">
                                                    {aiIntake.questions.map((question, index) => (
                                                        <div className="recipe-ai-intake__item" key={question.id || index}>
                                                            <div className="recipe-ai-intake__title-row">
                                                                <strong>{question.label || \`確認項目 \${index + 1}\`}</strong>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="recipe-ai-intake__omasake-btn"
                                                                        onClick={() => handleFillIntakeWithOmasake(question.id)}
                                                                        disabled={isAiGenerating || isAiConversing}
                                                                        style={{
                                                                            background: 'rgba(255, 255, 255, 0.08)',
                                                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                                                            color: 'hsl(var(--color-text-main))',
                                                                            borderRadius: '4px',
                                                                            padding: '2px 8px',
                                                                            fontSize: '11px',
                                                                            cursor: 'pointer',
                                                                        }}
                                                                    >
                                                                        🪄 おまかせ
                                                                    </button>
                                                                    {question.required !== false && <span>必須</span>}
                                                                </div>
                                                            </div>
                                                            <p className="recipe-ai-intake__question">{question.question}</p>
                                                            {question.rationale && (
                                                                <p className="recipe-ai-intake__rationale">{question.rationale}</p>
                                                            )}
                                                            {question.options?.length > 0 && (
                                                                <div className="recipe-ai-intake__options">
                                                                    {question.options.map((option) => (
                                                                        <button
                                                                            key={option}
                                                                            type="button"
                                                                            className={\`recipe-ai-intake__option\${String(question.answer || '').trim() === option ? ' is-active' : ''}\`}
                                                                            onClick={() => handleAiIntakeAnswerChange(question.id, option)}
                                                                        >
                                                                            {option}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <textarea
                                                                className="recipe-ai-form__textarea recipe-ai-intake__answer"
                                                                value={question.answer || ''}
                                                                onChange={(e) => handleAiIntakeAnswerChange(question.id, e.target.value)}
                                                                placeholder={question.placeholder || '回答を入力'}
                                                                disabled={isAiGenerating || isAiConversing}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            block
                                            isLoading={isAiGenerating}
                                            onClick={handleGenerateAiDraft}
                                        >
                                            {aiIntake?.questions?.length ? '回答内容でエージェント開発を開始' : 'まず方向性を確認する'}
                                        </Button>
                                        {aiError && <div className="recipe-ai-form__error">{aiError}</div>}
                                        {aiDraft?.agentMessages?.length > 0 && (
                                            <div className="recipe-ai-form__agents">
                                                <strong>エージェント所見</strong>
                                                {aiDraft.agentMessages.map((message, index) => (
                                                    <div className="recipe-ai-agent-line" key={\`\${message.agentId}-\${index}\`}>
                                                        <span>{message.avatar}</span>
                                                        <div>
                                                            <b>{message.agentName}</b>
                                                            <p>{formatAiDisplayText(message.content)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {aiDraft?.keyChanges?.length > 0 && (
                                            <div className="recipe-ai-form__result">
                                                <strong>反映した要点</strong>
                                                <ul>
                                                    {aiDraft.keyChanges.slice(0, 4).map((item, index) => (
                                                        <li key={\`\${item}-\${index}\`}>{item}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {aiDraft?.sources?.length > 0 && (
                                            <div className="recipe-ai-form__sources">
                                                <strong>参照ソース</strong>
                                                {aiDraft.sources.slice(0, 4).map((source) => (
                                                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                                                        {source.id ? \`[\${source.id}] \` : ''}{source.title || source.url}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                        {aiDraft && (
                                            <div className="recipe-ai-form__conversation">
                                                <strong>続けて相談・再開発</strong>
                                                {aiConversation.length > 0 && (
                                                    <div className="recipe-ai-form__conversation-messages">
                                                        {aiConversation.map((message, index) => (
                                                            <div
                                                                className={\`recipe-ai-form__conversation-message recipe-ai-form__conversation-message--\${message.role === 'assistant' ? 'assistant' : 'user'}\`}
                                                                key={\`\${message.role}-\${index}-\${message.content.slice(0, 16)}\`}
                                                            >
                                                                <span>{message.role === 'assistant' ? 'AI' : '質問'}</span>
                                                                <p>{formatAiDisplayText(message.content)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <textarea
                                                    className="recipe-ai-form__textarea"
                                                    value={aiConversationInput}
                                                    onChange={(e) => setAiConversationInput(e.target.value)}
                                                    placeholder="例: もっと原価を下げたい / 仕込みを前日に寄せたい / 肉を使わない案に変えて"
                                                    disabled={isAiConversing || isAiGenerating}
                                                />
                                                {aiConversation.length > 0 && (
                                                    <Button
                                                        type="button"
                                                        variant="primary"
                                                        size="sm"
                                                        block
                                                        isLoading={isAiGenerating}
                                                        disabled={isAiConversing || isAiGenerating}
                                                        onClick={handleApplyConversationToDraft}
                                                        style={{ marginBottom: '0.5rem' }}
                                                    >
                                                        ✨ この合意内容でドラフトを再作成（AI解析）
                                                    </Button>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    block
                                                    isLoading={isAiConversing}
                                                    disabled={isAiConversing || isAiGenerating || !aiConversationInput.trim()}
                                                    onClick={handleAskAiDraftFollowUp}
                                                >
                                                    相談・Q&Aを送信
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            )}

                            <Card className="recipe-form-mock__card recipe-form-mock__card--notes">
                                <div className="recipe-form-mock__card-title">メモ</div>
                                <Input
                                    label="説明"
                                    id="description"
                                    textarea
                                    value={formData.description}
                                    onChange={handleChange}
                                    placeholder="料理のポイント、仕込み、注意点など..."
                                />
                                {voiceInputEnabled && (
                                    <div className="recipe-form__voice-action">
                                        <VoiceInputButton
                                            label="説明を音声入力"
                                            getCurrentValue={() => formData.description}
                                            onTranscript={(nextValue) => setFormData(prev => ({ ...prev, description: nextValue }))}
                                        />
                                    </div>
                                )}
                                <Input
                                    label="引用元URL"
                                    id="sourceUrl"
                                    value={formData.sourceUrl || ''}
                                    onChange={handleChange}
                                    placeholder="https://example.com/recipe/..."
                                />
                            </Card>

                            <Card className="recipe-form-mock__card recipe-form-mock__card--image">
                                <div className="recipe-form-mock__card-title">画像</div>
                                <div
                                    className={\`recipe-form-mock__image-drop \${isDragActive ? 'is-active' : ''}\`}
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                >
                                    {formData.image ? (
                                        <div className="recipe-form-mock__image-preview">
                                            <img
                                                src={formData.image}
                                                alt="プレビュー"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                            <button
                                                type="button"
                                                className="recipe-form-mock__image-remove"
                                                onClick={() => setFormData(prev => ({ ...prev, image: '', imageFile: null }))}
                                                title="画像を削除"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="recipe-form-mock__image-empty">
                                            クリックして画像を選択
                                            <div className="recipe-form-mock__image-sub">またはドラッグ＆ドロップ</div>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        className="recipe-form-mock__image-input"
                                    />
                                </div>
                            </Card>

                            {!safeInitialData?.id && (
                                <Card className="recipe-form-mock__card recipe-form-mock__card--import">
                                    <div className="recipe-form-mock__card-title">取り込み</div>
                                    <div className="recipe-form-mock__import-actions">
                                        <Button variant="secondary" type="button" onClick={() => setImportMode('url')}>
                                            URL取り込み
                                        </Button>
                                        <Button variant="secondary" type="button" onClick={() => setImportMode('image')}>
                                            画像解析
                                        </Button>
                                        <Button variant="secondary" type="button" onClick={() => setImportMode('pdf')}>
                                            PDF取り込み
                                        </Button>
                                    </div>
                                    <div className="recipe-form-mock__import-note">取り込み後も内容は編集できます。</div>
                                </Card>
                            )}

                            <Card className="recipe-form-mock__card recipe-form-mock__card--tips">
                                <div className="recipe-form-mock__card-title">使い方</div>
                                <ul className="recipe-form-mock__tips-list">
                                    <li>材料と手順はドラッグで並び替えできます。</li>
                                    <li>材料名は入力候補から選ぶと、仕入れ単価が自動入力されます。</li>
                                    <li>保存はいつでも可能です。</li>
                                </ul>
                            </Card>
                        </aside>

                        <section className="recipe-form-mock__col recipe-form-mock__col--main">
                            <div className="recipe-form-mock__workspace" role="region" aria-label="編集エリア">
                                <div className="recipe-form-mock__workspace-head">
                                    <div className="recipe-form-mock__nav">
                                        <button
                                            type="button"
                                            className={\`recipe-form-mock__nav-btn recipe-form-mock__nav-btn--ingredients \${workTab === 'ingredients' ? 'active' : ''}\`}
                                            onClick={() => setWorkTab('ingredients')}
                                        >
                                            材料 <span className="recipe-form-mock__nav-count">{ingredientCount.toLocaleString()}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={\`recipe-form-mock__nav-btn recipe-form-mock__nav-btn--steps \${workTab === 'steps' ? 'active' : ''}\`}
                                            onClick={() => setWorkTab('steps')}
                                        >
                                            作り方 <span className="recipe-form-mock__nav-count">{stepCount.toLocaleString()}</span>
                                        </button>
                                    </div>

                                    <div className="recipe-form-mock__workspace-right">
                                        {workTab === 'ingredients' ? (
                                            <div className="recipe-form-mock__segmented">
                                                <button
                                                    type="button"
                                                    className={\`recipe-form-mock__seg-btn \${formData.type === 'normal' ? 'active' : ''}\`}
                                                    onClick={() => setFormData(prev => ({ ...prev, type: 'normal' }))}
                                                >
                                                    通常
                                                </button>
                                                <button
                                                    type="button"
                                                    className={\`recipe-form-mock__seg-btn \${formData.type === 'bread' ? 'active' : ''}\`}
                                                    onClick={() => setFormData(prev => ({ ...prev, type: 'bread' }))}
                                                >
                                                    パン
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="recipe-form-mock__hint">ドラッグで並び替えできます</div>
                                        )}
                                    </div>
                                </div>

                                <div className="recipe-form-mock__workspace-body">
                                    {workTab === 'ingredients' ? (
                                        <div className="recipe-form-mock__editor-surface">
                                            {formData.type === 'bread' ? (
                                                <RecipeFormBread formData={formData} setFormData={setFormData} />
                                            ) : (
                                                <RecipeFormIngredients
                                                    formData={formData}
                                                    setFormData={setFormData}
                                                    priceList={priceList}
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="recipe-form-mock__editor-surface">
                                            <RecipeFormSteps
                                                formData={formData}
                                                setFormData={setFormData}
                                                voiceInputEnabled={voiceInputEnabled}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </form>
    );
};
`;export{e as default};
