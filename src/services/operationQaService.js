import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../supabase';
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
    'operation-logs': '操作質問ログ',
    requests: '要望一覧',
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

const BROAD_QUESTION_PATTERNS = [
    'どうすれば',
    'どれ',
    'どこ',
    'どの',
    '何を',
    '何から',
];

const DIRECT_ANSWER_INTENT_PATTERNS = [
    /最近見た.*レシピ.*(開き直|開く)/,
    /レシピ.*共有/,
    /レシピ.*公開/,
    /公開.*非公開/,
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
const CHOICE_STAGE_1_MARKER = '【1段階目/2】';
const CHOICE_STAGE_2_MARKER = '【2段階目/2】';
const CHOICE_STAGE = {
    BROAD: 'broad',
    DETAIL: 'detail',
    LEGACY: 'legacy',
};

const BROAD_CHOICE_GROUPS = [
    {
        id: 'recipe',
        title: 'レシピを入力・編集したい',
        seedKeywords: ['レシピ', '作成', '編集', '材料', '手順', '保存'],
        matchKeywords: ['レシピ', '作成', '編集', '材料', '手順', '保存', '複製'],
        fallbackOptions: [
            'レシピを手入力で新規作成する',
            '既存レシピを編集する',
            '新規/編集で入力が期待される項目',
        ],
    },
    {
        id: 'cost',
        title: '原価・価格データを管理したい',
        seedKeywords: ['原価', '価格', 'CSV', '仕入れ', '単位', '容量', '歩留まり'],
        matchKeywords: ['原価', '価格', 'CSV', '歩留まり', '仕入れ', '単位', '容量', '区分', '未登録'],
        fallbackOptions: [
            'インフォマートから価格データを抽出して取り込む',
            'CSV取込で未登録データを登録する',
            '歩留まり（ぶどまり）の入力方法と考え方',
        ],
    },
    {
        id: 'inventory',
        title: '在庫・仕込み・発注を管理したい',
        seedKeywords: ['在庫', '仕込み', '発注', '入荷', 'カレンダー'],
        matchKeywords: ['在庫', '仕込み', '発注', '入荷', 'カレンダー', '要発注', '反映'],
        fallbackOptions: [
            '在庫管理の基本操作',
            '仕込みカレンダーの使い方',
            '発注リストを作成する',
        ],
    },
    {
        id: 'import',
        title: 'データを取り込みたい（CSV/URL/画像/PDF）',
        seedKeywords: ['取り込み', '取込', 'インポート', 'CSV', 'URL', '画像', 'PDF'],
        matchKeywords: ['取り込み', '取込', 'インポート', 'CSV', 'URL', 'Web', '画像', 'PDF', '抽出'],
        fallbackOptions: [
            'CSVをドラッグ&ドロップでアップロードする',
            'Web URLからレシピを取り込む',
            '画像からレシピを取り込む',
        ],
    },
    {
        id: 'share',
        title: '共有・公開・翻訳・印刷をしたい',
        seedKeywords: ['共有', '公開', '非公開', '翻訳', '印刷', 'プレビュー'],
        matchKeywords: ['共有', '公開', '非公開', '翻訳', '印刷', 'プレビュー', 'PDF', '原文'],
        fallbackOptions: [
            '自分のレシピを共有・公開/非公開する',
            'レシピ詳細をフランス語などに翻訳する',
            'レシピ詳細を印刷・プレビューする',
        ],
    },
    {
        id: 'navigation',
        title: 'どの画面・ボタンを使うか知りたい',
        seedKeywords: ['画面', 'ボタン', 'どこ', '移動', 'メニュー'],
        matchKeywords: ['画面', 'ボタン', 'メニュー', '移動', 'どこ', 'タブ', '使い方'],
        fallbackOptions: [
            'スライドメニュー各ボタンの操作内容',
            'データ管理の各タブの使い分け',
            '目的の画面へ移動する方法',
        ],
    },
];

const ASSISTANT_ANSWER_MODE = {
    QUESTION_FIRST: 'question-first',
    PAGE_FIRST: 'page-first',
};

const normalizeAnswerMode = (mode) => (
    mode === ASSISTANT_ANSWER_MODE.PAGE_FIRST
        ? ASSISTANT_ANSWER_MODE.PAGE_FIRST
        : ASSISTANT_ANSWER_MODE.QUESTION_FIRST
);

const ASSISTANT_RESPONSE_POLICY = {
    HYBRID: 'hybrid',
    AI_PRIMARY: 'ai-primary',
};

const normalizeResponsePolicy = (policy) => (
    policy === ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
        ? ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
        : ASSISTANT_RESPONSE_POLICY.HYBRID
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
        .replace(/[。．.!！?？、,，]+$/g, '')
        .trim();
    if (!cleaned) return null;

    const directNumber = cleaned.match(/^[(（[]?\s*([1-9]\d*)\s*[)）\]]?\s*(?:番|ばん)?$/);
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

const normalizeChoiceText = (value) => {
    return String(value || '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
};

const detectChoiceStageFromMessage = (content) => {
    const text = String(content || '');
    if (text.includes(CHOICE_STAGE_2_MARKER)) return CHOICE_STAGE.DETAIL;
    if (text.includes(CHOICE_STAGE_1_MARKER)) return CHOICE_STAGE.BROAD;
    return CHOICE_STAGE.LEGACY;
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

    const stage = detectChoiceStageFromMessage(lastChoiceMessage.content);
    const selected = options.find((option) => option.index === selectedIndex) || null;
    if (!selected) {
        return {
            kind: 'out_of_range',
            stage,
            selectedIndex,
            options,
        };
    }

    return {
        kind: 'selected',
        stage,
        selectedIndex,
        selectedTitle: selected.title,
        options,
    };
};

const shouldOfferNumberedChoices = (question, knowledgeAssessment) => {
    const hits = Array.isArray(knowledgeAssessment?.hits) ? knowledgeAssessment.hits : [];
    if (hits.length === 0) return false;

    const q = String(question || '').trim();
    if (!q) return false;

    const top = knowledgeAssessment?.top || null;
    const topScore = Number(knowledgeAssessment?.bestScore || 0);
    const topKeywordCount = Number(top?.matchedKeywords?.length || 0);
    const scoreGap = Number(knowledgeAssessment?.scoreGap || 0);
    const titleSimilarity = Number(top?.titleSimilarity || 0);
    const titleStrong = top?.titleMatched === true || titleSimilarity >= 0.34;

    const hasRequestVerb = /(方法|手順|やり方|教えて|したい)/.test(q);
    const hasBroadQuestionSignal = BROAD_QUESTION_PATTERNS.some((token) => q.includes(token));
    const forcedDirectByIntent = DIRECT_ANSWER_INTENT_PATTERNS.some((re) => re.test(q));
    const clearWinner = topScore >= 8 && scoreGap >= 4;
    const likelyConcrete = (
        hasRequestVerb
        && !hasBroadQuestionSignal
        && (
            titleStrong
            || (topScore >= 9 && topKeywordCount >= 1)
            || (topScore >= 8 && topKeywordCount >= 2)
        )
    );
    if (forcedDirectByIntent || clearWinner || likelyConcrete) {
        return false;
    }

    const isLikelyAbstract = q.length <= 30 || ABSTRACT_HINT_PATTERNS.some((token) => q.includes(token));
    const lowSpecificity = topKeywordCount <= 2;
    const nearTie = scoreGap <= 3;
    const uncertain = knowledgeAssessment?.confidence !== 'high' || topScore < 10;

    return knowledgeAssessment?.shouldAskClarification || (isLikelyAbstract && (nearTie || (lowSpecificity && uncertain)));
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

const getBroadChoiceGroupByTitle = (title) => {
    const normalized = normalizeChoiceText(title);
    if (!normalized) return null;
    return BROAD_CHOICE_GROUPS.find((group) => normalizeChoiceText(group.title) === normalized) || null;
};

const matchEntryAgainstBroadGroup = (entry, group) => {
    if (!entry || !group) return false;
    const combined = [
        entry.id,
        entry.title,
        Array.isArray(entry.keywords) ? entry.keywords.join(' ') : '',
        Array.isArray(entry.views) ? entry.views.join(' ') : '',
    ]
        .map((part) => String(part || '').toLowerCase())
        .join(' ');
    return (group.matchKeywords || []).some((keyword) => (
        combined.includes(String(keyword || '').toLowerCase())
    ));
};

const rankBroadChoiceGroups = ({ question, knowledgeAssessment }) => {
    const q = String(question || '').toLowerCase();
    const hits = Array.isArray(knowledgeAssessment?.hits) ? knowledgeAssessment.hits : [];
    return BROAD_CHOICE_GROUPS
        .map((group, order) => {
            let score = 0;
            (group.seedKeywords || []).forEach((keyword) => {
                if (q.includes(String(keyword || '').toLowerCase())) score += 2;
            });
            hits.forEach((hit, idx) => {
                if (matchEntryAgainstBroadGroup(hit?.entry, group)) {
                    score += idx === 0 ? 3 : 2;
                }
            });
            return { group, score, order };
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.order - b.order;
        })
        .map((item) => item.group);
};

const findLatestNonSelectionUserQuestion = (history) => {
    const items = Array.isArray(history) ? history : [];
    const userMessages = items
        .filter((item) => item?.role === 'user')
        .map((item) => String(item?.content || '').trim())
        .filter(Boolean)
        .reverse();
    return userMessages.find((text) => !isNumberSelectionText(text)) || '';
};

const buildDetailedChoiceOptions = ({ selectedGroup, intentQuestion, currentView }) => {
    if (!selectedGroup) return [];

    const seed = [intentQuestion, ...(selectedGroup.seedKeywords || [])]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join(' ');
    const scopedAssessment = assessOperationKnowledge({
        question: seed,
        currentView,
        limit: 12,
    });
    const scopedHits = Array.isArray(scopedAssessment?.hits) ? scopedAssessment.hits : [];

    const options = [];
    const seen = new Set();
    scopedHits.forEach((hit) => {
        const entry = hit?.entry;
        if (!entry || !matchEntryAgainstBroadGroup(entry, selectedGroup)) return;
        const title = String(entry.title || '').trim();
        if (!title || seen.has(title)) return;
        seen.add(title);
        options.push({
            title,
            preview: truncateText(entry?.steps?.[0] || '', 52),
        });
    });

    if (options.length < 3) {
        (selectedGroup.fallbackOptions || []).forEach((title) => {
            const normalized = normalizeChoiceText(title);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            options.push({
                title: normalized,
                preview: '',
            });
        });
    }

    return options.slice(0, 5);
};

const buildNumberedChoicePrompt = ({ question, knowledgeAssessment, currentViewLabel = '' }) => {
    const groups = rankBroadChoiceGroups({ question, knowledgeAssessment }).slice(0, 6);
    if (groups.length === 0) return '';

    const lines = [];
    lines.push('質問が抽象的なので、2段階で候補を絞ります。');
    lines.push(CHOICE_STAGE_1_MARKER);
    lines.push('まず、目的に近いものを選んでください。');
    if (currentViewLabel) {
        lines.push(`現在画面として認識: ${currentViewLabel}`);
    }
    lines.push(CHOICE_PROMPT_MARKER);

    groups.forEach((group, idx) => {
        lines.push(`${idx + 1}. ${group.title}`);
    });
    lines.push(`返信例: ${Math.min(2, groups.length)}`);
    return lines.join('\n');
};

const buildSecondStageChoicePrompt = ({
    selectedGroup,
    intentQuestion,
    currentView,
    currentViewLabel = '',
}) => {
    if (!selectedGroup) return '';
    const options = buildDetailedChoiceOptions({ selectedGroup, intentQuestion, currentView });
    if (options.length === 0) return '';

    const lines = [];
    lines.push('ありがとうございます。続けて候補を絞ります。');
    lines.push(CHOICE_STAGE_2_MARKER);
    lines.push(`「${selectedGroup.title}」の中で、近い項目を選んでください。`);
    if (currentViewLabel) {
        lines.push(`現在画面として認識: ${currentViewLabel}`);
    }
    lines.push(CHOICE_PROMPT_MARKER);

    options.forEach((option, idx) => {
        lines.push(`${idx + 1}. ${option.title}`);
        if (option.preview) lines.push(`   例: ${option.preview}`);
    });
    lines.push(`返信例: ${Math.min(2, options.length)}`);
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

const isInternalReferenceLine = (line) => {
    const text = String(line || '').trim();
    if (!text) return false;
    const normalized = text.replace(/^[-*•]\s*/, '');
    if (/^(根拠コード|コード参照候補)\s*[:：]/.test(normalized)) return true;
    return /^\.?\/?[\w./-]+\.(?:js|jsx|ts|tsx|css|sql|json|md|mjs|cjs):\d+(?::\d+)?$/.test(normalized);
};

const sanitizeOperationAnswerContent = (content) => {
    const text = String(content || '').replace(/\r\n/g, '\n').trim();
    if (!text) return '';
    const filtered = text
        .split('\n')
        .filter((line) => !isInternalReferenceLine(line));
    return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
    const normalizedNotes = sanitizeOperationAnswerContent(String(notes || '').trim());

    if (normalizedDescription) lines.push(normalizedDescription);
    if (normalizedSteps.length > 0) {
        normalizedSteps.forEach((step, idx) => {
            lines.push(`${idx + 1}. ${step}`);
        });
    }
    if (normalizedNotes && !isConcise) lines.push(`補足: ${normalizedNotes}`);

    return {
        content: sanitizeOperationAnswerContent(lines.join('\n').trim()),
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
        return sanitizeOperationAnswerContent(formatted.content);
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
    ].join('\n');
};

const toNullableInt = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.trunc(n);
};

const toNullableNumber = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
};

const trimForLog = (value, max = 12000) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max);
};

const extractGeminiUsage = (responseData) => {
    const usage = responseData?.raw?.usageMetadata || {};
    const inputTokensFromBody = toNullableInt(responseData?.usage?.inputTokens);
    const outputTokensFromBody = toNullableInt(responseData?.usage?.outputTokens);
    const estimatedCostFromBody = toNullableNumber(responseData?.usage?.estimatedCostJpy);
    return {
        inputTokens: inputTokensFromBody ?? toNullableInt(usage?.promptTokenCount),
        outputTokens: outputTokensFromBody ?? toNullableInt(usage?.candidatesTokenCount),
        estimatedCostJpy: estimatedCostFromBody,
    };
};

const GEMINI_RATES_JPY_PER_1M = {
    'gemini-2.5-flash-lite': { input: 2, output: 6 },
    'gemini-1.5-flash': { input: 5, output: 15 },
    'gemini-2.0-flash': { input: 10, output: 30 },
    'gemini-2.5-pro': { input: 150, output: 400 },
    'gemini-pro': { input: 75, output: 200 },
};

const normalizeGeminiModelNameForCost = (modelName) => {
    const normalized = String(modelName || '').trim().toLowerCase();
    if (!normalized) return 'gemini-1.5-flash';
    if (normalized.includes('flash-lite')) return 'gemini-2.5-flash-lite';
    if (normalized.includes('2.5-pro') || normalized.includes('pro')) return 'gemini-2.5-pro';
    if (normalized.includes('2.0-flash')) return 'gemini-2.0-flash';
    if (normalized.includes('1.5-flash') || normalized.includes('flash')) return 'gemini-1.5-flash';
    return 'gemini-1.5-flash';
};

const estimateGeminiCostJpy = ({
    modelName,
    inputTokens,
    outputTokens,
}) => {
    const normalizedModel = normalizeGeminiModelNameForCost(modelName);
    const rate = GEMINI_RATES_JPY_PER_1M[normalizedModel] || GEMINI_RATES_JPY_PER_1M['gemini-1.5-flash'];
    const inTokens = Number.isFinite(Number(inputTokens)) ? Math.max(0, Number(inputTokens)) : 0;
    const outTokens = Number.isFinite(Number(outputTokens)) ? Math.max(0, Number(outputTokens)) : 0;
    const total = ((inTokens / 1_000_000) * rate.input) + ((outTokens / 1_000_000) * rate.output);
    return Math.round(total * 1_000_000) / 1_000_000;
};

const fetchCurrentAuthUser = async () => {
    try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
            console.warn('operationQaService: failed to resolve auth user for logging', error);
            return null;
        }
        return data?.user || null;
    } catch (error) {
        console.warn('operationQaService: unexpected auth.getUser error', error);
        return null;
    }
};

