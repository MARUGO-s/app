/** レシピ「カテゴリー」案A（固定リスト） */
export const RECIPE_CATEGORY_OPTIONS = [
    '料理',
    '煮込み料理',
    '温菜',
    '冷菜',
    'スープ',
    'テリーヌ',
    'ソース',
    'ドレッシング',
    'ソース・ドレッシング',
    '付け合わせ・飾り',
    'デザート・お菓子',
    'パン',
    '取り込み',
    'その他',
];

export const RECIPE_LIST_SECTION_ICONS = {
    料理: '🍽️',
    煮込み料理: '🍲',
    温菜: '♨️',
    冷菜: '🧊',
    スープ: '🥣',
    テリーヌ: '🥩',
    ソース: '🥣',
    ドレッシング: '🥗',
    'ソース・ドレッシング': '🫙',
    '付け合わせ・飾り': '✨',
    'デザート・お菓子': '🍰',
    パン: '🍞',
    取り込み: '🔗',
    その他: '📁',
};

const normalizeKey = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const EXACT_ALIAS_MAP = {
    'url取り込み': '取り込み',
    'pdf取り込み': '取り込み',
    'url import': '取り込み',
    'pdf import': '取り込み',
    '飾り': '付け合わせ・飾り',
    '付け合わせ': '付け合わせ・飾り',
    'ガーニッシュ': '付け合わせ・飾り',
    'garnish': '付け合わせ・飾り',
    'デコ': '付け合わせ・飾り',
    'お菓子': 'デザート・お菓子',
    'デザート': 'デザート・お菓子',
    'dessert': 'デザート・お菓子',
    'スイーツ': 'デザート・お菓子',
    '製菓': 'デザート・お菓子',
    'bread': 'パン',
    'パン・ブレッド': 'パン',
    terrine: 'テリーヌ',
    テリーヌ: 'テリーヌ',
    パテ: 'テリーヌ',
    soup: 'スープ',
    スープ: 'スープ',
    汁: 'スープ',
    ポタージュ: 'スープ',
    ビスク: 'スープ',
    コンソメ: 'スープ',
    ブイヨン: 'スープ',
    dressing: 'ドレッシング',
    ドレッシング: 'ドレッシング',
    vinaigrette: 'ドレッシング',
    ヴィネグレット: 'ドレッシング',
    マヨネーズ: 'ドレッシング',
    煮込み: '煮込み料理',
    煮込み料理: '煮込み料理',
    stew: '煮込み料理',
    braise: '煮込み料理',
    温菜: '温菜',
    温製: '温菜',
    冷菜: '冷菜',
    冷製: '冷菜',
    冷皿: '冷菜',
};

const normalizeTags = (rawTags) => {
    if (Array.isArray(rawTags)) {
        return rawTags
            .flatMap((tag) => String(tag || '').split(/[,、]/))
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    if (typeof rawTags === 'string') {
        return rawTags
            .split(/[,、]/)
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    return [];
};

/**
 * 旧カテゴリー・タグ・種別から案Aの正規カテゴリーへ
 */
export const normalizeRecipeCategory = (rawCategory, recipe = null) => {
    if (recipe?.type === 'bread') return 'パン';

    const tags = normalizeTags(recipe?.tags);
    if (tags.some((tag) => /^(パン|bread)$/i.test(tag))) return 'パン';
    if (tags.some((tag) => /テリーヌ|terrine|パテ/i.test(tag)) && !tags.some((tag) => /デザート|dessert|お菓子/i.test(tag))) {
        return 'テリーヌ';
    }
    if (tags.some((tag) => /^スープ$|^soup$/i.test(tag) || /スープ|ポタージュ|ビスク|コンソメ/i.test(tag))) {
        return 'スープ';
    }
    if (tags.some((tag) => /^ドレッシング$|^dressing$/i.test(tag) || /ドレッシング|ヴィネグレット|vinaigrette/i.test(tag))) {
        if (!tags.some((tag) => /ソース|sauce/i.test(tag))) return 'ドレッシング';
    }

    const trimmed = String(rawCategory ?? '').replace(/\s+/g, ' ').trim();
    if (!trimmed) {
        if (recipe?.sourceUrl) return '取り込み';
        if (tags.some((tag) => /url取り込み|pdf取り込み/i.test(tag))) return '取り込み';
        return '料理';
    }

    if (RECIPE_CATEGORY_OPTIONS.includes(trimmed)) return trimmed;

    const alias = EXACT_ALIAS_MAP[normalizeKey(trimmed)];
    if (alias) return alias;

    const lower = trimmed.toLowerCase();

    if (/煮込み|煮込|ストゥ|stew|braise|ラグー|ragout|ポトフ|pot-au-feu|カレー|curry/i.test(lower)) {
        return '煮込み料理';
    }
    if (/温菜|温製|温かい|温め/i.test(lower)) return '温菜';
    if (/冷菜|冷製|冷たい|冷やし|冷皿|サラダ(?!ドレ)/i.test(lower)) return '冷菜';
    if (/スープ|soup|ポタージュ|potage|ビスク|bisque|コンソメ|consommé|consomme|ブイヨン|bouillon|汁物/.test(lower)) {
        return 'スープ';
    }
    if (/ソース・ドレッシング|ソース＆ドレッシング|ソース&ドレッシング/.test(trimmed)) {
        return 'ソース・ドレッシング';
    }
    if (/ドレッシング|dressing|ヴィネグレット|vinaigrette|マヨネーズ|mayonnaise/.test(lower)) {
        if (/ソース|sauce/.test(lower)) return 'ソース・ドレッシング';
        return 'ドレッシング';
    }
    if (/ソース|sauce/.test(lower)) return 'ソース';
    if (/テリーヌ|terrine|パテ|コンフィ|リエット|ゼリー寄せ/i.test(lower)) return 'テリーヌ';
    if (/飾り|付け合わせ|ガーニッシュ|garnish|デコ/.test(lower)) return '付け合わせ・飾り';
    if (/デザート|お菓子|dessert|スイーツ|製菓|菓子/.test(lower)) return 'デザート・お菓子';
    if (/^パン|bread/.test(lower)) return 'パン';
    if (/url取り込み|pdf取り込み/.test(lower)) return '取り込み';

    return 'その他';
};

export const splitRecipesByCategory = (recipes) => {
    const buckets = Object.fromEntries(RECIPE_CATEGORY_OPTIONS.map((key) => [key, []]));

    for (const recipe of recipes || []) {
        const key = normalizeRecipeCategory(recipe?.category, recipe);
        buckets[key].push(recipe);
    }

    return buckets;
};
