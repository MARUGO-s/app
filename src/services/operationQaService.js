import { supabase } from '../supabase';
import {
    assessOperationKnowledge,
    buildKnowledgeSnippet,
    formatLocalOperationAnswer,
    formatOperationClarificationAnswer,
} from './operationKnowledgeBase';
import { searchCodeEvidence } from './codeContextService';

const OPERATION_ASSISTANT_MODEL = 'gemini-2.5-flash-lite';

const VIEW_LABEL_MAP = {
    list: 'レシピ一覧',
    detail: 'レシピ詳細',
    create: 'レシピ作成',
    edit: 'レシピ編集',
    data: 'データ管理',
    'data-management': 'データ管理',
    inventory: '在庫管理',
    'incoming-deliveries': '入荷PDF',
    'incoming-stock': '入荷在庫',
    planner: '仕込みカレンダー',
    'order-list': '発注リスト',
    users: 'ユーザー管理',
    'api-logs': 'API使用ログ',
    trash: 'ゴミ箱',
};

const normalizeRole = (role) => {
    if (role === 'user' || role === 'assistant' || role === 'system') return role;
    return null;
};

const normalizeHistory = (history) => {
    return (Array.isArray(history) ? history : [])
        .map((item) => ({
            role: normalizeRole(item?.role),
            content: String(item?.content || '').trim(),
        }))
        .filter((item) => item.role && item.content)
        .slice(-8);
};

const toStepText = (stepItem) => {
    if (typeof stepItem === 'string') return stepItem;
    if (!stepItem || typeof stepItem !== 'object') return '';
    return String(stepItem.step || stepItem.text || '').trim();
};

const GENERIC_REASK_PATTERNS = [
    '目的を1文で',
    'どの画面で',
    '何をしたいか',
    'どこで止まるか',
    'この形式で再質問',
    'この3点を',
    '操作したい画面名',
    '押したボタン名',
];

const shouldTreatAsGenericReask = (content) => {
    const text = String(content || '');
    if (!text) return false;
    const hitCount = GENERIC_REASK_PATTERNS.filter((pattern) => text.includes(pattern)).length;
    return hitCount >= 2;
};

const LOOKS_BROAD_PATTERNS = [
    'わからない',
    '教えて',
    'どうすれば',
    'どこ',
    'できない',
    '反応しない',
];

const FOLLOWUP_SHORT_PATTERNS = [
    'これ',
    'それ',
    'この場合',
    'その場合',
    'この画面',
    'このボタン',
    'これって',
];

const ABSTRACT_HINT_PATTERNS = [
    'どうすれば',
    '教えて',
    '方法',
    '手順',
    'できない',
    '反映されない',
    '表示されない',
    'わからない',
    'どれ',
    'どこ',
];

const SHORT_STYLE_HINT_PATTERNS = [
    '短く',
    '簡単に',
    '要点だけ',
    '一言で',
    '端的に',
    '手短に',
    '結論だけ',
];

const DETAILED_STYLE_HINT_PATTERNS = [
    '詳しく',
    '丁寧に',
    '細かく',
    '具体的に',
    '初心者向け',
    'わかりやすく',
    '徹底的に',
];

const CHOICE_PROMPT_MARKER = '番号だけ返信してください。';
const ASSISTANT_ANSWER_MODE = {
    QUESTION_FIRST: 'question-first',
    PAGE_FIRST: 'page-first',
};

const normalizeAnswerMode = (mode) => (
    mode === ASSISTANT_ANSWER_MODE.PAGE_FIRST
        ? ASSISTANT_ANSWER_MODE.PAGE_FIRST
        : ASSISTANT_ANSWER_MODE.QUESTION_FIRST
);

const uniqueTrimmedLines = (items, limit = 30, maxLength = 80) => {
    const list = Array.isArray(items) ? items : [];
    const out = [];
    const seen = new Set();
    list.forEach((item) => {
        const text = String(item || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > maxLength) return;
        if (seen.has(text)) return;
        seen.add(text);
        out.push(text);
    });
    return out.slice(0, limit);
};

