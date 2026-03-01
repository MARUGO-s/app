const SOURCE_LOADERS = import.meta.glob(
    [
        '../App.jsx',
        '../constants.js',
        '../components/**/*.{js,jsx,ts,tsx,css}',
        '../services/**/*.{js,jsx,ts,tsx,css}',
        '../contexts/**/*.{js,jsx,ts,tsx,css}',
    ],
    {
        query: '?raw',
        import: 'default',
    }
);

const STOP_WORDS = new Set([
    'です',
    'ます',
    'する',
    'したい',
    'して',
    'してほしい',
    '方法',
    '教えて',
    'ください',
    'どう',
    'どこ',
    'なぜ',
    '何',
    'この',
    'その',
    '画面',
    '機能',
    '操作',
    'レシピ',
    '表示',
    'について',
    'and',
    'the',
    'for',
    'how',
    'what',
    'why',
    'please',
]);

let sourceFilesPromise = null;

const normalizeLoose = (value) => (
    String(value || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}]+/gu, '')
);

const toSourcePath = (modulePath) => (
    String(modulePath || '').replace(/^\.\.\//, 'src/')
);

const safeTokenize = (value) => {
    const text = String(value || '').toLowerCase().normalize('NFKC');
    const unicodeMatch = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-z0-9_]{2,}/gu);
    if (unicodeMatch && unicodeMatch.length > 0) {
        return unicodeMatch;
    }
    const asciiMatch = text.match(/[a-z0-9_]{2,}/g);
    return asciiMatch || [];
};

const buildSearchTerms = (question) => {
    const rawTerms = safeTokenize(question)
        .map((term) => term.trim())
        .filter(Boolean)
        .filter((term) => !STOP_WORDS.has(term))
        .slice(0, 14);

    const normalizedUnique = new Map();
    rawTerms.forEach((term) => {
        const normalized = normalizeLoose(term);
        if (!normalized || normalized.length < 2) return;
        if (!normalizedUnique.has(normalized)) {
            normalizedUnique.set(normalized, {
                raw: term,
                normalized,
            });
        }
    });

    return Array.from(normalizedUnique.values());
};

const loadSourceFiles = async () => {
    const entries = await Promise.all(
        Object.entries(SOURCE_LOADERS).map(async ([modulePath, loader]) => {
            try {
                const content = await loader();
                const text = String(content || '');
                return {
                    path: toSourcePath(modulePath),
                    content: text,
                    lines: text.split(/\r?\n/),
                };
            } catch {
                return null;
            }
        })
    );

    return entries
        .filter(Boolean)
        .filter((entry) => entry.content.trim().length > 0)
        .sort((a, b) => a.path.localeCompare(b.path, 'ja'));
};

const getSourceFiles = async () => {
    if (!sourceFilesPromise) {
        sourceFilesPromise = loadSourceFiles();
    }
    return sourceFilesPromise;
};

const scoreLine = (line, terms) => {
    const normalizedLine = normalizeLoose(line);
    if (!normalizedLine) return null;

    let score = 0;
    const matchedTerms = [];
    for (const term of terms) {
        if (!term?.normalized) continue;
        if (!normalizedLine.includes(term.normalized)) continue;
        const weight = Math.min(8, 2 + Math.floor(term.normalized.length / 2));
        score += weight;
        matchedTerms.push(term.raw);
    }

    if (score <= 0) return null;
    return {
        score,
        matchedTerms: Array.from(new Set(matchedTerms)),
    };
};

const pickFocusedMatches = (matches, maxCount = 2, minGap = 12) => {
    const chosen = [];
    for (const candidate of matches) {
        const near = chosen.some((picked) => Math.abs(picked.lineNo - candidate.lineNo) < minGap);
        if (near) continue;
        chosen.push(candidate);
        if (chosen.length >= maxCount) break;
    }
    return chosen;
};

const toConfidence = (bestScore) => {
    if (bestScore >= 14) return 'high';
    if (bestScore >= 9) return 'medium';
    return 'low';
};

const toSnippetText = (snippet) => {
    const header = `${snippet.path}:${snippet.startLine}-${snippet.endLine}`;
    const body = snippet.lines.map((line) => `${line.no}: ${line.text}`).join('\n');
    return `${header}\n${body}`;
};

export const searchCodeEvidence = async ({
    question,
    limit = 5,
    maxFiles = 5,
}) => {
    const normalizedQuestion = String(question || '').trim();
    if (!normalizedQuestion) {
        return {
            confidence: 'low',
            bestScore: 0,
            references: [],
            snippets: [],
            promptText: '関連コードなし',
        };
    }

    const terms = buildSearchTerms(normalizedQuestion);
    if (terms.length === 0) {
        return {
            confidence: 'low',
            bestScore: 0,
            references: [],
            snippets: [],
            promptText: '関連コードなし',
        };
    }

    const files = await getSourceFiles();
    const ranked = [];

    for (const file of files) {
        const lineMatches = [];
        file.lines.forEach((line, index) => {
            const scored = scoreLine(line, terms);
            if (!scored) return;
            lineMatches.push({
                lineNo: index + 1,
                score: scored.score,
                matchedTerms: scored.matchedTerms,
            });
        });

        if (lineMatches.length === 0) continue;

        lineMatches.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.lineNo - b.lineNo;
        });

        const pathNorm = normalizeLoose(file.path);
        const pathBoost = terms.some((term) => pathNorm.includes(term.normalized)) ? 3 : 0;
        const topScore = lineMatches[0]?.score || 0;
        const secondScore = lineMatches[1]?.score || 0;
        const fileScore = topScore + Math.round(secondScore * 0.6) + pathBoost;

        ranked.push({
            ...file,
            matches: lineMatches,
            fileScore,
        });
    }

    ranked.sort((a, b) => {
        if (b.fileScore !== a.fileScore) return b.fileScore - a.fileScore;
        return a.path.localeCompare(b.path, 'ja');
    });

    const focusedFiles = ranked.slice(0, maxFiles);
    const snippets = [];

    focusedFiles.forEach((file) => {
        const focused = pickFocusedMatches(file.matches, 2, 12);
        focused.forEach((match) => {
            const startLine = Math.max(1, match.lineNo - 4);
            const endLine = Math.min(file.lines.length, match.lineNo + 4);
            const snippetLines = file.lines
                .slice(startLine - 1, endLine)
                .map((text, idx) => ({ no: startLine + idx, text }));
            snippets.push({
                path: file.path,
                focusLine: match.lineNo,
                startLine,
                endLine,
                score: match.score,
                matchedTerms: match.matchedTerms,
                lines: snippetLines,
            });
        });
    });

    snippets.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.path.localeCompare(b.path, 'ja');
    });

    const topSnippets = snippets.slice(0, limit);
    const bestScore = topSnippets[0]?.score || 0;
    const confidence = toConfidence(bestScore);
    const references = topSnippets.map((snippet) => `${snippet.path}:${snippet.focusLine}`);
    const promptTextRaw = topSnippets.map(toSnippetText).join('\n\n');
    const promptText = promptTextRaw.length > 9000
        ? `${promptTextRaw.slice(0, 9000)}\n...（省略）`
        : promptTextRaw;

    return {
        confidence,
        bestScore,
        references,
        snippets: topSnippets,
        promptText: promptText || '関連コードなし',
    };
};

