const n=`import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase';
import {
    buildRecipeAiMemoryContext,
    logRecipeAiRun,
} from './recipeAiLearningService';

const SAKANA_PROVIDER_NAME = 'Sakana AI';
const GROQ_PROVIDER_NAME = 'Groq';
const OPENAI_PROVIDER_NAME = 'OpenAI';
const PERPLEXITY_PROVIDER_NAME = 'Perplexity';

const PROVIDER_DISPLAY_NAMES = {
    'sakana-subscription': 'Sakana AI（サブスク）',
    'sakana-payg': 'Sakana AI（従量課金）',
    groq: GROQ_PROVIDER_NAME,
    openai: OPENAI_PROVIDER_NAME,
    perplexity: PERPLEXITY_PROVIDER_NAME,
};

const AI_SETTINGS_PROVIDER_KEY = 'recipe_ai_provider';
const LEGACY_PROVIDER_KEY = 'api_provider';

// Sakana AI は原価が高いためロック。解除パスワードが一致した端末のみ選択可能にする。
// （クライアント側の簡易ロックであり、厳密なアクセス制御ではない）
const SAKANA_UNLOCK_KEY = 'recipe_ai_sakana_unlocked';
const SAKANA_LOCK_PASSWORD = 'marugo';

const DEFAULT_MODEL = 'fugu';
const GROQ_DEFAULT_TEXT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_COMPOUND_MODEL = 'groq/compound';
const OPENAI_REBUTTAL_MODEL = 'gpt-4.1-mini';
const OPENAI_AUDITOR_MODEL = 'o4-mini';
// コストと品質のバランスを優先し、重要な監査のみ o4-mini を残し、反証と統合は gpt-4.1-mini を使用する。
const OPENAI_MASTER_MODEL = 'gpt-4.1-mini';
const PERPLEXITY_DEFAULT_MODEL = 'sonar';
const REQUEST_TIMEOUT_MS = 600000;

const STRICT_JSON_OUTPUT_RULES = \`
【JSON出力の絶対ルール】
- 出力は純粋なJSONオブジェクト1個だけ。Markdown、コードブロック、説明文、前置き、末尾コメントは禁止。
- 指定されたキー名・配列・型を守る。存在しない値は空文字または空配列で埋め、キー自体は省略しない。
- 内部検討は出力しない。最終JSONに入れるのは検証済みの結論、留保、次確認点だけ。
\`;

const EVIDENCE_DISCIPLINE_RULES = \`
【根拠・正確性ルール】
- すべての断定は、入力情報・レシピ本文・Web調査結果のどれに基づくかを区別して書く。
- Web検索を実行していない呼び出しでは、「検索した」「最新トレンドで確認した」と書かない。
- 数値（温度、時間、比率、塩分%、中心温度など）は、入力またはWeb調査に根拠がある場合だけ断定する。
- 材料リストに存在しない素材・添加物・技法を、解説や比較に持ち込まない。
- 各エージェントのcontentは、可能な限り「根拠 → 判断 → 留保/改善」の順で書く。
- 季節・薬膳・養生の文脈は扱わない。
\`;

const METRIC_UNIT_RULES = \`
【単位ルール】
- 材料欄の quantity は数値または数値レンジ、unit は "g" または "ml" のみとする。
- 材料欄では大さじ、小さじ、カップ、cup、tbsp、tsp、個、本、枚、少々、適量などの曖昧な単位や個数表現は使わない。
- 卵、にんにく、板ゼラチンなども、そのまま個数で書かず、配合として扱える g または ml に換算して書く。kg や L も使わず g または ml に統一する。
- 手順や回答の文章でも分量は g または ml を基準にする。作業の説明上どうしても個数・本数などの表現が必要な場合は、必ず g または ml の目安を併記する（例: 生地を1本約260gに分割）。
- 「少々」「適量」のような計量できない表現は文章中でも使わず、必ず具体的な g または ml で書く。
\`;

const DIRECTION_LOCK_RULES = \`
【事前確認回答の拘束ルール】
- 「【事前確認で確定した方針】」がある場合、それは参考情報ではなく必須条件として扱う。
- 特に、添加物・機能材の可否、禁止素材、原価許容、オペレーション制約、本場性の方針は、全エージェントと最終統合で必ず守る。
- ユーザーが「一切使わない」と答えた添加物・機能材は、例示・推奨・代替候補としても軽々しく出さない。必要なら「その条件では不採用」と明記する。
- ユーザーが「最小限なら可」と答えた場合も、むやみに使わず、使う必然性、用途、最小量の考え方を示す。
- ユーザー回答と衝突する案を出してはいけない。衝突がある場合は、案を出す前にその衝突自体をリスクとして明記する。
- 回答の要約を勝手に丸めず、実際の制約として配合、材料、工程、説明に反映する。
\`;

const WEB_RESEARCH_AGENT_PROTOCOL = \`
【Web調査プロトコル】
- 検索可能な呼び出しでは、SNSや匿名まとめより、料理学校、専門料理メディア、シェフ/レストラン、技術記事、食品科学系ソースを優先する。
- Webで確認できた事実と、料理人としての推測を分ける。
- ソース間で割れる点は「割れている」と書き、都合の良い一方だけを採用しない。
- 確認できない温度・比率・由来・著名シェフ名は断定しない。
- 本場料理の比較では、可能なら現地語・現地国のソースも参照し、日本語サイトや国内向けレシピとの差も比較材料として扱う。
\`;

const AUTHENTIC_SOURCE_COMPARISON_RULES = \`
【海外・本場比較ルール】
- 料理名・地域・ジャンルが推定できる場合は、日本語サイトだけで判断せず、英語または本場圏の現地語ソースも検索する。
- 最低でも「日本語圏の実務/レシピ傾向」と「海外または本場圏の標準・専門ソース」の差を比較する。
- 海外ソースは料理学校、専門料理メディア、シェフ/レストラン、地域文化ソース、技術記事を優先する。
- 海外版と日本版で差がある場合は、材料、比率、工程、味の着地点、提供スタイルのどこが違うかを明示する。
- 本場らしさを機械的に優先せず、店舗オペレーション、再現性、原価、ユーザーの目的に照らして採否を判断する。
- 料理の出自が曖昧な場合も、海外一般ソースと日本語ソースを比較し、断定できない点は「要確認」と明記する。
\`;

const RECIPE_DEVELOPMENT_AGENT_PROTOCOL = \`
【5エージェント別の詳細プロトコル】
1. Web調査エージェント:
   - Web検索で、料理技術系・専門メディア・食品科学系ソースを優先する。
   - 料理サイトの多数決ではなく、技法・比率・失敗要因の検証に焦点を置く。
2. レシピ統合エージェント:
   - 材料全体を、主素材、香味、脂、酸、糖、塩、水分、構造材に分解する。
   - 分量は厨房で再現できる単位に落とし、過剰な材料数を避ける。
3. 食品科学エージェント:
   - 科学説明は、必ず味・食感・香り・歩留まり・作業精度のどれかに接続する。
   - タンパク質変性、乳化、ゲル化、糖、酵素、マイヤール反応などは、実際の工程に関係するものだけ扱う。
4. 科学検証エージェント:
   - 他エージェントの主張を一度疑い、分量・温度・時間・安全性・材料接地を確認する。
   - 問題がある場合は修正値または再確認方法を示す。問題がない場合も留保条件を書く。
5. 統括シェフエージェント:
   - 全所見を料理として統合し、最終レシピに落とす。
   - 「美味しそう」ではなく、仕上がりを安定させる最重要工程を明確にする。
\`;

const AGENT_OUTPUT_SCHEMA = \`
{
  "content": "そのエージェントの結論。180〜320文字",
  "findings": ["根拠付き所見1", "根拠付き所見2", "根拠付き所見3"],
  "risks": ["リスクまたは留保。なければ空配列"],
  "recommendations": ["改善提案1", "改善提案2"]
}
\`;

const PROPOSAL_OUTPUT_SCHEMA = \`
{
  "title": "レシピ名",
  "description": "商品としての狙いと改善意図",
  "course": "コース候補。不要なら空文字",
  "category": "カテゴリー候補。不要なら空文字",
  "country": "料理ジャンル/国。不要なら空文字",
  "servings": "分量。例: 4",
  "improvementSummary": "改善提案の要約",
  "keyChanges": ["変更点1", "変更点2", "変更点3"],
  "warnings": ["注意点。なければ空配列"],
  "ingredients": [
    { "name": "材料名", "quantity": "数値または範囲", "unit": "g または ml のみ", "note": "役割や注意点" }
  ],
  "steps": [
    { "text": "手順本文", "note": "狙い。不要なら空文字" }
  ]
}
\`;

const CONVERSATION_OUTPUT_SCHEMA = \`
{
  "answer": "ユーザーの質問への回答。元レシピ、現在の改善案、過去の会話を踏まえて具体的に答える",
  "shouldUpdateProposal": true,
  "proposal": {
    "title": "更新後のレシピ名。更新しない場合も現在案を返す",
    "description": "更新後の説明",
    "course": "コース候補。不要なら空文字",
    "category": "カテゴリー候補。不要なら空文字",
    "country": "料理ジャンル/国。不要なら空文字",
    "servings": "分量。例: 4",
    "improvementSummary": "今回の会話を踏まえた改善提案の要約",
    "keyChanges": ["更新点1", "更新点2"],
    "warnings": ["注意点。なければ空配列"],
    "ingredients": [
      { "name": "材料名", "quantity": "数値または範囲", "unit": "g または ml のみ", "note": "役割や注意点" }
    ],
    "steps": [
      { "text": "手順本文", "note": "狙い。不要なら空文字" }
    ]
  },
  "agentMessages": [
    {
      "agentId": "conversation",
      "agentName": "会話調整エージェント",
      "avatar": "💬",
      "content": "今回の質問をどう解釈し、改善案へどう反映したか",
      "timestamp": "12:01:00"
    }
  ]
}
\`;

const INTAKE_OUTPUT_SCHEMA = \`
{
  "summary": "なぜこの確認が必要かの要約。80〜180文字",
  "questions": [
    {
      "id": "additive_policy",
      "label": "質問の短い見出し",
      "question": "ユーザーに確認したい具体的な質問文",
      "rationale": "その質問が必要な理由",
      "placeholder": "回答例や補足記入例",
      "options": ["選択肢1", "選択肢2", "選択肢3"],
      "required": true
    }
  ]
}
\`;

const AGENT_DEFINITIONS = {
    research: {
        agentId: 'research',
        agentName: 'Web調査エージェント',
        avatar: '🔍',
        sourcePrefix: 'R',
        usesWeb: true,
    },
    synthesizer: {
        agentId: 'synthesizer',
        agentName: 'レシピ統合エージェント',
        avatar: '📊',
        sourcePrefix: 'I',
        usesWeb: false,
    },
    science: {
        agentId: 'science',
        agentName: '食品科学エージェント',
        avatar: '🧪',
        sourcePrefix: 'S',
        usesWeb: false,
    },
    validator: {
        agentId: 'validator',
        agentName: '科学検証エージェント',
        avatar: '🛡️',
        sourcePrefix: 'V',
        usesWeb: true,
    },
    heritage: {
        agentId: 'heritage',
        agentName: '料理文化調査エージェント',
        avatar: '🏛️',
        sourcePrefix: 'H',
        usesWeb: true,
    },
    globalComparison: {
        agentId: 'globalComparison',
        agentName: '海外・本場比較エージェント',
        avatar: '🌍',
        sourcePrefix: 'G',
        usesWeb: true,
    },
    auditor: {
        agentId: 'auditor',
        agentName: '最終クロスチェックエージェント',
        avatar: '🧾',
        sourcePrefix: 'X',
        usesWeb: true,
    },
    rebuttal: {
        agentId: 'rebuttal',
        agentName: '反証エージェント',
        avatar: '⚔️',
        sourcePrefix: 'C',
        usesWeb: false,
    },
    master: {
        agentId: 'master',
        agentName: '統括シェフエージェント',
        avatar: '🍳',
        sourcePrefix: 'M',
        usesWeb: true,
    },
};

const getProviderDisplayName = (provider) => PROVIDER_DISPLAY_NAMES[normalizeProvider(provider)] || SAKANA_PROVIDER_NAME;

// 旧設定の 'sakana' はサブスク扱いに移行する。未設定・不明な値はGroqをデフォルトにする
const normalizeProvider = (value) => {
    if (value === 'sakana' || value === 'sakana-subscription') return 'sakana-subscription';
    if (value === 'sakana-payg') return 'sakana-payg';
    if (value === 'openai') return 'openai';
    if (value === 'perplexity') return 'perplexity';
    return 'groq';
};

const isSakanaProvider = (provider) => ['sakana-subscription', 'sakana-payg'].includes(normalizeProvider(provider));

const PERPLEXITY_ROUTE_KEYWORDS = [
    '本場', '現地', '郷土', '伝統', 'クラシック', '由来', '発祥', '歴史',
    '海外', '外国', '地域差', '国別', '比較', ' authentic', ' authenticity',
    'traditional', 'classic', 'regional', 'origin', 'heritage', 'global',
    '最新', 'トレンド', '流行', 'いま', '202', '2026', '輸入', '現地語',
    '発酵', '熟成', '生食', '保存', '衛生', '低温調理', '真空', 'スパイス',
];

const getBalancedBaseProvider = (provider) => {
    const normalized = normalizeProvider(provider);
    if (normalized === 'groq' || normalized === 'openai' || normalized === 'perplexity' || isSakanaProvider(normalized)) {
        return normalized;
    }
    return 'groq';
};

const buildRoutingSignalText = (routeContext = {}) => normalizeText([
    routeContext.mode,
    routeContext.brief,
    routeContext.recipeText,
    routeContext.notes,
    routeContext.question,
    routeContext.directionContext,
    routeContext.currentProposalText,
].filter(Boolean).join('\\n'));

const shouldUsePerplexityRoute = ({ agentId, routeContext = {} }) => {
    if (!['research', 'globalComparison', 'heritage'].includes(agentId)) return false;
    const text = buildRoutingSignalText(routeContext).toLowerCase();
    if (!text) return false;
    if (agentId === 'globalComparison' || agentId === 'heritage') return true;
    return PERPLEXITY_ROUTE_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
};

const pickAgentPlan = ({ agentId, mainProvider, routeContext = {} }) => {
    if (mainProvider === 'groq-express') {
        return { provider: 'groq', model: GROQ_DEFAULT_TEXT_MODEL, label: \`Groq (\${GROQ_DEFAULT_TEXT_MODEL})\` };
    }
    if (agentId === 'rebuttal') {
        return { provider: 'openai', model: OPENAI_REBUTTAL_MODEL, label: \`OpenAI \${OPENAI_REBUTTAL_MODEL}\` };
    }
    if (agentId === 'auditor') {
        return { provider: 'openai', model: OPENAI_AUDITOR_MODEL, label: \`OpenAI \${OPENAI_AUDITOR_MODEL}\` };
    }
    if (agentId === 'master') {
        return { provider: 'openai', model: OPENAI_MASTER_MODEL, label: \`OpenAI \${OPENAI_MASTER_MODEL}\` };
    }
    if (shouldUsePerplexityRoute({ agentId, routeContext })) {
        return { provider: 'perplexity', model: PERPLEXITY_DEFAULT_MODEL, label: \`Perplexity \${PERPLEXITY_DEFAULT_MODEL}\` };
    }

    const baseProvider = getBalancedBaseProvider(mainProvider);
    if (baseProvider === 'openai') {
        return { provider: 'openai', model: OPENAI_MASTER_MODEL, label: \`OpenAI \${OPENAI_MASTER_MODEL}\` };
    }
    if (baseProvider === 'perplexity' && ['research', 'globalComparison', 'heritage'].includes(agentId)) {
        return { provider: 'perplexity', model: PERPLEXITY_DEFAULT_MODEL, label: \`Perplexity \${PERPLEXITY_DEFAULT_MODEL}\` };
    }
    if (isSakanaProvider(baseProvider)) {
        return { provider: baseProvider, model: undefined, label: getProviderDisplayName(baseProvider) };
    }
    return { provider: 'groq', model: undefined, label: GROQ_PROVIDER_NAME };
};

const normalizeText = (value) => String(value ?? '')
    .replace(/\\\\r\\\\n|\\\\n|\\\\r/g, '\\n')
    .replace(/\\\\t/g, ' ')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '$1')
    .replace(/\\s+/g, ' ')
    .trim();

const normalizeArray = (value) => Array.isArray(value) ? value : [];
const normalizeStringArray = (value) => normalizeArray(value).map(normalizeText).filter(Boolean);
const METRIC_ONLY_UNIT_VALUES = new Set(['g', 'ml']);
// 個・本・枚・カップ・キロ・リットルは「本体」「基本」「個別」「一枚一枚」などの誤検知を避けるため、
// 直前にアラビア数字（または半・数）がある場合のみ単位として扱う。
// 英字単位は \\b だと「2kg」のような数字密着を拾えないため、英字非隣接を境界条件にする。
// 単独の l は「L字」「Lサイズ」と区別できないため、直前に数字がある場合のみ単位として扱う
// 後読み (?<!...) は iPadOS15 の Safari が非対応で画面が起動しなくなるため使用禁止（.test 用途なので消費型で代替）
const FORBIDDEN_RECIPE_UNIT_PATTERN = /(?:^|[^a-z])(?:kg|kilograms?|liters?|cups?|tbsp|tsp|teaspoons?|tablespoons?|cc)(?![a-z])|[0-9０-９]\\s*l(?![a-z])|大さじ|小さじ|(?:[0-9０-９]+(?:[.．][0-9０-９]+)?|[半数])\\s*(?:個|本|枚|カップ|キロ|リットル)|少々|適量/i;

const readLocalStorage = (key) => {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
};

const writeLocalStorage = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignore storage failures
    }
};

export const isSakanaUnlocked = () => readLocalStorage(SAKANA_UNLOCK_KEY) === 'true';

export const unlockSakana = (password) => {
    if (String(password ?? '').trim() === SAKANA_LOCK_PASSWORD) {
        writeLocalStorage(SAKANA_UNLOCK_KEY, 'true');
        return true;
    }
    return false;
};

export const getStoredRecipeAiSettings = () => {
    const provider = normalizeProvider(
        readLocalStorage(AI_SETTINGS_PROVIDER_KEY) ||
        readLocalStorage(LEGACY_PROVIDER_KEY) ||
        'groq'
    );
    // ロック未解除の端末では、保存済みでもSakanaを使わせずGroqに落とす
    if (isSakanaProvider(provider) && !isSakanaUnlocked()) {
        return { provider: 'groq' };
    }
    return { provider };
};

export const saveStoredRecipeAiSettings = ({ provider }) => {
    const normalizedProvider = normalizeProvider(provider);
    writeLocalStorage(AI_SETTINGS_PROVIDER_KEY, normalizedProvider);
    writeLocalStorage(LEGACY_PROVIDER_KEY, normalizedProvider);
};

const getAccessToken = async () => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token || '';
        if (token) return token;
        const { data: refreshed } = await supabase.auth.refreshSession();
        return refreshed?.session?.access_token || '';
    } catch {
        return '';
    }
};

// APIキーはSupabase Edge Function（recipe-ai-proxy）側のSecretsに保管し、
// クライアントは認証済みユーザーとしてプロキシ経由でプロバイダーAPIを呼ぶ。
const callAiProxy = async ({ provider, endpoint, body, signal }) => {
    let token = await getAccessToken();

    const doFetch = (accessToken) => fetch(\`\${SUPABASE_URL}/functions/v1/recipe-ai-proxy\`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            ...(accessToken ? { Authorization: \`Bearer \${accessToken}\` } : {}),
        },
        body: JSON.stringify({ provider, endpoint, body }),
        signal,
    });

    let response = await doFetch(token);
    if (response.status === 401) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed?.session?.access_token || '';
        if (token) {
            response = await doFetch(token);
        }
    }
    return response;
};

const withTimeout = async (promise, ms, label) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
        return await promise(controller.signal);
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(\`\${label} がタイムアウトしました。\`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

const cleanJsonText = (rawText) => {
    let text = String(rawText || '')
        .replace(/^\`\`\`(?:json)?\\s*/i, '')
        .replace(/\`\`\`\\s*$/i, '')
        .trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
    }
    return text.trim();
};

const parseJsonResponse = (rawText, provider) => {
    const cleaned = cleanJsonText(rawText);
    try {
        return JSON.parse(cleaned);
    } catch (error) {
        const preview = cleaned.slice(0, 220).replace(/\\s+/g, ' ');
        const suffix = cleaned.slice(-220).replace(/\\s+/g, ' ');
        throw new Error(\`\${getProviderDisplayName(provider)} のJSON解析に失敗しました: \${error?.message || error} / head="\${preview}" / tail="\${suffix}"\`);
    }
};

const extractChatText = (payload) => {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content.map((item) => String(item?.text || '').trim()).filter(Boolean).join('\\n').trim();
    }
    return '';
};

const extractResponseText = (payload) => {
    if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
        return payload.output_text.trim();
    }

    const textParts = [];
    for (const outputItem of normalizeArray(payload?.output)) {
        for (const contentItem of normalizeArray(outputItem?.content)) {
            const text = String(contentItem?.text || '').trim();
            if (text) textParts.push(text);
        }
    }
    return textParts.join('\\n').trim();
};

const extractHostname = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\\./, '');
    } catch {
        return url;
    }
};

const shouldExcludeSourceUrl = (url) => {
    const hostname = extractHostname(url).toLowerCase();
    return ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'facebook.com', 'x.com', 'twitter.com', 'pinterest.com']
        .some(pattern => hostname === pattern || hostname.endsWith(\`.\${pattern}\`));
};

const normalizeSources = (value, prefix = 'A') => {
    if (!Array.isArray(value)) return [];
    const unique = new Map();
    value.forEach((source) => {
        const url = normalizeText(source?.url);
        if (!url || unique.has(url) || shouldExcludeSourceUrl(url)) return;
        unique.set(url, {
            id: normalizeText(source?.id),
            title: normalizeText(source?.title) || extractHostname(url),
            url,
            note: normalizeText(source?.note),
        });
    });
    return Array.from(unique.values()).slice(0, 12).map((source, index) => ({
        ...source,
        id: source.id || \`\${prefix}\${index + 1}\`,
    }));
};

const mergeSources = (...sourceGroups) => {
    const unique = new Map();
    sourceGroups.flat().forEach((source) => {
        const url = normalizeText(source?.url);
        if (!url || unique.has(url) || shouldExcludeSourceUrl(url)) return;
        unique.set(url, {
            id: '',
            title: normalizeText(source?.title) || extractHostname(url),
            url,
            note: normalizeText(source?.note),
        });
    });
    return Array.from(unique.values()).slice(0, 18).map((source, index) => ({
        ...source,
        id: \`A\${index + 1}\`,
    }));
};

const extractSakanaSources = (payload, note, prefix) => {
    const sources = [];
    for (const outputItem of normalizeArray(payload?.output)) {
        normalizeArray(outputItem?.action?.sources).forEach((source) => {
            const url = normalizeText(source?.url);
            if (!url) return;
            sources.push({
                title: normalizeText(source?.title) || extractHostname(url),
                url,
                note,
            });
        });

        normalizeArray(outputItem?.content).forEach((contentItem) => {
            normalizeArray(contentItem?.annotations).forEach((annotation) => {
                if (annotation?.type !== 'url_citation') return;
                const url = normalizeText(annotation?.url);
                if (!url) return;
                sources.push({
                    title: normalizeText(annotation?.title) || extractHostname(url),
                    url,
                    note,
                });
            });
        });
    }
    return normalizeSources(sources, prefix).slice(0, 8);
};

const extractGroqSources = (payload, note, prefix) => {
    const sources = [];
    const executedTools = normalizeArray(payload?.choices?.[0]?.message?.executed_tools);
    executedTools.forEach((tool) => {
        const rawOutput = tool?.output ?? tool?.search_results ?? tool?.result;
        const outputText = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput ?? '');
        const matches = outputText.match(/https?:\\/\\/[^\\s"')\\]]+/g) ?? [];
        matches.forEach((rawUrl) => {
            const url = rawUrl.replace(/[.,)]+$/, '').trim();
            if (!url) return;
            sources.push({ title: extractHostname(url), url, note });
        });
    });
    return normalizeSources(sources, prefix).slice(0, 8);
};

const extractOpenAiSources = (payload, note, prefix) => {
    const sources = [];
    for (const outputItem of normalizeArray(payload?.output)) {
        normalizeArray(outputItem?.content).forEach((contentItem) => {
            normalizeArray(contentItem?.annotations).forEach((annotation) => {
                const url = normalizeText(annotation?.url);
                if (!url) return;
                sources.push({
                    title: normalizeText(annotation?.title) || extractHostname(url),
                    url,
                    note,
                });
            });
        });
    }
    const rawText = JSON.stringify(payload ?? '');
    const matches = rawText.match(/https?:\\/\\/[^\\s"')\\]]+/g) ?? [];
    matches.forEach((rawUrl) => {
        const url = rawUrl.replace(/[.,)]+$/, '').trim();
        if (!url) return;
        sources.push({ title: extractHostname(url), url, note });
    });
    return normalizeSources(sources, prefix).slice(0, 8);
};

const extractPerplexitySources = (payload, note, prefix) => {
    const sources = [];
    normalizeArray(payload?.citations).forEach((url) => {
        const normalizedUrl = normalizeText(url);
        if (!normalizedUrl) return;
        sources.push({
            title: extractHostname(normalizedUrl),
            url: normalizedUrl,
            note,
        });
    });
    normalizeArray(payload?.search_results).forEach((item) => {
        const url = normalizeText(item?.url);
        if (!url) return;
        sources.push({
            title: normalizeText(item?.title) || extractHostname(url),
            url,
            note,
        });
    });
    const content = extractChatText(payload);
    const matches = content.match(/https?:\\/\\/[^\\s"')\\]]+/g) ?? [];
    matches.forEach((rawUrl) => {
        const url = rawUrl.replace(/[.,)]+$/, '').trim();
        if (!url) return;
        sources.push({ title: extractHostname(url), url, note });
    });
    return normalizeSources(sources, prefix).slice(0, 8);
};

const extractSourcesFromProviderResponse = (payload, note, prefix, provider) => {
    const normalized = normalizeProvider(provider);
    if (normalized === 'groq') return extractGroqSources(payload, note, prefix);
    if (normalized === 'openai') return extractOpenAiSources(payload, note, prefix);
    if (normalized === 'perplexity') return extractPerplexitySources(payload, note, prefix);
    return extractSakanaSources(payload, note, prefix);
};

const callSakanaChatJson = async ({ provider, prompt, instructions, maxOutputTokens = 5000, timeoutMs = REQUEST_TIMEOUT_MS }) => {
    const providerName = getProviderDisplayName(provider);
    const payload = await withTimeout(async (signal) => {
        const response = await callAiProxy({
            provider: normalizeProvider(provider),
            endpoint: 'chat',
            body: {
                model: DEFAULT_MODEL,
                messages: [
                    { role: 'system', content: instructions || 'You are a senior recipe R&D chef. Return strict JSON only.' },
                    { role: 'user', content: prompt },
                ],
                response_format: { type: 'json_object' },
                max_completion_tokens: maxOutputTokens,
            },
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(\`\${providerName} API error \${response.status}: \${body || response.statusText}\`);
        }
        return response.json();
    }, timeoutMs, providerName);

    const rawText = extractChatText(payload);
    if (!rawText) throw new Error(\`\${providerName} から空の応答が返されました。\`);
    return { parsed: parseJsonResponse(rawText, provider), payload, rawText };
};

const callSakanaResponseJson = async ({
    provider,
    prompt,
    instructions,
    maxOutputTokens = 6000,
    timeoutMs = REQUEST_TIMEOUT_MS,
    tools,
    toolChoice,
    reasoningEffort = 'high',
}) => {
    const providerName = getProviderDisplayName(provider);
    const payload = await withTimeout(async (signal) => {
        const response = await callAiProxy({
            provider: normalizeProvider(provider),
            endpoint: 'responses',
            body: {
                model: DEFAULT_MODEL,
                instructions: instructions || 'You are a senior culinary agent. Return strict JSON only.',
                input: prompt,
                reasoning: { effort: reasoningEffort },
                text: { format: { type: 'json_object' } },
                max_output_tokens: maxOutputTokens,
                ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
                ...(toolChoice ? { tool_choice: toolChoice } : {}),
            },
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(\`\${providerName} API error \${response.status}: \${body || response.statusText}\`);
        }
        return response.json();
    }, timeoutMs, providerName);

    const rawText = extractResponseText(payload);
    if (!rawText) throw new Error(\`\${providerName} から空の応答が返されました。\`);
    return { parsed: parseJsonResponse(rawText, provider), payload, rawText };
};

const callOpenAiResponseJson = async ({
    prompt,
    instructions,
    maxOutputTokens = 6000,
    timeoutMs = REQUEST_TIMEOUT_MS,
    tools,
    toolChoice,
    reasoningEffort = 'medium',
    model,
}) => {
    const selectedModel = model || OPENAI_REBUTTAL_MODEL;
    const supportsReasoning = /^(o\\d|gpt-5)/.test(selectedModel);

    // OpenAI Responses API does not support Web Search when JSON mode is active.
    // We filter out 'web_search' tools to prevent "Web Search cannot be used with JSON mode" error.
    let filteredTools = tools;
    let filteredToolChoice = toolChoice;
    if (Array.isArray(tools)) {
        filteredTools = tools.filter(t => t.type !== 'web_search');
        if (filteredTools.length === 0) {
            filteredTools = undefined;
            filteredToolChoice = undefined;
        }
    }

    const payload = await withTimeout(async (signal) => {
        const response = await callAiProxy({
            provider: 'openai',
            endpoint: 'responses',
            body: {
                model: selectedModel,
                instructions: instructions || 'You are a senior culinary agent. Return strict JSON only.',
                input: prompt,
                ...(supportsReasoning ? { reasoning: { effort: reasoningEffort } } : {}),
                text: { format: { type: 'json_object' } },
                max_output_tokens: maxOutputTokens,
                ...(Array.isArray(filteredTools) && filteredTools.length > 0 ? { tools: filteredTools } : {}),
                ...(filteredToolChoice ? { tool_choice: filteredToolChoice } : {}),
            },
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(\`\${OPENAI_PROVIDER_NAME} API error \${response.status}: \${body || response.statusText}\`);
        }
        return response.json();
    }, timeoutMs, OPENAI_PROVIDER_NAME);

    const rawText = extractResponseText(payload);
    if (!rawText) throw new Error(\`\${OPENAI_PROVIDER_NAME} から空の応答が返されました。\`);
    return { parsed: parseJsonResponse(rawText, 'openai'), payload, rawText };
};

const callPerplexityChatJson = async ({
    prompt,
    instructions,
    maxOutputTokens = 5000,
    timeoutMs = REQUEST_TIMEOUT_MS,
    model,
}) => {
    const payload = await withTimeout(async (signal) => {
        const response = await callAiProxy({
            provider: 'perplexity',
            endpoint: 'chat',
            body: {
                model: model || PERPLEXITY_DEFAULT_MODEL,
                messages: [
                    { role: 'system', content: instructions || 'You are a senior culinary research agent. Return strict JSON only.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.2,
                max_tokens: maxOutputTokens,
            },
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(\`\${PERPLEXITY_PROVIDER_NAME} API error \${response.status}: \${body || response.statusText}\`);
        }
        return response.json();
    }, timeoutMs, PERPLEXITY_PROVIDER_NAME);

    const rawText = extractChatText(payload);
    if (!rawText) throw new Error(\`\${PERPLEXITY_PROVIDER_NAME} から空の応答が返されました。\`);
    return { parsed: parseJsonResponse(rawText, 'perplexity'), payload, rawText };
};

const postGroqChatCompletion = async (body, signal) => {
    const response = await callAiProxy({
        provider: 'groq',
        endpoint: 'chat',
        body,
        signal,
    });

    if (response.ok) return response.json();

    let detail = \`status: \${response.status}\`;
    try {
        const errBody = await response.json();
        // プロキシ（recipe-ai-proxy）のエラーは error が文字列、Groq本体のエラーは error.message
        const message = (typeof errBody?.error === 'string' ? errBody.error : errBody?.error?.message) ?? errBody?.message;
        const failedGeneration = errBody?.error?.failed_generation ?? errBody?.failed_generation;
        if (message) detail += \` — \${message}\`;
        if (failedGeneration) detail += \` — failed_generation: \${String(failedGeneration).slice(0, 500)}\`;
    } catch {
        const body = await response.text().catch(() => '');
        if (body) detail += \` — \${body.slice(0, 500)}\`;
    }

    throw new Error(\`\${GROQ_PROVIDER_NAME} API error! \${detail}\`);
};

const callGroqChatJson = async ({
    prompt,
    instructions,
    maxOutputTokens = 5000,
    timeoutMs = REQUEST_TIMEOUT_MS,
    tools,
    model,
}) => {
    const wantsWebSearch = Array.isArray(tools) && tools.some(tool => tool?.type === 'web_search');
    const messages = [];
    if (instructions) messages.push({ role: 'system', content: instructions });
    if (wantsWebSearch) {
        messages.push({
            role: 'system',
            content: 'あなたはWeb検索ツールを内蔵したエージェントです。回答の前に必ず実際にWeb検索を実行し、検索で確認できた情報のみを根拠として使ってください。',
        });
    }
    messages.push({ role: 'user', content: prompt });

    const payload = await withTimeout(async (signal) => postGroqChatCompletion({
        model: model || (wantsWebSearch ? GROQ_COMPOUND_MODEL : GROQ_DEFAULT_TEXT_MODEL),
        messages,
        max_completion_tokens: maxOutputTokens,
        temperature: wantsWebSearch ? 0.3 : 0.2,
        top_p: 0.95,
        service_tier: 'auto',
    }, signal), timeoutMs, GROQ_PROVIDER_NAME);

    const rawText = extractChatText(payload);
    if (!rawText) throw new Error(\`\${GROQ_PROVIDER_NAME} から空の応答が返されました。\`);
    return { parsed: parseJsonResponse(rawText, 'groq'), payload, rawText };
};

const callRecipeAiJson = async ({
    provider,
    prompt,
    instructions,
    maxOutputTokens,
    timeoutMs,
    tools,
    toolChoice,
    reasoningEffort,
    model,
}) => {
    const normalizedProvider = normalizeProvider(provider);

    if (normalizedProvider === 'openai') {
        return callOpenAiResponseJson({ prompt, instructions, maxOutputTokens, timeoutMs, tools, toolChoice, reasoningEffort, model });
    }

    if (normalizedProvider === 'perplexity') {
        return callPerplexityChatJson({ prompt, instructions, maxOutputTokens, timeoutMs, model });
    }

    if (!isSakanaProvider(normalizedProvider)) {
        return callGroqChatJson({ prompt, instructions, maxOutputTokens, timeoutMs, tools, model });
    }

    if (Array.isArray(tools) && tools.length > 0) {
        return callSakanaResponseJson({
            provider: normalizedProvider,
            prompt,
            instructions,
            maxOutputTokens,
            timeoutMs,
            tools,
            toolChoice,
            reasoningEffort,
        });
    }

    return callSakanaChatJson({ provider: normalizedProvider, prompt, instructions, maxOutputTokens, timeoutMs });
};

const stepText = (step, index) => {
    if (typeof step === 'string') return step.trim();
    if (!step || typeof step !== 'object') return '';
    return normalizeText(step.text || step.step || step.instruction || step.name || \`手順 \${index + 1}\`);
};

const ingredientLine = (ingredient) => {
    if (typeof ingredient === 'string') return ingredient.trim();
    if (!ingredient || typeof ingredient !== 'object') return '';
    const amount = [ingredient.quantity, ingredient.unit].map(normalizeText).filter(Boolean).join('');
    const cost = normalizeText(ingredient.cost);
    const purchaseCost = normalizeText(ingredient.purchaseCost ?? ingredient.purchase_cost);
    return [
        normalizeText(ingredient.name),
        amount ? \`分量: \${amount}\` : '',
        cost ? \`原価: \${cost}\` : '',
        purchaseCost ? \`仕入単価: \${purchaseCost}\` : '',
        normalizeText(ingredient.note) ? \`メモ: \${normalizeText(ingredient.note)}\` : '',
    ].filter(Boolean).join(' / ');
};

export const serializeRecipeForAi = (recipe) => {
    const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
    return [
        \`タイトル: \${normalizeText(recipe?.title) || '未設定'}\`,
        \`説明: \${normalizeText(recipe?.description) || '未設定'}\`,
        \`コース: \${normalizeText(recipe?.course) || '未設定'}\`,
        \`カテゴリー: \${normalizeText(recipe?.category) || '未設定'}\`,
        \`国: \${normalizeText(recipe?.country) || '未設定'}\`,
        \`分量: \${normalizeText(recipe?.servings) || '未設定'}\`,
        '',
        '材料:',
        ...(ingredients.length ? ingredients.map((item, index) => \`\${index + 1}. \${ingredientLine(item)}\`) : ['- 未設定']),
        '',
        '手順:',
        ...(steps.length ? steps.map((item, index) => \`\${index + 1}. \${stepText(item, index)}\`) : ['- 未設定']),
    ].join('\\n');
};

const normalizeAgentMessages = (value) => {
    if (!Array.isArray(value)) return [];
    return value.map((item, index) => ({
        agentId: normalizeText(item?.agentId) || \`agent-\${index + 1}\`,
        agentName: normalizeText(item?.agentName) || 'AIエージェント',
        avatar: normalizeText(item?.avatar) || '🤖',
        content: normalizeText(item?.content),
        timestamp: normalizeText(item?.timestamp) || \`12:00:\${String((index + 1) * 10).padStart(2, '0')}\`,
    })).filter(item => item.content);
};

const normalizeConversationMessages = (value) => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: normalizeText(item?.content),
    })).filter(item => item.content);
};

const buildFallbackIntake = (mode) => {
    if (mode === 'improvement') {
        return {
            summary: '改善案を作る前に、何を守り、どこまで変えてよいかを確定すると、手戻りを減らせます。',
            questions: [
                {
                    id: 'must_keep',
                    label: '変えてはいけない核',
                    question: 'このレシピで絶対に残したい点は何ですか。味の方向性、主素材、見た目、提供スタイルなどを具体的に教えてください。',
                    rationale: '改善で料理の核を壊さないためです。',
                    placeholder: '例: 鶏を主役にすること、冷製前菜として出すこと、現行の見た目は維持したい',
                    options: [],
                    required: true,
                },
                {
                    id: 'additive_policy',
                    label: '添加物・機能材の許容範囲',
                    question: '食品添加物や機能材はどこまで許容しますか。増粘剤、安定剤、ブドウ糖、ビタミンC、発色補助、乳化補助などが候補になる場合があります。',
                    rationale: '安定性と完成度をどこまで優先するかで改善方針が大きく変わるためです。',
                    placeholder: '例: 一切使わない / 安定性のため最小限なら可 / 完成度優先で必要なら可',
                    options: ['一切使わない', '安定性のため最小限なら可', '完成度優先で必要なら可'],
                    required: true,
                },
                {
                    id: 'main_goal',
                    label: '今回の改善優先順位',
                    question: '今回の改善で最優先なのは何ですか。味、香り、食感、安定性、原価、仕込み時間、提供速度などから優先順位を教えてください。',
                    rationale: '改善案の判断軸を固定するためです。',
                    placeholder: '例: 1. 安定性 2. 原価維持 3. 食感向上',
                    options: ['味・香り優先', '食感・安定性優先', '原価優先', '仕込み・提供効率優先'],
                    required: true,
                },
                {
                    id: 'cost_tolerance',
                    label: '原価許容',
                    question: '原価はどこまで動かせますか。現状維持なのか、少し上がっても良いのか、下げたいのかを教えてください。',
                    rationale: '採用できる素材や工程が変わるためです。',
                    placeholder: '例: 現状維持 / 5%まで増は可 / 10%下げたい',
                    options: ['現状維持', '少し上がっても可', '下げたい'],
                    required: true,
                },
                {
                    id: 'operation_constraints',
                    label: 'オペレーション制約',
                    question: '仕込み日数、提供直前の作業量、使用機材、保存日数などで制約があれば教えてください。',
                    rationale: '実装できない改善案を避けるためです。',
                    placeholder: '例: 前日仕込み可、当日提供は3分以内、真空機なし、冷蔵3日持たせたい',
                    options: [],
                    required: false,
                },
            ],
        };
    }

    return {
        summary: '商品開発前に、完成度と制約の優先順位を確定すると、再質問を減らしやすくなります。',
        questions: [
            {
                id: 'additive_policy',
                label: '添加物・機能材の許容範囲',
                question: '食品添加物や機能材はどこまで許容しますか。料理によってはグァーガム、ブドウ糖、安定剤、乳化補助、ビタミンCなどが候補になります。',
                rationale: '安定性と完成度の上げ方が大きく変わるためです。',
                placeholder: '例: 一切使わない / 安定性のため最小限なら可 / 完成度優先で必要なら可',
                options: ['一切使わない', '安定性のため最小限なら可', '完成度優先で必要なら可'],
                required: true,
            },
            {
                id: 'target_goal',
                label: '狙う完成度と客層',
                question: '誰に、どの時間帯・価格帯で出す料理ですか。高級感、親しみやすさ、軽さ、満足感など狙いも教えてください。',
                rationale: '設計すべき味と構成が変わるためです。',
                placeholder: '例: ランチ1500円前後、女性客多め、軽いが満足感は欲しい',
                options: [],
                required: true,
            },
            {
                id: 'cost_priority',
                label: '原価と品質の優先順位',
                question: '原価はどのくらい重視しますか。品質最優先か、一定原価内か、低原価化を狙うかを教えてください。',
                rationale: '素材選定と工程設計の基準になるためです。',
                placeholder: '例: 原価優先 / 原価は中程度で品質重視 / 高品質最優先',
                options: ['原価優先', 'バランス重視', '品質最優先'],
                required: true,
            },
            {
                id: 'operation_constraints',
                label: '仕込み・提供制約',
                question: '仕込み日数、当日提供時間、使用機材、保存日数などの制約はありますか。',
                rationale: '現場で回る商品にするためです。',
                placeholder: '例: 前日仕込み可、提供5分以内、アイスクリームマシンなし、冷蔵2日',
                options: [],
                required: true,
            },
            {
                id: 'authenticity_policy',
                label: '本場性と現場適応のバランス',
                question: '本場寄りにしたいですか。それとも日本の店舗オペレーションや客層に合わせて調整してよいですか。',
                rationale: '材料と味の着地点が変わるためです。',
                placeholder: '例: 本場寄り / バランス型 / 現場適応優先',
                options: ['本場寄り', 'バランス型', '現場適応優先'],
                required: true,
            },
            {
                id: 'ingredient_restrictions',
                label: '使わない素材・条件',
                question: 'アレルゲン、動物性の可否、アルコール、香料、保存料など、使わない条件があれば教えてください。',
                rationale: '後から大きな作り直しを防ぐためです。',
                placeholder: '例: 豚不可、アルコール不可、香料不可、卵は使える',
                options: [],
                required: false,
            },
        ],
    };
};

const normalizeIntakeQuestion = (question, index) => ({
    id: normalizeText(question?.id) || \`question_\${index + 1}\`,
    label: normalizeText(question?.label) || \`確認項目 \${index + 1}\`,
    question: normalizeText(question?.question),
    rationale: normalizeText(question?.rationale),
    placeholder: normalizeText(question?.placeholder),
    options: normalizeStringArray(question?.options).slice(0, 6),
    required: question?.required !== false,
    answer: normalizeText(question?.answer),
});

const normalizeRecipeAiIntake = (payload, mode) => {
    const fallback = buildFallbackIntake(mode);
    const questions = normalizeArray(payload?.questions)
        .map(normalizeIntakeQuestion)
        .filter((item) => item.question)
        .slice(0, 8);

    return {
        summary: normalizeText(payload?.summary) || fallback.summary,
        questions: questions.length > 0 ? questions : fallback.questions,
    };
};

export const serializeRecipeAiDirectionContext = (intake) => {
    const questions = normalizeArray(intake?.questions)
        .map(normalizeIntakeQuestion)
        .filter((item) => item.answer);
    if (questions.length === 0) return '';

    return [
        '【事前確認で確定した方針】',
        ...questions.map((item) => \`- \${item.label}: \${item.answer}\`),
    ].join('\\n');
};

export const generateRecipeAiIntake = async ({
    mode = 'product',
    brief = '',
    recipe = null,
    notes = '',
    provider,
}) => {
    const normalizedMode = mode === 'improvement' ? 'improvement' : 'product';
    const fallback = buildFallbackIntake(normalizedMode);

    try {
        const baseContext = normalizedMode === 'product'
            ? ['【開発テーマ】', normalizeText(brief) || '未入力'].join('\\n')
            : ['【既存レシピ】', serializeRecipeForAi(recipe), '', '【改善指示】', normalizeText(notes) || '特になし'].join('\\n');

        const modeInstruction = normalizedMode === 'product'
            ? \`
あなたはレシピ開発前の要件定義を行うシェフです。
まだレシピは作らず、先に確認すべき質問だけを返してください。
質問は4〜7件。抽象語ではなく、厨房判断に直結する具体的な聞き方にしてください。
必ず「食品添加物・機能材の許容範囲」の質問を含め、料理から推定できる場合は具体例も入れてください。
例:
- アイス系: グァーガム、ローカストビーンガム、ブドウ糖、安定剤、乳化補助
- テリーヌ・シャルキュトリ系: ビタミンC、発色補助、ゲル化補助、増粘安定材
- ソース・デザート系: ペクチン、ゼラチン、寒天、乳化補助、保存安定化
\`
            : \`
あなたは既存レシピ改善前の要件定義を行うシェフです。
まだ改善案は作らず、先に確認すべき質問だけを返してください。
質問は4〜7件。現レシピの何を守り、何をどこまで変えてよいかを具体的に確認してください。
必ず「食品添加物・機能材の許容範囲」の質問を含め、料理から推定できる場合は具体例も入れてください。
\`;

        const { parsed } = await callRecipeAiJson({
            provider,
            prompt: \`
\${modeInstruction}

\${baseContext}

【質問設計ルール】
- 質問は、ユーザーが一度答えれば開発・改善の方向性がかなり固まるものに絞る。
- 「何か希望はありますか」のような広すぎる質問は禁止。
- 原価、オペレーション、保存安定性、本場性、禁止素材のような論点を優先する。
- 各質問には短い見出しを付ける。
- options は、ユーザーが選びやすい代表的な選択肢がある場合のみ入れる。

\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${INTAKE_OUTPUT_SCHEMA}
\`,
            instructions: 'You are a pre-briefing chef assistant. Ask concrete prerequisite questions before recipe generation. Return strict JSON only.',
            maxOutputTokens: 2600,
            timeoutMs: REQUEST_TIMEOUT_MS,
        });

        return normalizeRecipeAiIntake(parsed, normalizedMode);
    } catch (error) {
        console.warn('[recipeAiService] generateRecipeAiIntake failed', error);
        return fallback;
    }
};

const isRecipeReproposalRequest = (question) => {
    const text = normalizeText(question).toLowerCase();
    if (!text) return false;
    return [
        /再(?:度|提案|提示|作成|改善|開発)/,
        /作(?:っ|成し|り直)/,
        /提案して|提示して|出して|レシピ化/,
        /レシピ(?:案)?(?:を|として|に)?(?:更新|改善|作成|提案|提示|再構成)/,
        /(?:滑らか|なめらか|軽い|濃厚|低原価|高級|植物性|ヴィーガン|ビーガン|アレルゲン|時短|仕込み|バージョン)/,
        /(?:入れ|加え|追加|抜い|除い|減ら|増や|置き換|代替|変更)/,
    ].some((pattern) => pattern.test(text));
};

const normalizeAiProposal = (proposal) => {
    const ingredients = Array.isArray(proposal?.ingredients) ? proposal.ingredients : [];
    const steps = Array.isArray(proposal?.steps) ? proposal.steps : [];

    return {
        title: normalizeText(proposal?.title),
        description: normalizeText(proposal?.description),
        course: normalizeText(proposal?.course),
        category: normalizeText(proposal?.category),
        country: normalizeText(proposal?.country),
        servings: normalizeText(proposal?.servings),
        improvementSummary: normalizeText(proposal?.improvementSummary),
        keyChanges: Array.isArray(proposal?.keyChanges) ? proposal.keyChanges.map(normalizeText).filter(Boolean) : [],
        warnings: Array.isArray(proposal?.warnings) ? proposal.warnings.map(normalizeText).filter(Boolean) : [],
        ingredients: ingredients.map((item) => ({
            name: normalizeText(item?.name),
            quantity: normalizeText(item?.quantity ?? item?.amount),
            unit: normalizeText(item?.unit),
            note: normalizeText(item?.note),
            cost: '',
            purchaseCost: '',
        })).filter((item) => item.name),
        steps: steps.map((item) => ({
            text: normalizeText(typeof item === 'string' ? item : item?.text ?? item?.instruction),
            note: normalizeText(item?.note ?? item?.tip ?? item?.scienceTip),
        })).filter((item) => item.text),
        agentMessages: normalizeAgentMessages(proposal?.agentMessages || proposal?.messages),
        sources: normalizeSources(proposal?.sources),
        audit: proposal?.audit && typeof proposal.audit === 'object' ? proposal.audit : null,
        rebuttal: proposal?.rebuttal && typeof proposal.rebuttal === 'object' ? proposal.rebuttal : null,
        learningMeta: proposal?.learningMeta && typeof proposal.learningMeta === 'object'
            ? {
                runId: normalizeText(proposal.learningMeta?.runId),
                modeFamily: normalizeText(proposal.learningMeta?.modeFamily),
            }
            : null,
    };
};

// 「1本約260g」のようにg/ml換算が併記されていれば計量可能とみなす
const hasMetricAmountHint = (text) => /[0-9０-９]\\s*(?:g|ml)/i.test(String(text ?? ''));

const validateMetricUnitsInProposal = (proposal) => {
    const normalized = normalizeAiProposal(proposal);

    // 材料欄のunitは原価計算・在庫連携の基盤なのでg/ml以外は受け付けない（ここだけ厳格チェック）
    const invalidIngredient = normalized.ingredients.find((item) => !METRIC_ONLY_UNIT_VALUES.has(item.unit));
    if (invalidIngredient) {
        throw new Error(\`AI提案の単位が不正です: \${invalidIngredient.name} は \${invalidIngredient.unit || '未設定'} でした。材料の unit は g または ml のみで返してください。\`);
    }

    // 手順・注意文は自然な日本語として個数・本数などの表現を含み得るため、提案を破棄しない。
    // g/ml換算の併記がない曖昧な分量表現だけを注意点として利用者に知らせる
    const isAmbiguousAmountText = (text) => Boolean(text)
        && FORBIDDEN_RECIPE_UNIT_PATTERN.test(text)
        && !hasMetricAmountHint(text);
    const ambiguousTexts = [
        ...normalized.steps
            .filter((item) => isAmbiguousAmountText(item.text) || isAmbiguousAmountText(item.note))
            .map((item) => item.text),
        ...normalized.warnings.filter((item) => isAmbiguousAmountText(item)),
    ];
    if (ambiguousTexts.length > 0) {
        console.warn('[recipeAiService] 手順・注意文にg/ml換算のない分量表現が含まれています:', ambiguousTexts);
        normalized.warnings = [
            ...normalized.warnings,
            '一部の手順にg/ml換算のない分量表現が含まれています。正確な分量は材料欄のg/ml表記を基準にしてください。',
        ];
    }

    return normalized;
};

// 会話回答は文章なので単位表現の検閲はしない（材料データには影響しないため）
const validateMetricUnitsInConversationAnswer = (answer) => normalizeText(answer);

const serializeProposalForAi = (proposal) => {
    const normalized = normalizeAiProposal(proposal);
    return [
        \`タイトル: \${normalized.title || '未設定'}\`,
        \`説明: \${normalized.description || '未設定'}\`,
        \`改善要約: \${normalized.improvementSummary || '未設定'}\`,
        \`主な変更: \${normalized.keyChanges.length ? normalized.keyChanges.join(' / ') : '未設定'}\`,
        \`注意点: \${normalized.warnings.length ? normalized.warnings.join(' / ') : 'なし'}\`,
        '',
        '材料案:',
        ...(normalized.ingredients.length
            ? normalized.ingredients.map((item, index) => \`\${index + 1}. \${item.name} / \${[item.quantity, item.unit].filter(Boolean).join('')} / \${item.note}\`)
            : ['- 未設定']),
        '',
        '手順案:',
        ...(normalized.steps.length
            ? normalized.steps.map((item, index) => \`\${index + 1}. \${item.text}\${item.note ? \`（\${item.note}）\` : ''}\`)
            : ['- 未設定']),
        '',
        'エージェント所見:',
        ...(normalized.agentMessages.length
            ? normalized.agentMessages.map((message) => \`- \${message.agentName}: \${message.content}\`)
            : ['- 未設定']),
        ].join('\\n');
};

const hasRecipeProposalBody = (proposal) => {
    const normalized = normalizeAiProposal(proposal);
    return normalized.ingredients.length > 0 && normalized.steps.length > 0;
};

const buildReproposalAnswer = (proposal) => {
    const normalized = normalizeAiProposal(proposal);
    const changes = normalized.keyChanges.slice(0, 3).join('、');
    return [
        \`\${normalized.title || '改善レシピ案'}として、会話内容を踏まえた新しい改善案を作成しました。\`,
        changes ? \`主な反映点は、\${changes}です。\` : '',
        '材料案・手順案のプレビューを更新しているので、内容を確認してから「別レシピとして保存」または「このレシピを上書き保存」を選択してください。',
    ].filter(Boolean).join(' ');
};

const formatConversationForPrompt = (conversation) => {
    const messages = normalizeConversationMessages(conversation).slice(-10);
    if (messages.length === 0) return '- まだ会話なし';
    return messages
        .map(message => \`\${message.role === 'assistant' ? 'AI' : 'ユーザー'}: \${message.content}\`)
        .join('\\n');
};

const agentMessageFromResult = (agent, result, index) => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    avatar: agent.avatar,
    content: normalizeText(result?.content) || '有効な所見を取得できませんでした。',
    timestamp: \`12:00:\${String((index + 1) * 10).padStart(2, '0')}\`,
});

const agentFailureMessage = (agent, error, index) => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    avatar: agent.avatar,
    content: \`\${agent.agentName}の実行に失敗しました。統合判断ではこの不足を留保します。\${normalizeText(error?.message)}\`,
    timestamp: \`12:00:\${String((index + 1) * 10).padStart(2, '0')}\`,
});

const formatAgentFindings = (agentOutputs) => agentOutputs.map(({ agent, result }) => {
    const findings = normalizeArray(result?.findings).map(item => \`  - \${normalizeText(item)}\`).join('\\n');
    const risks = normalizeArray(result?.risks).map(item => \`  - \${normalizeText(item)}\`).join('\\n');
    const recommendations = normalizeArray(result?.recommendations).map(item => \`  - \${normalizeText(item)}\`).join('\\n');
    return [
        \`【\${agent.agentName}】\`,
        \`結論: \${normalizeText(result?.content)}\`,
        findings ? \`所見:\\n\${findings}\` : '',
        risks ? \`留保・リスク:\\n\${risks}\` : '',
        recommendations ? \`提案:\\n\${recommendations}\` : '',
    ].filter(Boolean).join('\\n');
}).join('\\n\\n');

const runAgent = async ({ agent, provider, prompt, note, model }) => {
    const { parsed, payload } = await callRecipeAiJson({
        provider,
        prompt,
        instructions: \`\${agent.agentName}として、入力データと必要なWeb調査に基づき、厳密なJSONだけを返してください。\`,
        tools: agent.usesWeb ? [{ type: 'web_search' }] : undefined,
        toolChoice: agent.usesWeb ? 'required' : undefined,
        maxOutputTokens: agent.usesWeb ? 5000 : 3600,
        timeoutMs: REQUEST_TIMEOUT_MS,
        reasoningEffort: 'high',
        model,
    });
    return {
        agent,
        result: {
            content: normalizeText(parsed?.content),
            findings: normalizeArray(parsed?.findings).map(normalizeText).filter(Boolean),
            risks: normalizeArray(parsed?.risks).map(normalizeText).filter(Boolean),
            recommendations: normalizeArray(parsed?.recommendations).map(normalizeText).filter(Boolean),
        },
        sources: extractSourcesFromProviderResponse(payload, note, agent.sourcePrefix, provider),
    };
};

const settleAgent = async (args, index) => {
    try {
        const output = await runAgent(args);
        return {
            ...output,
            message: agentMessageFromResult(args.agent, output.result, index),
        };
    } catch (error) {
        console.warn(\`[recipeAiService] \${args.agent.agentId} failed\`, error);
        return {
            agent: args.agent,
            result: {
                content: '',
                findings: [],
                risks: [normalizeText(error?.message)],
                recommendations: [],
            },
            sources: [],
            message: agentFailureMessage(args.agent, error, index),
        };
    }
};

const buildProductAgentPrompt = (agentId, brief, memoryContext = '', directionContext = '') => {
    const roleInstructions = {
        research: \`
あなたはWeb調査エージェントです。開発テーマに対して、専門メディア・料理学校・技術記事・シェフ情報を調べ、商品化に使える根拠だけを抽出してください。
流行語ではなく、味・食感・工程・提供オペレーションの裏取りを重視してください。\`,
        globalComparison: \`
あなたは海外・本場比較エージェントです。日本語サイトだけでなく、英語または本場圏の現地語ソースも検索し、日本向けレシピ傾向と海外/本場の標準・専門ソースを比較してください。
目的は「本場らしさ」そのものではなく、海外側の材料比率・工程・味の着地点から、商品開発に採用すべき差分を判断することです。\`,
        synthesizer: \`
あなたはレシピ統合エージェントです。開発テーマを主素材、香味、脂、酸、糖、塩、水分、構造材に分解し、破綻しにくい配合と工程の方向性を出してください。\`,
        science: \`
あなたは食品科学エージェントです。乳化、タンパク質変性、ゲル化、保水、マイヤール反応、酸・塩・糖の効果など、実際の材料と工程に関係する科学だけを扱ってください。\`,
        validator: \`
あなたは科学検証エージェントです。他エージェントが言いそうな提案を批判的に検証し、安全性、温度、分量、工程リスク、材料接地を確認してください。\`,
    };

    return \`
\${roleInstructions[agentId]}

【開発テーマ】
\${normalizeText(brief)}

\${memoryContext}

\${directionContext}

【評価軸】
- 店舗オペレーションで再現しやすいこと
- 味、香り、食感、見た目の狙いが明確なこと
- 材料と手順が具体的で、そのまま編集・保存できること
- 仕込みと提供時の安定性、ロス、原価に配慮すること

\${RECIPE_DEVELOPMENT_AGENT_PROTOCOL}
\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${agentId === 'research' || agentId === 'globalComparison' || agentId === 'validator' ? WEB_RESEARCH_AGENT_PROTOCOL : ''}
\${agentId === 'globalComparison' ? AUTHENTIC_SOURCE_COMPARISON_RULES : ''}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${AGENT_OUTPUT_SCHEMA}
\`;
};

const buildImprovementAgentPrompt = (agentId, recipeText, notes, memoryContext = '', directionContext = '') => {
    const roleInstructions = {
        heritage: \`
あなたは料理文化調査エージェントです。料理名・ジャンル・クラシックとの距離感を調べ、既存レシピの方向性がどの文脈に近いかを判定してください。季節・薬膳・養生には触れないでください。\`,
        research: \`
あなたは調理技術調査エージェントです。Web調査で同種料理の標準工程やプロの技術記事を照合し、火入れ、下処理、乳化、成形、冷却、保存などの改善点を出してください。\`,
        globalComparison: \`
あなたは海外・本場比較エージェントです。既存レシピを日本語圏の傾向だけで評価せず、英語または本場圏の現地語ソースも検索してください。
海外/本場の標準・専門ソースと日本向けレシピの差を、材料、比率、工程、味の着地点、提供スタイルの観点で比較し、この店舗で採用すべき差分だけを提案してください。\`,
        synthesizer: \`
あなたは配合監査エージェントです。材料を主素材、香味、脂、酸、糖、塩、水分、構造材に分解し、過不足・矛盾・再現性の弱い点を監査してください。\`,
        science: \`
あなたは食品科学エージェントです。入力材料と工程に実際に関係する科学だけを使い、食感・香り・歩留まり・安全性に直結する論点を抽出してください。\`,
        validator: \`
あなたは品質検証エージェントです。Web調査で温度・時間・安全性・アレルゲン・保存・工程リスクを確認し、断定できる点と要確認点を分けてください。\`,
    };

    return \`
\${roleInstructions[agentId]}

【既存レシピ】
\${recipeText}

【ユーザー追加指示】
\${normalizeText(notes) || '特になし'}

\${memoryContext}

\${directionContext}

【改善軸】
- 味、香り、食感、見た目の完成度
- 手順のわかりやすさと再現性
- 仕込み・提供時の安定性
- 原価やロスを悪化させない現実的な変更
- 安全性、アレルゲン、温度管理上の注意

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${agentId === 'heritage' || agentId === 'research' || agentId === 'globalComparison' || agentId === 'validator' ? WEB_RESEARCH_AGENT_PROTOCOL : ''}
\${agentId === 'globalComparison' ? AUTHENTIC_SOURCE_COMPARISON_RULES : ''}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${AGENT_OUTPUT_SCHEMA}
\`;
};

const buildCrossCheckPrompt = ({ recipeText, notes, agentFindings, memoryContext = '', directionContext = '' }) => \`
あなたは料理監修委員会の最終クロスチェック担当です。
他の専門エージェントの所見と既存レシピを、Web検索で確認できる標準レシピ・専門記事・科学的知見と突き合わせ、過不足・未開示・事実誤認がないか独立して監査してください。

【既存レシピ】
\${recipeText}

【ユーザー追加指示】
\${normalizeText(notes) || '特になし'}

\${memoryContext}

\${directionContext}

【他エージェントの所見】
\${agentFindings}

【必須監査】
- 材料・分量・工程に過剰がないか
- 一般的に必要な工程や注意点が不足していないか
- アレルゲン、温度、保存、安全性など重要事項が未開示でないか
- 科学的に誤った記述や数値矛盾がないか
- 海外・本場比較エージェントの所見がある場合、日本語圏だけの判断に偏っていないか
- 季節・薬膳・養生の文脈は扱わない

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${WEB_RESEARCH_AGENT_PROTOCOL}
\${AUTHENTIC_SOURCE_COMPARISON_RULES}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
{
  "content": "最終監査の総合コメント。200〜320文字",
  "findings": ["監査所見1", "監査所見2", "監査所見3"],
  "risks": ["過剰・不足・未開示・誤りの指摘。なければ空配列"],
  "recommendations": ["最終修正方針1", "最終修正方針2"]
}
\`;

const buildFinalProductPrompt = ({ brief, agentFindings, memoryContext = '', directionContext = '' }) => \`
あなたは統括シェフエージェントです。
下記の専門エージェント所見をすべて統合し、新規商品として保存可能なレシピを1つ完成させてください。

【開発テーマ】
\${normalizeText(brief)}

\${memoryContext}

\${directionContext}

【専門エージェント所見】
\${agentFindings}

【統合ルール】
- Web調査、配合、食品科学、検証の所見が割れる場合は、再現性と安全性を優先する。
- 海外・本場比較エージェントの所見は、日本の店舗オペレーションに有効な差分だけ採用する。
- 材料と工程は具体的にし、実際に保存して編集できる粒度にする。
- エージェント所見にない材料や技法を無理に足さない。
- 事前確認回答の制約を最優先で守る。特に添加物・機能材の可否は例外なく反映する。
- 季節・薬膳・養生の文脈は扱わない。

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${PROPOSAL_OUTPUT_SCHEMA}
\`;

const buildFinalImprovementPrompt = ({ recipeText, notes, agentFindings, auditFindings, memoryContext = '', directionContext = '' }) => \`
あなたは統括シェフエージェントです。
下記の既存レシピについて、専門エージェントの調査・監査・クロスチェックを総合し、保存可能な改善レシピを1つ完成させてください。

【既存レシピ】
\${recipeText}

【ユーザー追加指示】
\${normalizeText(notes) || '特になし'}

\${memoryContext}

\${directionContext}

【専門エージェント所見】
\${agentFindings}

【最終クロスチェック】
\${auditFindings}

【統合ルール】
- 元レシピの意図を尊重し、必要な改善だけを反映する。
- クロスチェックで指摘された過剰・不足・未開示・誤りを優先して修正する。
- 海外・本場比較エージェントの所見は、日本の店舗オペレーションに有効な差分だけ採用する。
- 分量・温度・時間は再現性を優先して具体的にする。
- 原価やオペレーションを悪化させる変更は避ける。
- 事前確認回答の制約を最優先で守る。特に添加物・機能材の可否は例外なく反映する。
- 季節・薬膳・養生の文脈は扱わない。

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${PROPOSAL_OUTPUT_SCHEMA}
\`;

const buildRebuttalPrompt = ({ contextBlock, draftText, memoryContext = '', directionContext = '' }) => \`
あなたは反証エージェントです。統括シェフが作成した下記のドラフト配合を、採用前に意図的に批判する役割です。
賛辞は不要です。「内容が薄い」「主張と数値が一致しない」点を具体的に暴いてください。

\${contextBlock}

【ドラフト配合（反証対象）】
\${draftText}

\${memoryContext}

\${directionContext}

【必須反証項目】
- 配合の完全性: 塩・水分・油脂・酸・糖など基本要素の欠落。パン生地なら加水率・塩分率・イースト比をベーカーズ%で概算し、現実的な範囲か判定する
- 数値の具体性: 分量が曖昧・不自然でないか。材料の合計量と分量（servings）が釣り合うか
- 主張との整合: 改善要約・主な変更が、材料・分量・手順に実際に反映されているか。「言っただけ」の変更を指摘する
- 手順の密度: 温度・時間・状態の判断基準が書かれているか。抜けている工程（予熱・休ませ・乳化・冷却など）はないか
- 内容の薄さ: 材料数・手順数・説明が題材に対して不足していないか

\${METRIC_UNIT_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
{
  "content": "反証の総括。ドラフトの弱点を200〜320文字で明確に述べる",
  "findings": ["具体的な欠陥指摘1", "具体的な欠陥指摘2", "具体的な欠陥指摘3"],
  "risks": ["このまま採用した場合の失敗リスク。なければ空配列"],
  "recommendations": ["修正指示1（数値を含めて具体的に）", "修正指示2"]
}
\`;

const buildRevisionPrompt = ({ contextBlock, draftText, rebuttalFindings, memoryContext = '', directionContext = '' }) => \`
あなたは統括シェフエージェントです。
自身が作成した下記ドラフト配合に対して、反証エージェントから指摘が出ました。指摘をすべて検討し、修正した完成版レシピを返してください。

\${contextBlock}

【ドラフト配合】
\${draftText}

【反証エージェントの指摘】
\${rebuttalFindings}

\${memoryContext}

\${directionContext}

【修正ルール】
- 妥当な指摘はすべて材料・分量・手順の実データに反映する。要約文だけの反映は禁止。
- 指摘が誤りと判断した場合は、採用しなかった理由を warnings に残す。
- ドラフトの良い部分は維持し、材料・手順を不必要に削らない。
- 改善要約・主な変更は修正後の内容と一致させる。
- 季節・薬膳・養生の文脈は扱わない。

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${PROPOSAL_OUTPUT_SCHEMA}
\`;

// 反証は統括シェフと同じAIだと自己肯定に流れやすいため、別系統のAIに担当させる。
// 反証専用に OpenAI o4-mini を優先し、失敗時のみメインAIへフォールバックする。
const pickRebuttalPlan = (mainProvider) => {
    return pickAgentPlan({ agentId: 'rebuttal', mainProvider });
};

const hasRebuttalCritique = (rebuttalOutput) => Boolean(
    rebuttalOutput.result.content
    || rebuttalOutput.result.findings.length > 0
    || rebuttalOutput.result.recommendations.length > 0
);

// ドラフト配合を反証エージェント（別AI）に批判させ、統括シェフが指摘を反映した完成版を返す。
// 反証・修正のどちらで失敗してもドラフトを失わない（フォールバック優先）。
const runRebuttalAndRevise = async ({ provider, draftParsed, contextBlock, memoryContext, directionContext, rebuttalIndex }) => {
    const draftText = serializeProposalForAi(draftParsed);
    const rebuttalPrompt = buildRebuttalPrompt({ contextBlock, draftText, memoryContext, directionContext });
    const plan = pickRebuttalPlan(provider);

    let rebuttalOutput = await settleAgent({
        agent: { ...AGENT_DEFINITIONS.rebuttal, agentName: \`反証エージェント（\${plan.label}）\` },
        provider: plan.provider,
        model: plan.model,
        prompt: rebuttalPrompt,
        note: \`反証エージェント（\${plan.label}）のドラフト批判に使用\`,
    }, rebuttalIndex);

    // 別AIが使えない環境では、メインAIによる反証で継続する（反証なしよりまし）
    if (!hasRebuttalCritique(rebuttalOutput)) {
        console.warn('[recipeAiService] 別AIでの反証に失敗したため、メインAIで反証を再試行します');
        rebuttalOutput = await settleAgent({
            agent: { ...AGENT_DEFINITIONS.rebuttal, agentName: \`反証エージェント（\${getProviderDisplayName(provider)}）\` },
            provider,
            prompt: rebuttalPrompt,
            note: '反証エージェント（メインAI代替）のドラフト批判に使用',
        }, rebuttalIndex);
    }

    if (!hasRebuttalCritique(rebuttalOutput)) return { finalParsed: draftParsed, rebuttalOutput };

    try {
        const revisionPlan = pickAgentPlan({
            agentId: 'master',
            mainProvider: provider,
            routeContext: {
                mode: 'revision',
                recipeText: draftText,
                directionContext,
            },
        });
        const { parsed } = await callRecipeAiJson({
            provider: revisionPlan.provider,
            prompt: buildRevisionPrompt({
                contextBlock,
                draftText,
                rebuttalFindings: formatAgentFindings([rebuttalOutput]),
                memoryContext,
                directionContext,
            }),
            instructions: 'You are the executive chef agent. Revise your draft recipe to address every valid critique from the rebuttal agent. Return strict JSON only.',
            maxOutputTokens: 7000,
            timeoutMs: REQUEST_TIMEOUT_MS,
            reasoningEffort: 'high',
            model: revisionPlan.model,
        });
        const revised = normalizeAiProposal(parsed);
        if (revised.ingredients.length === 0 || revised.steps.length === 0) {
            console.warn('[recipeAiService] 反証後の修正案が不完全なためドラフトを採用します');
            return { finalParsed: draftParsed, rebuttalOutput };
        }
        validateMetricUnitsInProposal(parsed);
        return { finalParsed: parsed, rebuttalOutput };
    } catch (error) {
        console.warn('[recipeAiService] 反証後の修正生成に失敗したためドラフトを採用します', error);
        return { finalParsed: draftParsed, rebuttalOutput };
    }
};

const buildProductConversationAgentPrompt = (agentId, recipeText, currentProposalText, conversationText, question, memoryContext = '', directionContext = '') => {
    const roleInstructions = {
        research: \`
あなたはWeb調査エージェントです。現在の商品案とユーザー追加質問に対して、専門メディア・料理学校・技術記事・シェフ情報を調べ、回答と再設計に必要な根拠だけを抽出してください。\`,
        globalComparison: \`
あなたは海外・本場比較エージェントです。現在の商品案を日本語圏だけでなく、英語または本場圏の現地語ソースでも比較し、今回の質問に対して採用価値のある差分だけを示してください。\`,
        synthesizer: \`
あなたはレシピ統合エージェントです。現在の商品案と質問内容を踏まえ、配合・工程・提供オペレーションのどこをどう見直すべきかを統合してください。\`,
        science: \`
あなたは食品科学エージェントです。現在の商品案と質問内容に対して、食感・香り・歩留まり・安定性に関係する科学だけを抽出してください。\`,
        validator: \`
あなたは科学検証エージェントです。現在の商品案と質問内容を批判的に見て、温度、時間、分量、安全性、工程リスクの妥当性を確認してください。\`,
    };

    return \`
\${roleInstructions[agentId]}

【現在のフォーム内容】
\${recipeText}

【現在の商品案】
\${currentProposalText}

【これまでの会話】
\${conversationText}

【今回のユーザー質問・修正依頼】
\${normalizeText(question)}

\${memoryContext}

\${directionContext}

【判断ルール】
- 単なる説明要求でも、回答に必要な根拠と留保を整理する。
- レシピ変更が必要なら、どの材料・工程・狙いをどう変えるべきかを明示する。
- 現在の商品案にない材料や技法は、明確な理由がある場合だけ提案する。

\${RECIPE_DEVELOPMENT_AGENT_PROTOCOL}
\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${agentId === 'research' || agentId === 'globalComparison' || agentId === 'validator' ? WEB_RESEARCH_AGENT_PROTOCOL : ''}
\${agentId === 'globalComparison' ? AUTHENTIC_SOURCE_COMPARISON_RULES : ''}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${AGENT_OUTPUT_SCHEMA}
\`;
};

const buildImprovementConversationAgentPrompt = (agentId, recipeText, currentProposalText, conversationText, question, memoryContext = '', directionContext = '') => {
    const roleInstructions = {
        heritage: \`
あなたは料理文化調査エージェントです。元レシピと現在の改善案がどの料理文脈に位置するかを見直し、今回の質問に対して文化的・技術的に無理のない回答を出してください。\`,
        research: \`
あなたは調理技術調査エージェントです。今回の質問に対して、同種料理の標準工程、プロの技術記事、実務的な調理ノウハウを照合してください。\`,
        globalComparison: \`
あなたは海外・本場比較エージェントです。元レシピと現在の改善案を日本語圏だけでなく、英語または本場圏の現地語ソースでも見直し、今回の質問に対して採用価値のある差分だけを示してください。\`,
        synthesizer: \`
あなたは配合監査エージェントです。現在の改善案に対して、今回の質問を踏まえた配合・工程・再現性の見直し点を監査してください。\`,
        science: \`
あなたは食品科学エージェントです。今回の質問に関係する材料と工程だけに絞って、食感・香り・歩留まり・安定性の科学的判断を示してください。\`,
        validator: \`
あなたは品質検証エージェントです。現在の改善案と今回の質問に対して、温度・時間・安全性・保存・工程リスクの妥当性を確認してください。\`,
    };

    return \`
\${roleInstructions[agentId]}

【元レシピ】
\${recipeText}

【現在の改善案】
\${currentProposalText}

【これまでの会話】
\${conversationText}

【今回のユーザー質問・修正依頼】
\${normalizeText(question)}

\${memoryContext}

\${directionContext}

【判断ルール】
- 単なる説明要求でも、回答に必要な根拠と留保を整理する。
- 改善案の変更が必要なら、どの材料・工程・狙いをどう変えるべきかを明示する。
- 元レシピと現在案の意図から外れた変更は避ける。

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${agentId === 'heritage' || agentId === 'research' || agentId === 'globalComparison' || agentId === 'validator' ? WEB_RESEARCH_AGENT_PROTOCOL : ''}
\${agentId === 'globalComparison' ? AUTHENTIC_SOURCE_COMPARISON_RULES : ''}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${AGENT_OUTPUT_SCHEMA}
\`;
};

const buildConversationCrossCheckPrompt = ({ mode, recipeText, currentProposalText, conversationText, question, agentFindings, forceReproposal, memoryContext = '', directionContext = '' }) => \`
あなたは料理監修委員会の最終クロスチェック担当です。
現在案への追加質問に対する回答と、必要なレシピ更新が妥当かを、Web検索で確認できる標準レシピ・専門記事・科学的知見と突き合わせて独立監査してください。

【モード】
\${mode === 'product' ? '新規商品開発の会話継続' : '既存レシピ改善の会話継続'}

【元レシピまたは現在フォーム内容】
\${recipeText}

【現在案】
\${currentProposalText}

【これまでの会話】
\${conversationText}

【今回のユーザー質問・修正依頼】
\${normalizeText(question)}

\${memoryContext}

\${directionContext}

【専門エージェント所見】
\${agentFindings}

【今回の処理モード】
\${forceReproposal
        ? '再提案モード: ユーザーは会話内容を踏まえた新しい改善レシピ案を求めています。shouldUpdateProposalは必ずtrueにし、proposal.ingredientsとproposal.stepsを必ず完全な更新後レシピとして作り直してください。answerだけでレシピ本文を済ませてはいけません。'
        : '通常会話モード: 質問に直接回答し、必要がある場合だけproposalを更新してください。ただしproposalには常に完全な現在案を返してください。'}

【応答ルール】
- 回答が雰囲気や一般論に流れていないか
- 材料・分量・工程に過剰や不足がないか
- 温度・時間・安全性・保存上の重要事項が未確認のまま断定されていないか
- 海外・本場比較が必要な質問で、日本語圏だけの判断に偏っていないか
- 更新しない場合も、その判断理由が明確か

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${WEB_RESEARCH_AGENT_PROTOCOL}
\${AUTHENTIC_SOURCE_COMPARISON_RULES}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
{
  "content": "会話回答とレシピ更新方針に対する監査コメント。200〜320文字",
  "findings": ["監査所見1", "監査所見2", "監査所見3"],
  "risks": ["未確認事項やリスク。なければ空配列"],
  "recommendations": ["最終修正方針1", "最終修正方針2"]
}
\`;

const buildFinalConversationPrompt = ({ mode, recipeText, currentProposalText, conversationText, question, agentFindings, auditFindings, forceReproposal, memoryContext = '', directionContext = '' }) => \`
あなたは統括シェフエージェントです。
現在案に対する追加質問について、専門エージェント調査と最終監査を統合し、正確で保存可能な回答とレシピ案を返してください。

【モード】
\${mode === 'product' ? '新規商品開発の会話継続' : '既存レシピ改善の会話継続'}

【元レシピまたは現在フォーム内容】
\${recipeText}

【現在案】
\${currentProposalText}

【これまでの会話】
\${conversationText}

【今回のユーザー質問・修正依頼】
\${normalizeText(question)}

\${memoryContext}

\${directionContext}

【専門エージェント所見】
\${agentFindings}

【最終クロスチェック】
\${auditFindings}

【今回の処理モード】
\${forceReproposal
        ? '再提案モード: ユーザーは会話内容を踏まえた新しいレシピ案を求めています。shouldUpdateProposalは必ずtrueにし、proposal.ingredientsとproposal.stepsを必ず完全な更新後レシピとして作り直してください。'
        : '通常会話モード: 質問に直接答え、レシピ変更が必要な場合だけshouldUpdateProposalをtrueにしてください。ただしproposalには常に完全な現在の最良案を返してください。'}

【統合ルール】
- answerでは、質問への直接回答、根拠、留保、必要なら判断理由を簡潔にまとめる。
- 一般論ではなく、元レシピ、現在案、調査結果、監査結果に接続して答える。
- 更新する場合は、keyChangesに今回の会話で何を変えたかを明記する。
- 更新しない場合も、proposalには現在の最良案を完全な形で返す。
- 海外・本場比較エージェントの所見は、日本の店舗オペレーションに有効な差分だけ採用する。
- 事前確認回答の制約を最優先で守る。特に添加物・機能材の可否は例外なく反映する。
- 季節・薬膳・養生の文脈は扱わない。

\${directionContext ? DIRECTION_LOCK_RULES : ''}
\${METRIC_UNIT_RULES}
\${EVIDENCE_DISCIPLINE_RULES}
\${STRICT_JSON_OUTPUT_RULES}
以下のJSONのみを返してください。
\${CONVERSATION_OUTPUT_SCHEMA}
\`;

const completeProposalWithMeta = ({ proposal, agentOutputs, auditOutput, rebuttalOutput, finalSources }) => normalizeAiProposal({
    ...proposal,
    agentMessages: [
        ...agentOutputs.map(output => output.message),
        ...(auditOutput ? [auditOutput.message] : []),
        ...(rebuttalOutput ? [rebuttalOutput.message] : []),
        {
            agentId: AGENT_DEFINITIONS.master.agentId,
            agentName: AGENT_DEFINITIONS.master.agentName,
            avatar: AGENT_DEFINITIONS.master.avatar,
            content: normalizeText(proposal?.improvementSummary || proposal?.description || '全エージェントの所見を統合し、保存可能なレシピ案に整理しました。'),
            timestamp: \`12:00:\${String((agentOutputs.length + (auditOutput ? 1 : 0) + (rebuttalOutput ? 1 : 0) + 1) * 10).padStart(2, '0')}\`,
        },
    ],
    sources: finalSources,
    audit: auditOutput?.result || null,
    rebuttal: rebuttalOutput?.result || null,
});

const mergeProposalContext = (currentProposal, nextProposal, extra = {}) => {
    const current = normalizeAiProposal(currentProposal);
    const next = normalizeAiProposal(nextProposal);
    return normalizeAiProposal({
        ...current,
        ...next,
        title: next.title || current.title,
        description: next.description || current.description,
        course: next.course || current.course,
        category: next.category || current.category,
        country: next.country || current.country,
        servings: next.servings || current.servings,
        improvementSummary: next.improvementSummary || current.improvementSummary,
        keyChanges: next.keyChanges.length > 0 ? next.keyChanges : current.keyChanges,
        warnings: next.warnings.length > 0 ? next.warnings : current.warnings,
        ingredients: next.ingredients.length > 0 ? next.ingredients : current.ingredients,
        steps: next.steps.length > 0 ? next.steps : current.steps,
        agentMessages: [
            ...current.agentMessages,
            ...normalizeAgentMessages(extra.agentMessages),
        ],
        sources: mergeSources(current.sources, normalizeSources(extra.sources)),
        audit: next.audit || current.audit,
        learningMeta: next.learningMeta || current.learningMeta || null,
    });
};

export const generateProductRecipeDraft = async ({ brief, provider, directionContext = '' }) => {
    const cleanBrief = normalizeText(brief);
    if (!cleanBrief) throw new Error('開発テーマを入力してください。');
    const { memories, memoryContext } = await buildRecipeAiMemoryContext({
        modeFamily: 'product',
        recipe: {
            title: cleanBrief,
            description: cleanBrief,
        },
        question: cleanBrief,
    });

    const agentOrder = ['research', 'globalComparison', 'synthesizer', 'science', 'validator'];
    const routeContext = {
        mode: 'product',
        brief: cleanBrief,
        question: cleanBrief,
        directionContext,
    };
    const agentOutputs = await Promise.all(agentOrder.map((agentId, index) => settleAgent({
        agent: AGENT_DEFINITIONS[agentId],
        ...pickAgentPlan({ agentId, mainProvider: provider, routeContext }),
        prompt: buildProductAgentPrompt(agentId, cleanBrief, memoryContext, directionContext),
        note: \`\${AGENT_DEFINITIONS[agentId].agentName}の調査・判断に使用\`,
    }, index)));
    const agentFindings = formatAgentFindings(agentOutputs);
    const masterPlan = pickAgentPlan({ agentId: 'master', mainProvider: provider, routeContext });

    const { parsed, payload } = await callRecipeAiJson({
        provider: masterPlan.provider,
        prompt: buildFinalProductPrompt({ brief: cleanBrief, agentFindings, memoryContext, directionContext }),
        instructions: 'You are the executive chef agent. Synthesize all specialist findings into one save-ready recipe. Return strict JSON only.',
        tools: [{ type: 'web_search' }],
        toolChoice: 'auto',
        maxOutputTokens: 7000,
        timeoutMs: REQUEST_TIMEOUT_MS,
        reasoningEffort: 'high',
        model: masterPlan.model,
    });

    // 統括シェフのドラフトを反証エージェントに批判させ、指摘を反映した完成版に差し替える
    const { finalParsed, rebuttalOutput } = await runRebuttalAndRevise({
        provider,
        draftParsed: parsed,
        contextBlock: ['【開発テーマ】', cleanBrief].join('\\n'),
        memoryContext,
        directionContext,
        rebuttalIndex: agentOutputs.length,
    });

    const sources = mergeSources(
        ...agentOutputs.map(output => output.sources),
        extractSourcesFromProviderResponse(payload, '統括シェフエージェントの最終判断に使用', 'M', masterPlan.provider)
    );

    const proposal = completeProposalWithMeta({
        proposal: validateMetricUnitsInProposal(finalParsed),
        agentOutputs,
        rebuttalOutput,
        finalSources: sources,
    });
    const runId = await logRecipeAiRun({
        modeFamily: 'product',
        runKind: 'generate',
        provider,
        recipe: {
            title: cleanBrief,
            description: cleanBrief,
        },
        proposal,
        question: cleanBrief,
        answer: proposal.improvementSummary || proposal.description,
        agentMessages: proposal.agentMessages,
        sources: proposal.sources,
        metadata: {
            retrievedMemoryIds: memories.map((memory) => memory.id),
            directionContext: normalizeText(directionContext),
        },
    });

    return normalizeAiProposal({
        ...proposal,
        learningMeta: {
            runId,
            modeFamily: 'product',
        },
    });
};

export const generateRecipeImprovement = async ({ recipe, notes, provider, directionContext = '' }) => {
    const recipeText = serializeRecipeForAi(recipe);
    const { memories, memoryContext } = await buildRecipeAiMemoryContext({
        modeFamily: 'improvement',
        recipe,
        question: notes,
    });
    const agentOrder = ['heritage', 'research', 'globalComparison', 'synthesizer', 'science', 'validator'];
    const routeContext = {
        mode: 'improvement',
        recipeText,
        notes,
        question: notes,
        directionContext,
    };
    const agentOutputs = await Promise.all(agentOrder.map((agentId, index) => settleAgent({
        agent: AGENT_DEFINITIONS[agentId],
        ...pickAgentPlan({ agentId, mainProvider: provider, routeContext }),
        prompt: buildImprovementAgentPrompt(agentId, recipeText, notes, memoryContext, directionContext),
        note: \`\${AGENT_DEFINITIONS[agentId].agentName}の調査・判断に使用\`,
    }, index)));
    const agentFindings = formatAgentFindings(agentOutputs);
    const auditPlan = pickAgentPlan({ agentId: 'auditor', mainProvider: provider, routeContext });

    const auditOutput = await settleAgent({
        agent: AGENT_DEFINITIONS.auditor,
        provider: auditPlan.provider,
        model: auditPlan.model,
        prompt: buildCrossCheckPrompt({ recipeText, notes, agentFindings, memoryContext, directionContext }),
        note: '最終クロスチェックの裏取りに使用',
    }, agentOutputs.length);

    const auditFindings = formatAgentFindings([auditOutput]);
    const masterPlan = pickAgentPlan({ agentId: 'master', mainProvider: provider, routeContext });
    const { parsed, payload } = await callRecipeAiJson({
        provider: masterPlan.provider,
        prompt: buildFinalImprovementPrompt({ recipeText, notes, agentFindings, auditFindings, memoryContext, directionContext }),
        instructions: 'You are the executive chef agent. Synthesize all specialist findings and audit results into one save-ready improved recipe. Return strict JSON only.',
        tools: [{ type: 'web_search' }],
        toolChoice: 'auto',
        maxOutputTokens: 7000,
        timeoutMs: REQUEST_TIMEOUT_MS,
        reasoningEffort: 'high',
        model: masterPlan.model,
    });

    // 統括シェフのドラフトを反証エージェントに批判させ、指摘を反映した完成版に差し替える
    const { finalParsed, rebuttalOutput } = await runRebuttalAndRevise({
        provider,
        draftParsed: parsed,
        contextBlock: ['【既存レシピ】', recipeText, '', '【ユーザー追加指示】', normalizeText(notes) || '特になし'].join('\\n'),
        memoryContext,
        directionContext,
        rebuttalIndex: agentOutputs.length + 1,
    });

    const sources = mergeSources(
        ...agentOutputs.map(output => output.sources),
        auditOutput.sources,
        extractSourcesFromProviderResponse(payload, '統括シェフエージェントの最終判断に使用', 'M', masterPlan.provider)
    );

    const proposal = completeProposalWithMeta({
        proposal: validateMetricUnitsInProposal(finalParsed),
        agentOutputs,
        auditOutput,
        rebuttalOutput,
        finalSources: sources,
    });
    const runId = await logRecipeAiRun({
        modeFamily: 'improvement',
        runKind: 'generate',
        provider,
        recipe,
        proposal,
        question: notes,
        answer: proposal.improvementSummary || proposal.description,
        agentMessages: proposal.agentMessages,
        sources: proposal.sources,
        metadata: {
            retrievedMemoryIds: memories.map((memory) => memory.id),
            directionContext: normalizeText(directionContext),
        },
    });

    return normalizeAiProposal({
        ...proposal,
        learningMeta: {
            runId,
            modeFamily: 'improvement',
        },
    });
};

export const askRecipeAiQuestion = async ({
    recipe,
    proposal,
    conversation,
    question,
    provider,
    mode = 'improvement',
}) => {
    const cleanQuestion = normalizeText(question);
    if (!cleanQuestion) {
        throw new Error('質問を入力してください。');
    }

    const recipeText = serializeRecipeForAi(recipe);
    const currentProposalText = serializeProposalForAi(proposal);
    const conversationText = formatConversationForPrompt(conversation);

    const systemInstruction = \`あなたはレシピ開発の相談役（エージェント）です。
改善対象の元レシピ、現在の改善提案、およびこれまでの会話履歴を踏まえ、ユーザーからの質問や指摘に対して「回答・アドバイス」をテキストで返してください。

指示：
- 今回のステップでは新しいレシピのJSONデータを作る必要はありません。純粋なテキストアドバイスのみを行ってください。
- 返却フォーマット: 以下の構造の JSON のみ。余計な説明文やコードブロックは一切含めず、純粋なJSON文字列としてのみ出力してください。
{
  "response": "（ここに回答・アドバイスの文章が入ります）"
}\`;

    const promptText = \`【改善対象レシピ】\\n\${recipeText}\\n\\n【現在の改善提案】\\n\${currentProposalText}\\n\\n【これまでの会話履歴】\\n\${conversationText}\\n\\n【今回の質問・修正指示】\\n\${cleanQuestion}\`;

    const plan = pickAgentPlan({ agentId: 'master', mainProvider: provider, routeContext: { mode } });

    const { parsed } = await callRecipeAiJson({
        provider: plan.provider,
        model: plan.model,
        prompt: promptText,
        instructions: systemInstruction,
        maxOutputTokens: 1000,
        timeoutMs: 15000,
    });

    return parsed?.response || '回答を生成できませんでした。';
};

const analyzeConversationQuestionRelevance = async ({ question, recipeText, currentProposalText }) => {
    const systemInstruction = \`あなたはAIルーティングエージェントです。
ユーザーからの「改善提案に対する追加質問・修正指示」を分析し、以下の専門家エージェントのうち、この質問に回答するため、あるいはレシピを再検討するために「新しくWeb調査や専門検証を実行する必要があるエージェントのID」を配列で返してください。

エージェント一覧:
- 'heritage' (料理文化調査): 料理の歴史的由来、正統性、名前の文脈などに関する質問の場合のみ選択。
- 'research' (Web調査): 特定ের材料や製法、代替食材についての一般的な調査が必要な場合。
- 'globalComparison' (海外・本場比較): 海外の標準製法、海外の他レシピとの比較などの調査が必要な場合。
- 'synthesizer' (レシピ統合): 材料の配合率、分量、工程の手順などの「具体的な構成」についての変更指示の場合。
- 'science' (食品科学検証): 火入れの理屈、食感への科学的影響、化学変化、保存性などの理屈に関する質問の場合。
- 'validator' (科学・安全性検証): 温度管理、衛生状態、再現性、アレルギーなど安全性に関する質問の場合。

指示：
- 質問内容に関連しないエージェントは一切起動しないよう、厳密に選別してください。
- 配合や手順の具体的な変更が伴わない純粋な質問（例：「この工程の意味は何ですか？」「別のやり方はありますか？」）の場合は、材料の再構成を伴わないため、'synthesizer'も不要と判断できます。
- 返却フォーマット: 以下の構造の JSON のみ。余計な説明文やマークダウンのコードブロックは一切含めず、純粋なJSON文字列としてのみ出力してください。
{
  "activeAgentIds": ["science", "synthesizer"]
}\`;

    const promptText = \`【改善対象レシピ】\\n\${recipeText}\\n\\n【前回の提案内容】\\n\${currentProposalText}\\n\\n【追加の質問・修正指示】\\n\${question}\`;

    try {
        const { parsed } = await callRecipeAiJson({
            provider: 'groq',
            prompt: promptText,
            instructions: systemInstruction,
            maxOutputTokens: 500,
            timeoutMs: 15000,
        });
        if (Array.isArray(parsed?.activeAgentIds)) {
            return parsed.activeAgentIds.map(v => String(v).trim());
        }
    } catch (e) {
        console.warn('[analyzeConversationQuestionRelevance] Routing failed, fallback to all active:', e);
    }
    return ['heritage', 'research', 'globalComparison', 'synthesizer', 'science', 'validator'];
};

export const continueRecipeAiConversation = async ({
    recipe,
    proposal,
    conversation,
    question,
    provider,
    mode = 'improvement',
    directionContext = '',
}) => {
    const cleanQuestion = normalizeText(question);
    if (!cleanQuestion) {
        throw new Error('質問または修正内容を入力してください。');
    }

    const forceReproposal = isRecipeReproposalRequest(cleanQuestion);
    const recipeText = serializeRecipeForAi(recipe);
    const currentProposalText = serializeProposalForAi(proposal);
    const conversationText = formatConversationForPrompt(conversation);
    const { memories, memoryContext } = await buildRecipeAiMemoryContext({
        modeFamily: mode === 'product' ? 'product' : 'improvement',
        recipe,
        proposal,
        question: cleanQuestion,
    });

    const isProductMode = mode === 'product';
    const agentOrder = isProductMode
        ? ['research', 'globalComparison', 'synthesizer', 'science', 'validator']
        : ['heritage', 'research', 'globalComparison', 'synthesizer', 'science', 'validator'];
    const routeContext = {
        mode,
        recipeText,
        notes: cleanQuestion,
        question: cleanQuestion,
        currentProposalText,
        directionContext,
    };

    // ユーザーの質問・指示に関連するエージェントを自動選別する
    const activeAgentIds = await analyzeConversationQuestionRelevance({
        question: cleanQuestion,
        recipeText,
        currentProposalText,
    });

    const previousAgentMessages = proposal?.agentMessages || [];

    const agentOutputs = await Promise.all(agentOrder.map(async (agentId, index) => {
        const hasCache = previousAgentMessages.some(m => m.agentId === agentId && m.content);
        const shouldRun = activeAgentIds.includes(agentId) || !hasCache;

        if (shouldRun) {
            return await settleAgent({
                agent: AGENT_DEFINITIONS[agentId],
                ...pickAgentPlan({ agentId, mainProvider: provider, routeContext }),
                prompt: isProductMode
                    ? buildProductConversationAgentPrompt(agentId, recipeText, currentProposalText, conversationText, cleanQuestion, memoryContext, directionContext)
                    : buildImprovementConversationAgentPrompt(agentId, recipeText, currentProposalText, conversationText, cleanQuestion, memoryContext, directionContext),
                note: \`\${AGENT_DEFINITIONS[agentId].agentName}の会話回答・再評価に使用\`,
            }, index);
        } else {
            const cached = previousAgentMessages.find(m => m.agentId === agentId);
            return {
                agent: AGENT_DEFINITIONS[agentId],
                result: {
                    content: cached?.content || '(前回の調査結果に問題は見つかりませんでした。)',
                    findings: [],
                    risks: [],
                    recommendations: [],
                },
                sources: [],
                inputTokens: 0,
                outputTokens: 0,
                estimatedCostJpy: 0,
                status: 'success',
                message: {
                    agentId,
                    agentName: AGENT_DEFINITIONS[agentId].agentName,
                    avatar: AGENT_DEFINITIONS[agentId].avatar,
                    content: cached?.content || '(前回の調査結果に問題は見つかりませんでした。)',
                    timestamp: cached?.timestamp || new Date().toLocaleTimeString('ja-JP', { hour12: false }),
                }
            };
        }
    }));

    const agentFindings = formatAgentFindings(agentOutputs);
    const auditPlan = pickAgentPlan({ agentId: 'auditor', mainProvider: provider, routeContext });
    const auditOutput = await settleAgent({
        agent: AGENT_DEFINITIONS.auditor,
        provider: auditPlan.provider,
        model: auditPlan.model,
        prompt: buildConversationCrossCheckPrompt({
            mode,
            recipeText,
            currentProposalText,
            conversationText,
            question: cleanQuestion,
            agentFindings,
            forceReproposal,
            memoryContext,
            directionContext,
        }),
        note: '会話回答・再評価の最終クロスチェックに使用',
    }, agentOutputs.length);

    const auditFindings = formatAgentFindings([auditOutput]);
    const masterPlan = pickAgentPlan({ agentId: 'master', mainProvider: provider, routeContext });
    const { parsed, payload } = await callRecipeAiJson({
        provider: masterPlan.provider,
        prompt: buildFinalConversationPrompt({
            mode,
            recipeText,
            currentProposalText,
            conversationText,
            question: cleanQuestion,
            agentFindings,
            auditFindings,
            forceReproposal,
            memoryContext,
            directionContext,
        }),
        instructions: 'You are a conversational executive chef agent. Use the specialist findings and audit results to answer accurately and return strict JSON only.',
        tools: [{ type: 'web_search' }],
        toolChoice: 'auto',
        maxOutputTokens: 7000,
        timeoutMs: REQUEST_TIMEOUT_MS,
        reasoningEffort: 'high',
        model: masterPlan.model,
    });

    const sourceList = extractSourcesFromProviderResponse(payload, '会話回答・追加改善の参照に使用', 'C', masterPlan.provider);
    const proposedUpdate = parsed?.proposal
        ? validateMetricUnitsInProposal(parsed.proposal)
        : proposal;
    if (forceReproposal && !hasRecipeProposalBody(parsed?.proposal)) {
        throw new Error('再提案の材料案・手順案を生成できませんでした。もう一度、追加したい材料や方向性を具体的に入力してください。');
    }
    const shouldUpdateProposal = forceReproposal || Boolean(parsed?.shouldUpdateProposal);
    const enrichedProposal = completeProposalWithMeta({
        proposal: proposedUpdate,
        agentOutputs,
        auditOutput,
        finalSources: mergeSources(
            ...agentOutputs.map(output => output.sources),
            auditOutput.sources,
            sourceList
        ),
    });
    const updatedProposal = mergeProposalContext(
        proposal,
        enrichedProposal,
        {
            agentMessages: enrichedProposal.agentMessages,
            sources: enrichedProposal.sources,
        }
    );
    const answer = forceReproposal
        ? buildReproposalAnswer(updatedProposal)
        : validateMetricUnitsInConversationAnswer(parsed?.answer) || '文脈を踏まえた回答を生成できませんでした。';
    const runId = await logRecipeAiRun({
        modeFamily: isProductMode ? 'product' : 'improvement',
        runKind: 'conversation',
        provider,
        recipe,
        proposal: updatedProposal,
        question: cleanQuestion,
        answer,
        agentMessages: updatedProposal.agentMessages,
        sources: updatedProposal.sources,
        metadata: {
            forceReproposal,
            shouldUpdateProposal,
            retrievedMemoryIds: memories.map((memory) => memory.id),
            conversation: normalizeConversationMessages(conversation).slice(-12),
            directionContext: normalizeText(directionContext),
        },
    });
    const finalProposal = normalizeAiProposal({
        ...updatedProposal,
        learningMeta: {
            runId,
            modeFamily: isProductMode ? 'product' : 'improvement',
        },
    });

    return {
        answer,
        shouldUpdateProposal,
        forceReproposal,
        proposal: finalProposal,
        sources: finalProposal.sources,
        agentMessages: finalProposal.agentMessages,
    };
};

// パンレシピの粉振り分け用: 元レシピの粉リストに名前一致しない新規材料でも、粉系の名称なら粉欄に入れる。
// 粉グループが空だとベーカーズ%の基準が0gになり全材料が0%表示になるため、銘柄粉も確実に拾う。
const BREAD_FLOUR_NAME_PATTERN = /(?:強力|薄力|中力|準強力|全粒|ライ麦|米|そば|大麦|玄米)粉|小麦粉|セモリナ|デュラム|グラハム|マニトバ|リスドォル|カメリヤ|スーパーキング|ゆめちから|キタノカオリ|春よ恋|はるゆたか|flour/i;
// 「〜粉」で終わっても基準粉として扱わないもの（衣・打ち粉・和粉・「粉◯◯」系の粉末材料）
const BREAD_NON_FLOUR_NAME_PATTERN = /パン粉|打ち粉|きな粉|片栗粉|浮き粉|葛粉|くず粉|わらび粉|抹茶粉|ココア粉|粉糖|粉砂糖|粉乳|粉チーズ|粉ゼラチン|粉寒天|粉山椒/;
const isBreadFlourName = (name) => {
    const text = normalizeText(name);
    if (!text || BREAD_NON_FLOUR_NAME_PATTERN.test(text)) return false;
    if (BREAD_FLOUR_NAME_PATTERN.test(text)) return true;
    // 「マニトバ粉」「◯◯粉（銘柄補足）」など「粉」で終わる名称は基準粉とみなす
    return /粉\\s*(?:[（(【[].*)?$/.test(text);
};

const generateIngredientId = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : \`\${Date.now()}-\${Math.random().toString(16).slice(2)}\`
);

export const buildRecipePayloadFromAiProposal = (baseRecipe, proposal, { asNew = false } = {}) => {
    const normalized = normalizeAiProposal(proposal);
    const base = baseRecipe || {};
    const isBread = base.type === 'bread';
    const title = normalized.title || base.title || 'AI改善レシピ';
    const nextTitle = asNew && normalizeText(title) === normalizeText(base.title)
        ? \`\${title}（AI改善案）\`
        : title;

    // 元レシピがパン配合の場合はtypeと粉/その他の構造を維持したまま提案を反映する
    let type = 'normal';
    let flours = [];
    let breadIngredients = [];
    let ingredients = normalized.ingredients.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        cost: '',
        purchaseCost: '',
        note: item.note,
    }));

    if (isBread) {
        type = 'bread';
        const baseBreadItems = [...(Array.isArray(base.flours) ? base.flours : []), ...(Array.isArray(base.breadIngredients) ? base.breadIngredients : [])];
        const toNameKey = (value) => normalizeText(value).toLowerCase();
        const baseFlourNameKeys = new Set(
            (Array.isArray(base.flours) ? base.flours : []).map((item) => toNameKey(item?.name)).filter(Boolean)
        );

        normalized.ingredients.forEach((item) => {
            const nameKey = toNameKey(item.name);
            const matchedBaseItem = baseBreadItems.find((baseItem) => toNameKey(baseItem?.name) === nameKey) || null;
            const built = {
                id: matchedBaseItem?.id || generateIngredientId(),
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                cost: '',
                purchaseCost: '',
                note: item.note,
                isAlcohol: matchedBaseItem?.isAlcohol ?? false,
                itemCategory: matchedBaseItem?.itemCategory ?? null,
            };
            const isFlour = baseFlourNameKeys.has(nameKey) || isBreadFlourName(item.name);
            if (isFlour) {
                flours.push(built);
            } else {
                breadIngredients.push(built);
            }
        });
        ingredients = [...flours, ...breadIngredients];
    }

    return {
        ...base,
        ...(asNew ? { id: undefined, created_at: undefined, updated_at: undefined } : { id: base.id }),
        title: nextTitle,
        description: normalized.description || normalized.improvementSummary || base.description || '',
        course: normalized.course || base.course || '',
        category: normalized.category || base.category || '',
        country: normalized.country || base.country || '',
        storeName: base.storeName || base.store_name || '',
        servings: normalized.servings || base.servings || '',
        type,
        image: base.image || '',
        sourceUrl: base.sourceUrl || '',
        tags: Array.from(new Set([...(Array.isArray(base.tags) ? base.tags : []), 'AI改善', 'マルチエージェント'])).filter(Boolean),
        ingredients,
        ingredientGroups: [],
        steps: normalized.steps.map((item) => ({ text: item.text })),
        stepGroups: [],
        flours,
        breadIngredients,
    };
};
`;export{n as default};