const normalizePageContext = (pageContext) => {
    if (!pageContext || typeof pageContext !== 'object') return null;
    const view = String(pageContext.view || '').trim();
    const capturedAt = String(pageContext.capturedAt || '').trim();
    const headings = uniqueTrimmedLines(pageContext.headingLines, 20, 80);
    const tabs = uniqueTrimmedLines(pageContext.tabLabels, 20, 64);
    const buttons = uniqueTrimmedLines(pageContext.buttonLabels, 24, 48);
    const excerpt = String(pageContext.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!view && headings.length === 0 && tabs.length === 0 && buttons.length === 0 && !excerpt) {
        return null;
    }
    return {
        view,
        capturedAt,
        headingLines: headings,
        tabLabels: tabs,
        buttonLabels: buttons,
        excerpt,
    };
};

const buildPageContextText = (pageContext) => {
    const ctx = normalizePageContext(pageContext);
    if (!ctx) return '';
    const lines = [];
    if (ctx.view) lines.push(`view=${ctx.view}`);
    if (ctx.capturedAt) lines.push(`capturedAt=${ctx.capturedAt}`);
    if (ctx.headingLines.length > 0) lines.push(`headings=${ctx.headingLines.join(' / ')}`);
    if (ctx.tabLabels.length > 0) lines.push(`tabs=${ctx.tabLabels.join(' / ')}`);
    if (ctx.buttonLabels.length > 0) lines.push(`buttons=${ctx.buttonLabels.join(' / ')}`);
    if (ctx.excerpt) lines.push(`excerpt=${ctx.excerpt}`);
    return lines.join('\n');
};

const buildContextAwareQuestion = ({ question, answerMode, pageContextText }) => {
    const base = String(question || '').trim();
    if (!base) return base;
    if (answerMode !== ASSISTANT_ANSWER_MODE.PAGE_FIRST) return base;
    if (!pageContextText) return base;
    return `${base}\n\n[現在ページスナップショット]\n${pageContextText}`;
};

const decideResponseStyle = ({ question, knowledgeAssessment }) => {
    const q = String(question || '').trim();
    if (!q) return 'balanced';

    if (SHORT_STYLE_HINT_PATTERNS.some((token) => q.includes(token))) {
        return 'concise';
    }
    if (DETAILED_STYLE_HINT_PATTERNS.some((token) => q.includes(token))) {
        return 'detailed';
    }

    const isWhyQuestion = /理由|なぜ|なんで/.test(q);
    if (isWhyQuestion) return 'detailed';

    if (knowledgeAssessment?.shouldAskClarification || knowledgeAssessment?.confidence === 'low') {
        return 'detailed';
    }

    const looksBroad = LOOKS_BROAD_PATTERNS.some((token) => q.includes(token));
    if (looksBroad && q.length <= 24) return 'detailed';

    if (knowledgeAssessment?.confidence === 'high' && q.length <= 20) {
        return 'concise';
    }

    return 'balanced';
};

const shouldPreferLocalDirectAnswer = (question, knowledgeAssessment) => {
    if (!knowledgeAssessment?.top?.entry) return false;
    if (knowledgeAssessment.confidence !== 'high') return false;
    if ((knowledgeAssessment.bestScore || 0) < 10) return false;

    const normalizedQuestion = String(question || '').trim();
    if (!normalizedQuestion) return false;
    const hasBroadMarker = LOOKS_BROAD_PATTERNS.some((keyword) => normalizedQuestion.includes(keyword));
    const isTooBroad = normalizedQuestion.length <= 14 && hasBroadMarker;
    return !isTooBroad;
};