const resolveFunctionAccessToken = async ({ forceRefresh = false } = {}) => {
    try {
        if (forceRefresh) {
            const { data, error } = await supabase.auth.refreshSession();
            if (error) {
                console.warn('operationQaService: failed to refresh auth session for function invoke', error);
            }
            const refreshed = String(data?.session?.access_token || '').trim();
            if (refreshed) return refreshed;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.warn('operationQaService: failed to resolve auth session for function invoke', error);
            return '';
        }
        return String(data?.session?.access_token || '').trim();
    } catch (error) {
        console.warn('operationQaService: unexpected auth.getSession error', error);
        return '';
    }
};

const invokeGeminiFunction = async ({ payload, accessToken = '' }) => {
    const endpoint = `${String(SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/call-gemini-api`;
    const headers = {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
    };
    const token = String(accessToken || '').trim();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
    } catch (error) {
        return {
            data: null,
            error: {
                message: error instanceof Error ? error.message : String(error || 'request failed'),
            },
        };
    }

    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (!response.ok) {
        return {
            data: null,
            error: {
                message: String(body?.error || body?.message || `${response.status} ${response.statusText}`),
                status: response.status,
                body,
            },
        };
    }

    return {
        data: body,
        error: null,
    };
};

const writeOperationQaLog = async ({
    authUser,
    userRole,
    currentView,
    answerMode,
    question,
    answer,
    aiUsed = false,
    aiAttempted = false,
    answerSource = 'local',
    aiModel = null,
    aiStatus = null,
    inputTokens = null,
    outputTokens = null,
    estimatedCostJpy = null,
    metadata = {},
}) => {
    if (!authUser?.id) return null;

    const payload = {
        user_id: authUser.id,
        user_email: authUser.email || null,
        user_role: userRole === 'admin' ? 'admin' : 'user',
        current_view: String(currentView || '').trim() || null,
        answer_mode: normalizeAnswerMode(answerMode),
        question: trimForLog(question, 8000),
        answer: trimForLog(answer, 20000),
        ai_used: aiUsed === true,
        ai_attempted: aiAttempted === true || aiUsed === true,
        answer_source: String(answerSource || 'local'),
        ai_model: aiModel ? String(aiModel) : null,
        ai_status: aiStatus ? String(aiStatus) : null,
        input_tokens: toNullableInt(inputTokens),
        output_tokens: toNullableInt(outputTokens),
        estimated_cost_jpy: toNullableNumber(estimatedCostJpy),
        metadata: (metadata && typeof metadata === 'object') ? metadata : {},
    };

    try {
        const { data, error } = await supabase
            .from('operation_qa_logs')
            .insert(payload)
            .select('id, rating_score')
            .single();
        if (error) {
            console.warn('operationQaService: failed to write operation_qa_logs', error);
            return null;
        }
        return data || null;
    } catch (error) {
        console.warn('operationQaService: unexpected log insert error', error);
        return null;
    }
};

