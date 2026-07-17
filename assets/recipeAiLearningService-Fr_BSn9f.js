const e=`import { supabase } from '../supabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeText = (value) => String(value ?? '')
    .replace(/\\s+/g, ' ')
    .trim();

const safeUuid = (value) => {
    const text = normalizeText(value);
    return UUID_PATTERN.test(text) ? text : null;
};

const safeRecipeId = (value) => {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }
    const text = normalizeText(value);
    if (!/^\\d+$/.test(text)) return null;
    const parsed = Number.parseInt(text, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeArray = (value) => Array.isArray(value) ? value : [];

const ingredientLine = (item) => {
    const amount = [normalizeText(item?.quantity ?? item?.amount), normalizeText(item?.unit)].filter(Boolean).join('');
    return [
        normalizeText(item?.name),
        amount,
        normalizeText(item?.note),
    ].filter(Boolean).join(' / ');
};

const stepLine = (item, index) => {
    const text = normalizeText(typeof item === 'string' ? item : item?.text ?? item?.instruction);
    const note = normalizeText(item?.note ?? item?.tip ?? item?.scienceTip);
    return \`\${index + 1}. \${[text, note ? \`(\${note})\` : ''].filter(Boolean).join(' ')}\`;
};

const summarizeRecipe = (recipe) => {
    const ingredients = normalizeArray(recipe?.ingredients).slice(0, 10).map(ingredientLine).filter(Boolean);
    const steps = normalizeArray(recipe?.steps).slice(0, 6).map(stepLine).filter(Boolean);
    return [
        \`タイトル: \${normalizeText(recipe?.title) || '未設定'}\`,
        \`説明: \${normalizeText(recipe?.description) || '未設定'}\`,
        \`コース: \${normalizeText(recipe?.course) || '未設定'}\`,
        \`カテゴリー: \${normalizeText(recipe?.category) || '未設定'}\`,
        \`国: \${normalizeText(recipe?.country) || '未設定'}\`,
        \`分量: \${normalizeText(recipe?.servings) || '未設定'}\`,
        ingredients.length ? \`材料: \${ingredients.join(' | ')}\` : '',
        steps.length ? \`手順: \${steps.join(' | ')}\` : '',
    ].filter(Boolean).join('\\n');
};

const summarizeProposal = (proposal) => {
    const ingredients = normalizeArray(proposal?.ingredients).slice(0, 10).map(ingredientLine).filter(Boolean);
    const steps = normalizeArray(proposal?.steps).slice(0, 6).map(stepLine).filter(Boolean);
    return [
        \`提案タイトル: \${normalizeText(proposal?.title) || '未設定'}\`,
        \`改善要約: \${normalizeText(proposal?.improvementSummary || proposal?.description) || '未設定'}\`,
        proposal?.keyChanges?.length ? \`変更点: \${proposal.keyChanges.map(normalizeText).filter(Boolean).join(' | ')}\` : '',
        proposal?.warnings?.length ? \`注意点: \${proposal.warnings.map(normalizeText).filter(Boolean).join(' | ')}\` : '',
        ingredients.length ? \`材料案: \${ingredients.join(' | ')}\` : '',
        steps.length ? \`手順案: \${steps.join(' | ')}\` : '',
    ].filter(Boolean).join('\\n');
};

const extractTags = ({ recipe, proposal, question, modeFamily }) => {
    const values = [
        normalizeText(recipe?.title),
        normalizeText(recipe?.course),
        normalizeText(recipe?.category),
        normalizeText(recipe?.country),
        normalizeText(proposal?.title),
        normalizeText(question),
        normalizeText(modeFamily),
    ].filter(Boolean);

    return Array.from(new Set(values)).slice(0, 12);
};

const buildRetrievalText = ({ recipe, proposal, question, answer, finalRecipe, feedbackNote }) => [
    summarizeRecipe(recipe),
    summarizeProposal(proposal),
    finalRecipe ? \`最終採用レシピ:\\n\${summarizeRecipe(finalRecipe)}\` : '',
    normalizeText(question) ? \`質問: \${normalizeText(question)}\` : '',
    normalizeText(answer) ? \`回答: \${normalizeText(answer)}\` : '',
    normalizeText(feedbackNote) ? \`採用メモ: \${normalizeText(feedbackNote)}\` : '',
].filter(Boolean).join('\\n\\n');

const normalizeMemoryRow = (row) => ({
    id: row?.id || '',
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    title: normalizeText(row?.title),
    summary: normalizeText(row?.summary),
    retrievalText: normalizeText(row?.retrieval_text),
    modeFamily: normalizeText(row?.mode_family),
    memoryType: normalizeText(row?.memory_type),
    tags: normalizeArray(row?.tags).map(normalizeText).filter(Boolean),
    relevance: Number(row?.relevance || 0),
    proposalSnapshot: row?.proposal_snapshot || {},
    finalRecipeSnapshot: row?.final_recipe_snapshot || {},
    feedbackSnapshot: row?.feedback_snapshot || {},
    metadata: row?.metadata || {},
});

export const fetchRecipeAiMemoryForRecipe = async (recipeId, modeFamily = 'product') => {
    const safeId = safeRecipeId(recipeId);
    if (!safeId) return null;

    try {
        const { data, error } = await supabase
            .from('recipe_ai_memories')
            .select('id, created_at, updated_at, title, summary, retrieval_text, mode_family, memory_type, tags, proposal_snapshot, final_recipe_snapshot, feedback_snapshot, metadata')
            .eq('recipe_id', safeId)
            .eq('mode_family', modeFamily)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return data ? normalizeMemoryRow(data) : null;
    } catch (error) {
        console.warn('[recipeAiLearningService] recipe memory fetch failed:', error);
        return null;
    }
};

export const fetchRecipeAiRunForRecipeTitle = async (recipeTitle, modeFamily = 'product') => {
    const title = normalizeText(recipeTitle);
    if (!title) return null;

    try {
        const { data, error } = await supabase
            .from('recipe_ai_runs')
            .select('id, created_at, title, answer, proposal_snapshot, agent_messages, sources, metadata')
            .eq('mode_family', modeFamily)
            .eq('title', title)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;

        const proposalSnapshot = {
            ...(data.proposal_snapshot || {}),
            agentMessages: Array.isArray(data.proposal_snapshot?.agentMessages) && data.proposal_snapshot.agentMessages.length > 0
                ? data.proposal_snapshot.agentMessages
                : (data.agent_messages || []),
            sources: Array.isArray(data.proposal_snapshot?.sources) && data.proposal_snapshot.sources.length > 0
                ? data.proposal_snapshot.sources
                : (data.sources || []),
        };
        return {
            id: data.id,
            title: normalizeText(data.title),
            summary: normalizeText(data.answer),
            proposalSnapshot,
            restoredFrom: 'ai_run',
        };
    } catch (error) {
        console.warn('[recipeAiLearningService] recipe run fetch failed:', error);
        return null;
    }
};

const fallbackRecentMemories = async (modeFamily, limit) => {
    const { data, error } = await supabase
        .from('recipe_ai_memories')
        .select('id, created_at, updated_at, title, summary, retrieval_text, mode_family, memory_type, tags, proposal_snapshot, final_recipe_snapshot, feedback_snapshot, metadata')
        .eq('mode_family', modeFamily)
        .order('updated_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return normalizeArray(data).map(normalizeMemoryRow);
};

export const fetchRecipeAiMemories = async ({
    modeFamily,
    recipe,
    proposal,
    question = '',
    limit = 4,
}) => {
    const query = [
        normalizeText(recipe?.title),
        normalizeText(recipe?.description),
        normalizeText(recipe?.course),
        normalizeText(recipe?.category),
        normalizeText(recipe?.country),
        normalizeArray(recipe?.ingredients).slice(0, 5).map(ingredientLine).join(' '),
        normalizeArray(proposal?.keyChanges).map(normalizeText).join(' '),
        normalizeText(question),
    ].filter(Boolean).join(' ');

    try {
        const { data, error } = await supabase.rpc('search_recipe_ai_memories', {
            p_query: query,
            p_mode_family: modeFamily,
            p_limit: limit,
        });
        if (error) throw error;
        const rows = normalizeArray(data).map(normalizeMemoryRow);
        if (rows.length > 0) return rows;
    } catch (error) {
        console.warn('[recipeAiLearningService] search_recipe_ai_memories failed:', error);
    }

    try {
        return await fallbackRecentMemories(modeFamily, limit);
    } catch (error) {
        console.warn('[recipeAiLearningService] fallback memory fetch failed:', error);
        return [];
    }
};

export const buildRecipeAiMemoryContext = async (args) => {
    const memories = await fetchRecipeAiMemories(args);
    if (memories.length === 0) {
        return { memories: [], memoryContext: '【過去の採用事例】\\n- まだ蓄積事例なし' };
    }

    const memoryContext = [
        '【過去の採用事例】',
        ...memories.map((memory, index) => [
            \`\${index + 1}. \${memory.title || '無題の事例'} (\${memory.memoryType || 'accepted_proposal'})\`,
            memory.summary ? \`   要約: \${memory.summary}\` : '',
            memory.retrievalText ? \`   詳細: \${memory.retrievalText.slice(0, 700)}\` : '',
        ].filter(Boolean).join('\\n')),
    ].join('\\n');

    return { memories, memoryContext };
};

export const logRecipeAiRun = async ({
    modeFamily,
    runKind,
    provider,
    recipe,
    proposal,
    question = '',
    answer = '',
    agentMessages = [],
    sources = [],
    metadata = {},
}) => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id || null;
        if (!userId) return null;

        const payload = {
            user_id: userId,
            base_recipe_id: safeRecipeId(recipe?.id),
            mode_family: modeFamily,
            run_kind: runKind,
            provider: normalizeText(provider) || 'groq',
            title: normalizeText(proposal?.title || recipe?.title),
            question: normalizeText(question) || null,
            recipe_snapshot: recipe || {},
            proposal_snapshot: proposal || {},
            answer: normalizeText(answer) || null,
            agent_messages: agentMessages || [],
            sources: sources || [],
            metadata,
        };

        const { data, error } = await supabase
            .from('recipe_ai_runs')
            .insert(payload)
            .select('id')
            .single();
        if (error) throw error;
        return data?.id || null;
    } catch (error) {
        console.warn('[recipeAiLearningService] logRecipeAiRun failed:', error);
        return null;
    }
};

export const recordRecipeAiAdoption = async ({
    modeFamily,
    proposal,
    finalRecipe,
    baseRecipe = null,
    sourceRunId = null,
    adoptionType = 'accepted_proposal',
    feedbackNote = '',
    question = '',
    answer = '',
    metadata = {},
}) => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id || null;
        if (!userId) return null;

        const summary = [
            normalizeText(proposal?.improvementSummary || proposal?.description),
            normalizeArray(proposal?.keyChanges).map(normalizeText).filter(Boolean).slice(0, 4).join(' / '),
            normalizeText(feedbackNote),
        ].filter(Boolean).join(' / ');

        const memoryPayload = {
            user_id: userId,
            source_run_id: safeUuid(sourceRunId),
            recipe_id: safeRecipeId(finalRecipe?.id),
            mode_family: modeFamily,
            memory_type: adoptionType,
            title: normalizeText(finalRecipe?.title || proposal?.title || baseRecipe?.title) || 'AI採用事例',
            summary: summary || 'AI提案が保存・採用されました。',
            retrieval_text: buildRetrievalText({
                recipe: baseRecipe || finalRecipe,
                proposal,
                question,
                answer,
                finalRecipe,
                feedbackNote,
            }),
            tags: extractTags({ recipe: finalRecipe || baseRecipe, proposal, question, modeFamily }),
            proposal_snapshot: proposal || {},
            final_recipe_snapshot: finalRecipe || {},
            feedback_snapshot: {
                question: normalizeText(question),
                answer: normalizeText(answer),
                note: normalizeText(feedbackNote),
            },
            metadata,
        };

        const { data, error } = await supabase
            .from('recipe_ai_memories')
            .insert(memoryPayload)
            .select('id')
            .single();
        if (error) throw error;
        return data?.id || null;
    } catch (error) {
        console.warn('[recipeAiLearningService] recordRecipeAiAdoption failed:', error);
        return null;
    }
};
`;export{e as default};