const isNumberSelectionText = (question) => {
    const text = String(question || '')
        .normalize('NFKC')
        .replace(/\u3000/g, ' ')
        .trim();
    if (!text) return null;

    const cleaned = text
        .replace(/[。．\.!！?？、,，]+$/g, '')
        .trim();
    if (!cleaned) return null;

    const directNumber = cleaned.match(/^[\(（\[]?\s*([1-9]\d*)\s*[\)）\]]?\s*(?:番|ばん)?$/);
    if (directNumber) {
        const num = Number(directNumber[1]);
        return Number.isInteger(num) && num > 0 ? num : null;
    }

    const circledMap = {
        '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
        '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
        '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
        '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
    };
    if (circledMap[cleaned]) return circledMap[cleaned];

    const withoutBan = cleaned.replace(/(?:番|ばん)$/, '').trim();
    const jpNumberMap = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        'いち': 1, 'に': 2, 'さん': 3, 'し': 4, 'よん': 4,
        'ご': 5, 'ろく': 6, 'なな': 7, 'しち': 7, 'はち': 8,
        'きゅう': 9, 'く': 9, 'じゅう': 10,
    };
    if (jpNumberMap[withoutBan]) return jpNumberMap[withoutBan];

    return null;
};

const extractChoiceOptionsFromAssistantMessage = (content) => {
    const text = String(content || '');
    if (!text.includes(CHOICE_PROMPT_MARKER)) return [];
    return text
        .split('\n')
        .map((line) => line.trim())
        .map((line) => {
            const matched = line.match(/^(\d+)\.\s*(.+)$/);
            if (!matched) return null;
            return {
                index: Number(matched[1]),
                title: String(matched[2] || '').trim(),
            };
        })
        .filter((item) => item?.index && item?.title)
        .sort((a, b) => a.index - b.index);
};

const resolveNumberSelectionFromHistory = ({ question, history }) => {
    const selectedIndex = isNumberSelectionText(question);
    if (!selectedIndex) return null;

    const lastChoiceMessage = [...(history || [])]
        .reverse()
        .find((item) => item?.role === 'assistant' && String(item?.content || '').includes(CHOICE_PROMPT_MARKER));
    if (!lastChoiceMessage) return null;

    const options = extractChoiceOptionsFromAssistantMessage(lastChoiceMessage.content);
    if (options.length === 0) return null;

    const selected = options.find((option) => option.index === selectedIndex) || null;
    if (!selected) {
        return {
            kind: 'out_of_range',
            selectedIndex,
            options,
        };
    }

    return {
        kind: 'selected',
        selectedIndex,
        selectedTitle: selected.title,
        options,
    };
};

const shouldOfferNumberedChoices = (question, knowledgeAssessment) => {
    const hits = Array.isArray(knowledgeAssessment?.hits) ? knowledgeAssessment.hits : [];
    if (hits.length < 2) return false;

    const q = String(question || '').trim();
    if (!q) return false;

    const isLikelyAbstract = q.length <= 30 || ABSTRACT_HINT_PATTERNS.some((token) => q.includes(token));
    const lowSpecificity = (knowledgeAssessment?.top?.matchedKeywords?.length || 0) <= 2;
    const nearTie = (knowledgeAssessment?.scoreGap || 0) <= 3;
    const uncertain = knowledgeAssessment?.confidence !== 'high';

    return knowledgeAssessment?.shouldAskClarification || (isLikelyAbstract && lowSpecificity && (nearTie || uncertain));
};

const shouldForcePagePriorityDirectAnswer = ({ answerMode, currentView, knowledgeAssessment }) => {
    if (answerMode !== ASSISTANT_ANSWER_MODE.PAGE_FIRST) return false;
    const topEntry = knowledgeAssessment?.top?.entry;
    if (!topEntry) return false;
    const viewMatched = Array.isArray(topEntry.views) ? topEntry.views.includes(currentView) : false;
    if (!viewMatched) return false;
    const score = Number(knowledgeAssessment?.bestScore || 0);
    const confidence = String(knowledgeAssessment?.confidence || '');
    if (confidence === 'high') return true;
    return confidence === 'medium' && score >= 8;
};