const buildOperationAnswerResult = ({
    content,
    aiUsed = false,
    aiAttempted = false,
    answerSource = 'local',
    aiModel = null,
    aiStatus = null,
    inputTokens = null,
    outputTokens = null,
    estimatedCostJpy = null,
    logId = null,
    ratingScore = null,
}) => ({
    content: String(content || '').trim(),
    aiUsed: aiUsed === true,
    aiAttempted: aiAttempted === true || aiUsed === true,
    answerSource: String(answerSource || 'local'),
    aiModel: aiModel ? String(aiModel) : null,
    aiStatus: aiStatus ? String(aiStatus) : null,
    inputTokens: toNullableInt(inputTokens),
    outputTokens: toNullableInt(outputTokens),
    estimatedCostJpy: toNullableNumber(estimatedCostJpy),
    logId: logId ? String(logId) : null,
    ratingScore: toNullableInt(ratingScore),
});

export const operationQaService = {
    async askOperationQuestion({
        question,
        currentView,
        userRole,
        history = [],
        answerMode = ASSISTANT_ANSWER_MODE.QUESTION_FIRST,
        responsePolicy = ASSISTANT_RESPONSE_POLICY.HYBRID,
        pageContext = null,
    }) {
        const normalizedQuestion = String(question || '').trim();
        if (!normalizedQuestion) {
            throw new Error('質問内容が空です');
        }
        const normalizedAnswerMode = normalizeAnswerMode(answerMode);
        const normalizedResponsePolicy = normalizeResponsePolicy(responsePolicy);
        const normalizedPageContext = normalizePageContext(pageContext);
        const pageContextText = buildPageContextText(normalizedPageContext);

        const currentViewLabel = VIEW_LABEL_MAP[currentView] || String(currentView || '不明');
        const roleLabel = userRole === 'admin' ? 'admin' : 'user';
        const normalizedHistory = normalizeHistory(history);
        const authUser = await fetchCurrentAuthUser();

        const finalizeAnswer = async ({
            content,
            aiUsed = false,
            aiAttempted = false,
            answerSource = 'local',
            aiModel = null,
            aiStatus = null,
            inputTokens = null,
            outputTokens = null,
            estimatedCostJpy = null,
            metadata = {},
        }) => {
            const sanitizedContent = sanitizeOperationAnswerContent(content);
            const logRow = await writeOperationQaLog({
                authUser,
                userRole,
                currentView,
                answerMode: normalizedAnswerMode,
                question: normalizedQuestion,
                answer: sanitizedContent,
                aiUsed,
                aiAttempted,
                answerSource,
                aiModel,
                aiStatus,
                inputTokens,
                outputTokens,
                estimatedCostJpy,
                metadata: {
                    current_view_label: currentViewLabel,
                    page_context: normalizedPageContext || null,
                    response_policy: normalizedResponsePolicy,
                    ...(metadata && typeof metadata === 'object' ? metadata : {}),
                },
            });

            const result = buildOperationAnswerResult({
                content: sanitizedContent,
                aiUsed,
                aiAttempted,
                answerSource,
                aiModel,
                aiStatus,
                inputTokens,
                outputTokens,
                estimatedCostJpy,
                logId: logRow?.id || null,
                ratingScore: logRow?.rating_score ?? null,
            });

            return result;
        };

        const numberSelection = resolveNumberSelectionFromHistory({
            question: normalizedQuestion,
            history: normalizedHistory,
        });
        if (numberSelection?.kind === 'selected') {
            if (numberSelection.stage === CHOICE_STAGE.BROAD) {
                const selectedGroup = getBroadChoiceGroupByTitle(numberSelection.selectedTitle);
                const intentQuestion = findLatestNonSelectionUserQuestion(normalizedHistory);
                const secondStagePrompt = buildSecondStageChoicePrompt({
                    selectedGroup,
                    intentQuestion,
                    currentView,
                    currentViewLabel,
                });
                if (secondStagePrompt) {
                    return finalizeAnswer({
                        content: secondStagePrompt,
                        answerSource: 'local_choice_prompt_stage2',
                        aiStatus: 'not_used',
                        metadata: {
                            selection_kind: 'selected',
                            selection_stage: CHOICE_STAGE.BROAD,
                            selected_index: numberSelection.selectedIndex,
                            selected_title: numberSelection.selectedTitle,
                            intent_question: intentQuestion || null,
                        },
                    });
                }
            }

            const selectedAnswer = formatLocalOperationAnswer({
                question: numberSelection.selectedTitle,
                currentView,
                currentViewLabel,
            });
            return finalizeAnswer({
                content: selectedAnswer,
                answerSource: 'local_number_selection',
                aiStatus: 'not_used',
                metadata: {
                    selection_kind: 'selected',
                    selection_stage: numberSelection.stage || CHOICE_STAGE.LEGACY,
                    selected_index: numberSelection.selectedIndex,
                    selected_title: numberSelection.selectedTitle,
                },
            });
        }
        if (numberSelection?.kind === 'out_of_range') {
            const max = numberSelection.options.length;
            const stageHint = numberSelection.stage === CHOICE_STAGE.BROAD
                ? '1段階目'
                : numberSelection.stage === CHOICE_STAGE.DETAIL
                    ? '2段階目'
                    : '候補';
            const lines = [`${stageHint}の候補は 1〜${max} です。${CHOICE_PROMPT_MARKER}`];
            numberSelection.options.forEach((opt) => {
                lines.push(`${opt.index}. ${opt.title}`);
            });
            return finalizeAnswer({
                content: lines.join('\n'),
                answerSource: 'local_number_out_of_range',
                aiStatus: 'not_used',
                metadata: {
                    selection_kind: 'out_of_range',
                    selection_stage: numberSelection.stage || CHOICE_STAGE.LEGACY,
                    selected_index: numberSelection.selectedIndex,
                    option_count: max,
                },
            });
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

        if (
            normalizedResponsePolicy !== ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
            && shouldPreferPageDirect
        ) {
            const localPageDirect = formatLocalOperationAnswer({
                question: reasoningQuestion,
                currentView,
                currentViewLabel,
                responseStyle,
            });
            return finalizeAnswer({
                content: appendCodeReferenceLines(localPageDirect, codeEvidence),
                answerSource: 'local_page_priority',
                aiStatus: 'not_used',
                metadata: {
                    response_style: responseStyle,
                    reason: 'page_priority_direct',
                    knowledge_confidence: knowledgeAssessment?.confidence || null,
                    knowledge_best_score: knowledgeAssessment?.bestScore ?? null,
                },
            });
        }

        if (
            normalizedResponsePolicy !== ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
            && shouldOfferNumberedChoices(normalizedQuestion, knowledgeAssessment)
        ) {
            const choicePrompt = buildNumberedChoicePrompt({
                question: normalizedQuestion,
                knowledgeAssessment,
                currentViewLabel,
            });
            if (choicePrompt) {
                return finalizeAnswer({
                    content: choicePrompt,
                    answerSource: 'local_choice_prompt',
                    aiStatus: 'not_used',
                    metadata: {
                        response_style: responseStyle,
                        reason: 'numbered_choices_stage1',
                        knowledge_confidence: knowledgeAssessment?.confidence || null,
                        knowledge_best_score: knowledgeAssessment?.bestScore ?? null,
                    },
                });
            }
        }

        if (
            normalizedResponsePolicy !== ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
            && shouldPreferLocalDirectAnswer(normalizedQuestion, knowledgeAssessment)
        ) {
            const localDirect = formatLocalOperationAnswer({
                question: reasoningQuestion,
                currentView,
                currentViewLabel,
                responseStyle,
            });
            return finalizeAnswer({
                content: appendCodeReferenceLines(localDirect, codeEvidence),
                answerSource: 'local_direct',
                aiStatus: 'not_used',
                metadata: {
                    response_style: responseStyle,
                    reason: 'high_confidence_local',
                    knowledge_confidence: knowledgeAssessment?.confidence || null,
                    knowledge_best_score: knowledgeAssessment?.bestScore ?? null,
                },
            });
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

            const requestPayload = {
                model: OPERATION_ASSISTANT_MODEL,
                temperature: 0.2,
                maxTokens: responseStyle === 'concise' ? 500 : responseStyle === 'detailed' ? 900 : 700,
                prompt,
                logFeature: 'operation_qa',
                logContext: {
                    source: 'operation_assistant',
                    feature: 'operation_qa',
                    currentView,
                    assistantMode: normalizedAnswerMode,
                    responsePolicy: normalizedResponsePolicy,
                },
            };

            let accessToken = await resolveFunctionAccessToken();
            let { data, error } = await invokeGeminiFunction({
                payload: requestPayload,
                accessToken,
            });

            if (error && /invalid jwt/i.test(String(error.message || ''))) {
                const refreshedToken = await resolveFunctionAccessToken({ forceRefresh: true });
                if (refreshedToken && refreshedToken !== accessToken) {
                    accessToken = refreshedToken;
                    const retried = await invokeGeminiFunction({
                        payload: requestPayload,
                        accessToken,
                    });
                    data = retried.data;
                    error = retried.error;
                }
            }

            if (error) {
                let detail = error.message || 'AI回答の取得に失敗しました';
                if (error?.body && typeof error.body === 'object') {
                    detail = error.body?.error || error.body?.message || detail;
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
            const usage = extractGeminiUsage(data);
            const estimatedCostJpy = usage.estimatedCostJpy ?? estimateGeminiCostJpy({
                modelName: OPERATION_ASSISTANT_MODEL,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
            });
            const invalidStructured = (
                !content
                || (structured.stepCount === 0 && !rawStructuredContent)
                || shouldTreatAsGenericReask(content)
            );
            if (invalidStructured) {
                const fallback = buildFallbackAnswer({
                    question: normalizedQuestion,
                    currentView,
                    currentViewLabel,
                    knowledgeAssessment,
                    codeEvidence,
                    responseStyle,
                });
                return finalizeAnswer({
                    content: fallback,
                    aiUsed: false,
                    aiAttempted: true,
                    answerSource: normalizedResponsePolicy === ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
                        ? 'local_fallback_after_ai_invalid_ai_primary'
                        : 'local_fallback_after_ai_invalid',
                    aiModel: OPERATION_ASSISTANT_MODEL,
                    aiStatus: 'invalid_structured_fallback',
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    estimatedCostJpy,
                    metadata: {
                        response_style: responseStyle,
                        knowledge_confidence: knowledgeAssessment?.confidence || null,
                        knowledge_best_score: knowledgeAssessment?.bestScore ?? null,
                    },
                });
            }

            return finalizeAnswer({
                content: appendCodeReferenceLines(content, codeEvidence),
                aiUsed: true,
                aiAttempted: true,
                answerSource: normalizedResponsePolicy === ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
                    ? 'ai_primary'
                    : 'ai_direct',
                aiModel: OPERATION_ASSISTANT_MODEL,
                aiStatus: 'success',
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                estimatedCostJpy,
                metadata: {
                    response_style: responseStyle,
                    knowledge_confidence: knowledgeAssessment?.confidence || null,
                    knowledge_best_score: knowledgeAssessment?.bestScore ?? null,
                },
            });
        } catch (e) {
            console.warn('operationQaService fallback:', e);
            const fallback = buildFallbackAnswer({
                question: normalizedQuestion,
                currentView,
                currentViewLabel,
                knowledgeAssessment,
                codeEvidence,
                responseStyle,
            });
            return finalizeAnswer({
                content: fallback,
                aiUsed: false,
                aiAttempted: true,
                answerSource: normalizedResponsePolicy === ASSISTANT_RESPONSE_POLICY.AI_PRIMARY
                    ? 'local_fallback_after_ai_error_ai_primary'
                    : 'local_fallback_after_ai_error',
                aiModel: OPERATION_ASSISTANT_MODEL,
                aiStatus: 'error_fallback',
                metadata: {
                    response_style: responseStyle,
                    ai_error: e instanceof Error ? e.message : String(e || ''),
                    knowledge_confidence: knowledgeAssessment?.confidence || null,
                    knowledge_best_score: knowledgeAssessment?.bestScore ?? null,
                },
            });
        }
    },
    async rateOperationAnswer({ logId, ratingScore }) {
        const id = String(logId || '').trim();
        const score = Number(ratingScore);
        if (!id) throw new Error('評価対象のログIDがありません');
        if (!Number.isInteger(score) || score < 1 || score > 5) {
            throw new Error('評価は1〜5で指定してください');
        }

        const { data, error } = await supabase.rpc('rate_operation_qa_log', {
            p_log_id: id,
            p_rating: score,
        });
        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        return {
            id: row?.id || id,
            ratingScore: toNullableInt(row?.rating_score ?? score),
            ratedAt: row?.rated_at || null,
        };
    },
};
