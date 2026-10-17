// Only weight/volume tokens are scalable. Time, heat, dimensions, counts and
// percentages are deliberately outside this grammar. Always use the saved text.
const QUANTITY = /(?<![\d.０-９])([0-9０-９]+(?:[.．][0-9０-９]+)?)(?:([〜～~–-])([0-9０-９]+(?:[.．][0-9０-９]+)?))?(\s*)(kg|mg|ml|cl|cc|g|l|Ｋｇ|ｋｇ|ｍｇ|ｍｌ|ｃｃ|ｇ|Ｌ|ℓ|グラム|キログラム|ミリリットル|リットル)(?![a-zA-Z])/giu;
const toNumber = value => Number(value.replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xff10)).replace('．', '.'));
const auxiliaryWater = /蒸気|スチーム|湯煎|湯せん|天板|加湿|steam|water bath/i;

export function scaleInstructionQuantities(text, multiplier) {
    if (typeof text !== 'string' || !Number.isFinite(multiplier) || multiplier <= 0 || Math.abs(multiplier - 1) < 1e-7) return text;
    return text.replace(QUANTITY, (token, number, separator, end, space, unit, offset) => {
        // Keep equipment water unchanged; use local context so a preceding
        // sentence about steam does not suppress dough quantities afterwards.
        const prefix = text.slice(0, offset).split(/[。！？!?\n；;]/).at(-1);
        if (auxiliaryWater.test(prefix)) return token;
        const value = toNumber(number) * multiplier;
        if (!Number.isFinite(value)) return token;
        const format = n => String(Math.round((n + Number.EPSILON) * 10) / 10);
        return `${format(value)}${separator ? separator + format(toNumber(end) * multiplier) : ''}${space}${unit}`;
    });
}

const canonicalUnit = unit => {
    const normalized = String(unit || '').normalize('NFKC').toLowerCase();
    return ({ グラム: 'g', キログラム: 'kg', ミリリットル: 'ml', リットル: 'l', cc: 'ml', 'ℓ': 'l' })[normalized] || normalized;
};
const amountInBaseUnit = (amount, unit) => {
    const key = canonicalUnit(unit);
    const factor = ({ g: 1, kg: 1000, mg: 0.001, ml: 1, cl: 10, l: 1000 })[key];
    return factor ? { value: amount * factor, kind: ['g', 'kg', 'mg'].includes(key) ? 'weight' : 'volume' } : null;
};

// A check is only claimed for explicit ingredient totals or explicit splits.
// Repeated mentions and partial additions must never be summed as a recipe total.
export function verifyInstructionQuantities(texts, ingredients, multiplier) {
    const issues = [];
    let checked = 0;
    let unverified = 0;
    const rows = ingredients.filter(row => row && typeof row === 'object');
    for (const text of texts) {
        if (typeof text !== 'string') continue;
        for (const sentence of text.split(/[。！？!?\n]/)) {
            const tokens = [...sentence.matchAll(QUANTITY)];
            if (!tokens.length || auxiliaryWater.test(sentence)) continue;
            const split = sentence.match(/([\d.]+)\s*gを([\d.]+)\s*gと([\d.]+)\s*gに分け/);
            if (split) {
                checked++;
                if (Math.abs(Number(split[1]) - Number(split[2]) - Number(split[3])) > 0.11) {
                    issues.push(`分割量が一致しません: ${split[1]}g ≠ ${split[2]}g + ${split[3]}g`);
                }
            }
            for (const token of tokens) {
                const [raw, number, separator, , , unit] = token;
                const prefix = sentence.slice(0, token.index);
                const matches = rows.filter(row => row.name && prefix.endsWith(String(row.name)));
                const row = matches.sort((a, b) => b.name.length - a.name.length)[0];
                // "remaining water" or per-piece weights are not ingredient totals.
                if (!row || separator || /残り|一部|各生地|ずつ|あたり/.test(prefix)) { unverified++; continue; }
                const expected = amountInBaseUnit(Number(row.quantity) * multiplier, row.unit || 'g');
                const actual = amountInBaseUnit(toNumber(number), unit);
                if (!expected || !actual || expected.kind !== actual.kind) { unverified++; continue; }
                checked++;
                const tolerance = amountInBaseUnit(0.11, unit).value;
                if (Math.abs(expected.value - actual.value) > tolerance) {
                    issues.push(`${row.name}: 作り方 ${raw} と材料表 ${Math.round(Number(row.quantity) * multiplier * 10) / 10}${row.unit || 'g'} が一致しません（分割使用の場合は要確認）`);
                }
            }
        }
    }
    return { checked, unverified, issues };
}