const truncateText = (text, max = 44) => {
    const value = String(text || '').trim();
    if (!value) return '';
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
};

const buildNumberedChoicePrompt = ({ knowledgeAssessment, currentViewLabel = '' }) => {
    const hits = (knowledgeAssessment?.hits || []).slice(0, 3);
    if (hits.length === 0) return '';

    const isCsvFocused = hits.every((hit) => {
        const title = String(hit?.entry?.title || '');
        const kw = Array.isArray(hit?.entry?.keywords) ? hit.entry.keywords.join(' ') : '';
        return /csv|価格データ|取込/i.test(`${title} ${kw}`);
    });

    const lines = [];
    lines.push('質問が抽象的なので、先に候補を絞ります。');
    lines.push(isCsvFocused ? '以下のどのCSVですか？' : '以下のどの操作ですか？');
    if (currentViewLabel) {
        lines.push(`現在画面として認識: ${currentViewLabel}`);
    }
    lines.push(CHOICE_PROMPT_MARKER);

    hits.forEach((hit, idx) => {
        const entry = hit?.entry;
        const title = String(entry?.title || `候補${idx + 1}`);
        const preview = truncateText(entry?.steps?.[0] || '');
        lines.push(`${idx + 1}. ${title}`);
        if (preview) lines.push(`   例: ${preview}`);
    });

    lines.push(`返信例: ${Math.min(2, hits.length)}`);
    return lines.join('\n');
};

const buildAugmentedQuestion = (question, history = []) => {
    const q = String(question || '').trim();
    if (!q) return q;

    const isShort = q.length <= 18;
    const looksFollowup = FOLLOWUP_SHORT_PATTERNS.some((token) => q.includes(token));
    if (!isShort && !looksFollowup) return q;

    const recentUserMessage = [...history]
        .reverse()
        .find((item) => item?.role === 'user' && String(item?.content || '').trim() && String(item?.content || '').trim() !== q);
    if (!recentUserMessage) return q;

    return `${recentUserMessage.content}\n追質問: ${q}`;
};

const appendCodeReferenceLines = (content) => {
    const base = String(content || '').trim();
    if (!base) return base;
    return base;
};

const buildAnswerText = ({ description, steps, notes, responseStyle = 'balanced' }) => {
    const lines = [];
    const isConcise = responseStyle === 'concise';
    const normalizedDescription = String(description || '').trim();
    const normalizedSteps = (Array.isArray(steps) ? steps : [])
        .map(toStepText)
        .map((text) => text.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean)
        .slice(0, isConcise ? 3 : 6);
    const normalizedNotes = String(notes || '').trim();

    if (normalizedDescription) lines.push(normalizedDescription);
    if (normalizedSteps.length > 0) {
        normalizedSteps.forEach((step, idx) => {
            lines.push(`${idx + 1}. ${step}`);
        });
    }
    if (normalizedNotes && !isConcise) lines.push(`補足: ${normalizedNotes}`);

    return {
        content: lines.join('\n').trim(),
        stepCount: normalizedSteps.length,
    };
};

const extractRawCandidateText = (data) => {
    const parts = data?.raw?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts
        .map((part) => String(part?.text || '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
};

const extractJsonBlock = (text) => {
    const source = String(text || '');
    if (!source) return '';

    const fenced = source.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) return fenced[1].trim();

    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return source.slice(start, end + 1).trim();
    }
    return '';
};

const tryBuildAnswerFromRawText = (rawText, responseStyle = 'balanced') => {
    const jsonBlock = extractJsonBlock(rawText);
    if (!jsonBlock) return '';
    try {
        const parsed = JSON.parse(jsonBlock);
        const formatted = buildAnswerText({
            description: parsed?.description || parsed?.title,
            steps: parsed?.steps,
            notes: parsed?.notes,
            responseStyle,
        });
        return formatted.content;
    } catch {
        return '';
    }
};

