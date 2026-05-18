/** レシピ「コース」案A+Bハイブリッド（固定13種） */
export const RECIPE_COURSE_OPTIONS = [
    'アミューズ',
    '前菜',
    '温菜',
    'スープ',
    '魚料理',
    '肉料理',
    'デザート',
    'プティフール',
    '食パン',
    '仕込み',
    '軽食・デリ',
    'タパス・小皿',
    'その他',
];

/** 一覧ページのセクション表示順（献立の流れ：アミューズ→前菜→…→デザート→プティフール） */
export const RECIPE_LIST_COURSE_ORDER = [
    'アミューズ',
    '前菜',
    '温菜',
    'タパス・小皿',
    'スープ',
    '魚料理',
    '肉料理',
    'デザート',
    '食パン',
    'プティフール',
    '軽食・デリ',
    '仕込み',
    'その他',
];

export const RECIPE_LIST_COURSE_ICONS = {
    プティフール: '🍬',
    アミューズ: '✨',
    前菜: '🥗',
    温菜: '♨️',
    'タパス・小皿': '🫒',
    スープ: '🍲',
    魚料理: '🐟',
    肉料理: '🥩',
    デザート: '🍰',
    食パン: '🍞',
    '軽食・デリ': '🥪',
    仕込み: '📦',
    その他: '📁',
    未分類: '❓',
};

const normalizeKey = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const EXACT_ALIAS_MAP = {
    amuse: 'アミューズ',
    アミューズブッシュ: 'アミューズ',
    'hors-d\'œuvre': 'アミューズ',
    'hors d\'oeuvre': 'アミューズ',
    オードブル: '前菜',
    starter: '前菜',
    温菜: '温菜',
    温製: '温菜',
    entree: '温菜',
    entrée: '温菜',
    soup: 'スープ',
    汁: 'スープ',
    ポタージュ: 'スープ',
    fish: '魚料理',
    魚: '魚料理',
    シーフード: '魚料理',
    meat: '肉料理',
    肉: '肉料理',
    dessert: 'デザート',
    デザート: 'デザート',
    お菓子: 'デザート',
    スイーツ: 'デザート',
    プティフル: 'プティフール',
    petitfour: 'プティフール',
    'petit four': 'プティフール',
    bread: '食パン',
    パン: '食パン',
    ブレッド: '食パン',
    仕込み: '仕込み',
    下準備: '仕込み',
    単品: '仕込み',
    ランチデリ: '軽食・デリ',
    デリ: '軽食・デリ',
    deli: '軽食・デリ',
    tapas: 'タパス・小皿',
    tapa: 'タパス・小皿',
    タパス: 'タパス・小皿',
    つまみ: 'タパス・小皿',
    other: 'その他',
};

/** カテゴリー名がコース欄に入っている場合の既定マッピング */
const CATEGORY_TO_COURSE_HINT = {
    ソース: '仕込み',
    ドレッシング: '仕込み',
    'ソース・ドレッシング': '仕込み',
    '付け合わせ・飾り': '仕込み',
    'デザート・お菓子': 'デザート',
    パン: '食パン',
    スープ: 'スープ',
    温菜: '温菜',
    取り込み: 'その他',
};

const normalizeTags = (rawTags) => {
    if (Array.isArray(rawTags)) {
        return rawTags
            .flatMap((tag) => String(tag || '').split(/[,、]/))
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    if (typeof rawTags === 'string') {
        return rawTags.split(/[,、]/).map((tag) => tag.trim()).filter(Boolean);
    }
    return [];
};

export const courseHintFromCategory = (category) => {
    const trimmed = String(category ?? '').replace(/\s+/g, ' ').trim();
    return CATEGORY_TO_COURSE_HINT[trimmed] || null;
};

/**
 * 旧コース・カテゴリー混同・タグから正規コースへ
 */
export const normalizeRecipeCourse = (rawCourse, recipe = null) => {
    const category = String(recipe?.category ?? '').replace(/\s+/g, ' ').trim();
    const tags = normalizeTags(recipe?.tags);
    const trimmed = String(rawCourse ?? '').replace(/\s+/g, ' ').trim();

    if (trimmed && RECIPE_COURSE_OPTIONS.includes(trimmed)) return trimmed;

    const alias = EXACT_ALIAS_MAP[normalizeKey(trimmed)];
    if (alias) return alias;

    const lower = trimmed.toLowerCase();

    if (/アミューズ|amuse|hors.d.oeuvre/i.test(lower)) return 'アミューズ';
    if (/前菜|starter|オードブル/i.test(lower)) return '前菜';
    if (/温菜|温製|entrée|entree|温かい前菜/i.test(lower)) return '温菜';
    if (/スープ|soup|ポタージュ|potage|ビスク|bisque|コンソメ|consomme|ブイヨン/i.test(lower)) return 'スープ';
    if (/魚|fish|シーフード|seafood|サーモン|鮪|マグロ|鱸|鯛/i.test(lower)) return '魚料理';
    if (/肉|meat|ビーフ|beef|ポーク|pork|ラム|lamb|鴨|duck|フォアグラ/i.test(lower)) return '肉料理';
    if (/プティフール|petit/i.test(lower)) return 'プティフール';
    if (/デザート|dessert|お菓子|スイーツ/i.test(lower)) return 'デザート';
    if (/食パン|パン|bread|ブレッド/i.test(lower) && !/デザート|dessert/i.test(lower)) return '食パン';
    if (/仕込み|下準備|単品|prep/i.test(lower)) return '仕込み';
    if (/ランチデリ|デリ|deli|サンド/i.test(lower)) return '軽食・デリ';
    if (/タパス|tapas|つまみ|小皿/i.test(lower)) return 'タパス・小皿';

    // コース欄にカテゴリー名が入っている誤り
    if (trimmed && CATEGORY_TO_COURSE_HINT[trimmed]) return CATEGORY_TO_COURSE_HINT[trimmed];

    const fromCategory = courseHintFromCategory(category);
    if (fromCategory) return fromCategory;

    if (tags.some((tag) => /プティフール|petit/i.test(tag))) return 'プティフール';
    if (tags.some((tag) => /温菜|温製/i.test(tag))) return '温菜';
    if (tags.some((tag) => /タパス|tapas/i.test(tag))) return 'タパス・小皿';
    if (tags.some((tag) => /ランチデリ|デリ/i.test(tag))) return '軽食・デリ';

    if (!trimmed) return fromCategory || '';

    return 'その他';
};

export const splitRecipesByCourse = (recipes) => {
    const keys = [...RECIPE_LIST_COURSE_ORDER, '未分類'];
    const buckets = Object.fromEntries(keys.map((key) => [key, []]));

    for (const recipe of recipes || []) {
        const key = normalizeRecipeCourse(recipe?.course, recipe) || '未分類';
        if (buckets[key]) {
            buckets[key].push(recipe);
        } else {
            buckets['未分類'].push(recipe);
        }
    }

    return buckets;
};

export const normalizeCourseSuggestions = (values) => {
    const seen = new Set();
    const merged = [];
    for (const raw of values || []) {
        const canonical = normalizeRecipeCourse(raw);
        if (!canonical) continue;
        const key = canonical.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(canonical);
    }
    return [...merged].sort((a, b) => a.localeCompare(b, 'ja'));
};