const buildBestEffortFromKnowledge = (knowledgeAssessment, responseStyle = 'balanced') => {
    const topEntry = knowledgeAssessment?.top?.entry;
    if (!topEntry || !Array.isArray(topEntry.steps) || topEntry.steps.length === 0) return '';

    const isConcise = responseStyle === 'concise';
    const lines = [];
    lines.push(`推定ですが「${topEntry.title}」として案内します。`);
    topEntry.steps.slice(0, isConcise ? 3 : 5).forEach((step, idx) => {
        lines.push(`${idx + 1}. ${step}`);
    });
    if (topEntry.notes && !isConcise) {
        lines.push(`補足: ${topEntry.notes}`);
    }
    if (!isConcise) {
        lines.push('違っていたら「今いる画面名」と「押したボタン名」を1つずつ教えてください。すぐ手順を修正します。');
    }
    return lines.join('\n');
};

const buildFallbackAnswer = ({
    question,
    currentView,
    currentViewLabel,
    knowledgeAssessment,
    codeEvidence,
    responseStyle = 'balanced',
}) => {
    const bestEffortKnowledgeAnswer = buildBestEffortFromKnowledge(knowledgeAssessment, responseStyle);
    if (bestEffortKnowledgeAnswer) {
        return appendCodeReferenceLines(bestEffortKnowledgeAnswer, codeEvidence);
    }

    if (codeEvidence?.confidence === 'high' && codeEvidence.references?.length) {
        return appendCodeReferenceLines(
            [
                'コード上の関連箇所が見つかりました。次の順で試してください。',
                '1. 根拠コードの行付近にあるボタン名・ハンドラ名を画面で探します。',
                '2. そのボタン操作後の状態遷移（onClick / handle）を順に実行します。',
                '3. 期待結果と違う場合は、画面名とエラー文を添えて再質問してください。',
            ].join('\n'),
            codeEvidence
        );
    }

    if (knowledgeAssessment?.shouldAskClarification) {
        const clarification = formatOperationClarificationAnswer({
            assessment: knowledgeAssessment,
            currentViewLabel,
            currentView,
        });
        return appendCodeReferenceLines(clarification, codeEvidence);
    }

    const localAnswer = formatLocalOperationAnswer({
        question,
        currentView,
        currentViewLabel,
        responseStyle,
    });
    return appendCodeReferenceLines(localAnswer, codeEvidence);
};

const buildGeminiPrompt = ({
    question,
    currentView,
    currentViewLabel,
    roleLabel,
    history,
    codePromptText,
    codeReferences,
    pageContextText = '',
    answerMode = ASSISTANT_ANSWER_MODE.QUESTION_FIRST,
    responseStyle = 'balanced',
}) => {
    const historyText = history.length > 0
        ? history.map((item) => `${item.role === 'assistant' ? 'AI' : 'ユーザー'}: ${item.content}`).join('\n')
        : 'なし';

    const knowledgeSnippet = buildKnowledgeSnippet({ question, currentView });
    const codeSnippet = codePromptText || '関連コードなし';
    const codeRefLine = codeReferences?.length
        ? codeReferences.slice(0, 5).join(', ')
        : 'なし';
    const normalizedMode = normalizeAnswerMode(answerMode);
    const modeInstruction = normalizedMode === ASSISTANT_ANSWER_MODE.PAGE_FIRST
        ? '現在ページ優先モード: 質問が抽象的でも、まず現在画面で実行できる最有力手順を返す。'
        : '質問優先モード: 質問文を最優先し、画面情報は補助情報として使う。';
    const answerStyleInstruction = responseStyle === 'concise'
        ? '回答スタイル: 短め。結論1行 + 手順は最大3件。補足は必要最小限。'
        : responseStyle === 'detailed'
            ? '回答スタイル: 丁寧。背景を短く添え、手順は具体的に4〜6件。注意点と補足も入れる。'
            : '回答スタイル: 必要十分。冗長すぎず、短すぎず。';

    return [
        'あなたは Recipe Management アプリの操作案内アシスタントです。',
        '回答は必ず日本語。',
        'アプリ操作以外の質問には、操作質問へ言い換えるよう短く案内する。',
        '',
        `現在画面: ${currentViewLabel}`,
        `ユーザーロール: ${roleLabel}`,
        `回答モード: ${normalizedMode === ASSISTANT_ANSWER_MODE.PAGE_FIRST ? '現在ページ優先' : '質問優先'}`,
        modeInstruction,
        '',
        'ローカル操作ナレッジ:',
        knowledgeSnippet,
        '',
        'クリック時点のページスナップショット:',
        pageContextText || 'なし',
        '',
        'コード検索で抽出した関連箇所:',
        codeSnippet,
        '',
        `コード参照候補: ${codeRefLine}`,
        '',
        '直近の会話:',
        historyText,
        '',
        `質問: ${question}`,
        answerStyleInstruction,
        '',
        '以下のJSONのみを返すこと（解説文はJSON外に書かない）:',
        '{',
        '  "title": "操作案内",',
        '  "description": "結論を1行",',
        '  "servings": "",',
        '  "ingredients": [],',
        '  "steps": [',
        '    { "step": "手順1" },',
        '    { "step": "手順2" }',
        '  ],',
        '  "notes": "補足。不要なら空文字"',
        '}',
        '',
        '制約:',
        '- steps は最大6件。',
        '- 画面名・ボタン名は可能な限り具体的に。',
        '- 不明点でも回答を止めず、まず最有力の推定手順を返す。',
        '- 確認質問が必要なら1〜2件だけ返す。',
        '- 翻訳や表示切替の質問は、対象画面とボタン名を含めて案内する。',
        '- notes に根拠コードを path:line 形式で1〜3件書く。',
    ].join('\n');
};

export const operationQaService = {
    async askOperationQuestion({
        question,
        currentView,
        userRole,
        history = [],
        answerMode = ASSISTANT_ANSWER_MODE.QUESTION_FIRST,
        pageContext = null,
    }) {
        const normalizedQuestion = String(question || '').trim();
        if (!normalizedQuestion) {
            throw new Error('質問内容が空です');
        }
        const normalizedAnswerMode = normalizeAnswerMode(answerMode);
        const normalizedPageContext = normalizePageContext(pageContext);
        const pageContextText = buildPageContextText(normalizedPageContext);

        const currentViewLabel = VIEW_LABEL_MAP[currentView] || String(currentView || '不明');
        const roleLabel = userRole === 'admin' ? 'admin' : 'user';
        const normalizedHistory = normalizeHistory(history);

        const numberSelection = resolveNumberSelectionFromHistory({
            question: normalizedQuestion,
            history: normalizedHistory,
        });
        if (numberSelection?.kind === 'selected') {
            return formatLocalOperationAnswer({
                question: numberSelection.selectedTitle,
                currentView,
                currentViewLabel,
            });
        }
        if (numberSelection?.kind === 'out_of_range') {
            const max = numberSelection.options.length;
            const lines = [`候補は 1〜${max} です。番号だけ返信してください。`];
            numberSelection.options.forEach((opt) => {
                lines.push(`${opt.index}. ${opt.title}`);
            });
            return lines.join('\n');
        }

        const augmentedQuestion = buildAugmentedQuestion(normalizedQuestion, normalizedHistory);
        const reasoningQuestion = buildContextAwareQuestion({
            question: augmentedQuestion,
            answerMode: normalizedAnswerMode,
            pageContextText,
        });
        const knowledgeAssessment = assessOperationKnowledge({
            question: reasoningQuestion,
            currentView,
            limit: 3,
        });
        const responseStyle = decideResponseStyle({
            question: normalizedQuestion,
            knowledgeAssessment,
        });
        const codeEvidence = await searchCodeEvidence({
            question: reasoningQuestion,
            limit: 5,
            maxFiles: 5,
        });

        const shouldPreferPageDirect = shouldForcePagePriorityDirectAnswer({
            answerMode: normalizedAnswerMode,
            currentView,
            knowledgeAssessment,
        });

        if (shouldPreferPageDirect) {
            const localPageDirect = formatLocalOperationAnswer({
                question: reasoningQuestion,
                currentView,
                currentViewLabel,
                responseStyle,
            });
            return appendCodeReferenceLines(localPageDirect, codeEvidence);
        }

        if (shouldOfferNumberedChoices(normalizedQuestion, knowledgeAssessment)) {
            const choicePrompt = buildNumberedChoicePrompt({
                knowledgeAssessment,
                currentViewLabel,
            });
            if (choicePrompt) return choicePrompt;
        }

        if (shouldPreferLocalDirectAnswer(normalizedQuestion, knowledgeAssessment)) {
            const localDirect = formatLocalOperationAnswer({
                question: reasoningQuestion,
                currentView,
                currentViewLabel,
                responseStyle,
            });
            return appendCodeReferenceLines(localDirect, codeEvidence);
        }

        try {
            const conversationHistory = [
                ...normalizedHistory,
                { role: 'user', content: normalizedQuestion },
            ];
            const prompt = buildGeminiPrompt({
                question: reasoningQuestion,
                currentView,
                currentViewLabel,
                roleLabel,
                history: conversationHistory,
                codePromptText: codeEvidence.promptText,
                codeReferences: codeEvidence.references,
                pageContextText,
                answerMode: normalizedAnswerMode,
                responseStyle,
            });

            const { data, error } = await supabase.functions.invoke('call-gemini-api', {
                body: {
                    model: OPERATION_ASSISTANT_MODEL,
                    temperature: 0.2,
                    maxTokens: 900,
                    prompt,
                    logFeature: 'operation_qa',
                    logContext: {
                        source: 'operation_assistant',
                        feature: 'operation_qa',
                        currentView,
                        assistantMode: normalizedAnswerMode,
                    },
                },
            });

            if (error) {
                let detail = error.message || 'AI回答の取得に失敗しました';
                if (error?.context && typeof error.context.json === 'function') {
                    try {
                        const body = await error.context.json();
                        detail = body?.error || body?.message || detail;
                    } catch {
                        // Keep original message when JSON parse fails.
                    }
                }
                throw new Error(detail);
            }

            if (!data?.ok) {
                throw new Error(data?.error || 'Gemini回答の取得に失敗しました');
            }

            const recipeData = data?.recipeData || {};
            const structured = buildAnswerText({
                description: recipeData?.description || recipeData?.title,
                steps: recipeData?.steps,
                notes: recipeData?.notes,
                responseStyle,
            });
            const rawText = extractRawCandidateText(data);
            const rawStructuredContent = tryBuildAnswerFromRawText(rawText, responseStyle);

            const content = structured.content || rawStructuredContent;
            const invalidStructured = (
                !content
                || (structured.stepCount === 0 && !rawStructuredContent)
                || shouldTreatAsGenericReask(content)
            );
            if (invalidStructured) {
                return buildFallbackAnswer({
                    question: normalizedQuestion,
                    currentView,
                    currentViewLabel,
                    knowledgeAssessment,
                    codeEvidence,
                    responseStyle,
                });
            }

            return appendCodeReferenceLines(content, codeEvidence);
        } catch (e) {
            console.warn('operationQaService fallback:', e);
            return buildFallbackAnswer({
                question: normalizedQuestion,
                currentView,
                currentViewLabel,
                knowledgeAssessment,
                codeEvidence,
                responseStyle,
            });
        }
    },
};
