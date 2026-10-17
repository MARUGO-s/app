import { formatRecipeMinutes } from './recipeTime.js';

const work = /計量|量る|混ぜ|混合|捏ね|こね|成形|分割|切る|刻む|泡立|練る|折りたた|折り混ぜ/;
const wait = /発酵|休ませ|寝かせ|焼[くき成]|煮[る込]|蒸[すし気]|茹で|ゆで|冷[まや却]|予熱|漬け/;
const duration = /(\d+(?:\.\d+)?)(?:\s*[〜～~–-]\s*(\d+(?:\.\d+)?))?\s*(時間|分|秒|日)(?:\s*(半|\d+\s*分))?/g;

export function estimateRecipeTime(steps = []) {
    const entries = [];
    const unknown = [];
    for (const [index, step] of steps.entries()) {
        const raw = typeof step === 'string' ? step : step?.text;
        if (!raw?.trim()) continue;
        const text = raw.normalize('NFKC').replace(/<[^>]*>/g, '')
            .replace(/(\d+(?:\.\d+)?)\s*(時間|分|秒|日)\s*([〜～~–-])\s*(\d+(?:\.\d+)?)\s*\2(?!\s*\d+\s*分)/g, '$1$3$4$2');
        let hasDuration = false;
        let missingWork = false;
        let missingWait = false;
        for (const sentence of text.split(/[。！？!?\n]/).filter(Boolean)) {
            const tokens = [...sentence.matchAll(duration)];
            let workFound = false;
            let waitFound = false;
            for (const token of tokens) {
                const after = sentence.slice(token.index + token[0].length);
                const before = sentence.slice(0, token.index);
                // Elapsed checkpoints and repeated checks are not additional durations.
                if (/^\s*(後|ごと|毎|おき|以内)/.test(after) || /(?:開始|焼成開始|発酵開始)から/.test(before) && /確認/.test(after)) continue;
                if (/^\s*[〜～~–-]/.test(after) || /[〜～~–-]\s*$/.test(before) || /^\s*(?:で(?:状態を)?確認|を[^。]*確認点)/.test(after) || /片面|ずつ|繰り返/.test(sentence)) {
                    missingWait = true;
                    continue;
                }
                if (/(同時|並行|間に|中に)/.test(sentence)) {
                    missingWait = true;
                    continue;
                }
                const kind = wait.test(sentence) ? 'wait' : work.test(sentence) ? 'work' : wait.test(text) ? 'wait' : work.test(text) ? 'work' : null;
                if (!kind) continue;
                const factor = ({ 時間: 60, 分: 1, 秒: 1 / 60, 日: 1440 })[token[3]];
                const extra = token[4] === '半' ? factor / 2 : token[4] ? Number.parseInt(token[4], 10) : 0;
                let min = Number(token[1]) * factor + extra;
                let max = Number(token[2] ?? token[1]) * factor + extra;
                if (max < min) [min, max] = [max, min];
                entries.push({ step: index + 1, kind, min, max, evidence: sentence.trim(), token: token[0] });
                hasDuration = true;
                if (kind === 'work') workFound = true;
                else waitFound = true;
            }
            if (work.test(sentence) && !workFound) missingWork = true;
            if (wait.test(sentence) && !waitFound) missingWait = true;
        }
        if (!hasDuration || missingWork || missingWait) {
            unknown.push({ step: index + 1, text: raw, missingWork, missingWait, reason: /同時|並行|間に|中に/.test(text) ? '同時進行を含むため時間配分の確認が必要' : '時間が未記載、または確認時刻のみの工程あり' });
        }
    }
    const total = entries.reduce((sum, item) => ({ min: sum.min + item.min, max: sum.max + item.max }), { min: 0, max: 0 });
    return { entries, unknown, min: total.min, max: total.max, complete: entries.length > 0 && unknown.length === 0 };
}

export function formatEstimatedRecipeTime(result) {
    if (!result.entries.length) return '自動算出できる時間なし（作り方に所要時間を記載してください）';
    const min = Math.ceil(result.min);
    const max = Math.ceil(result.max);
    const range = min === max ? formatRecipeMinutes(min) : `${formatRecipeMinutes(min)}〜${formatRecipeMinutes(max)}`;
    return result.complete ? `自動計算の目安: ${range}` : `記載時間の小計: ${range}＋時間未確定の工程${result.unknown.length}件`;
}


// Editorial defaults for an approximate schedule, never measured recipe data.
// Explicit times always win. Parallel/ambiguous operations remain unresolved.
export function recommendRecipeTime(steps = [], { bread = false } = {}) {
    const parsed = estimateRecipeTime(steps);
    const entries = [...parsed.entries];
    const unresolved = [];
    const add = (step, kind, min, max, label) => entries.push({ step, kind, min, max, estimated: true, token: `${min}〜${max}分`, evidence: label });
    for (const item of parsed.unknown) {
        const text = item.text.normalize('NFKC');
        if (/同時|並行|間に|中に|片面|ずつ焼|繰り返/.test(text)) {
            unresolved.push(item);
            continue;
        }
        const recorded = parsed.entries.filter(entry => entry.step === item.step);
        if (item.missingWork && !recorded.some(entry => entry.kind === 'work')) {
            const profile = /成形/.test(text) ? [8, 15] : /捏ね|こね|混ぜ|混合|練る/.test(text) ? [5, 15] : [3, 8];
            add(item.step, 'work', ...profile, '作業内容からの仮の目安');
        }
        if (item.missingWait) {
            if (bread && /発酵/.test(text) && !recorded.some(entry => entry.kind === 'wait')) {
                const profile = /最終|二次|ホイロ/.test(text) ? [35, 60] : [90, 150];
                add(item.step, 'wait', ...profile, '発酵時間の仮の目安（生地の状態で調整）');
            } else if (/焼成|焼く|焼き続/.test(text) && !recorded.some(entry => entry.kind === 'wait')) {
                if (bread) add(item.step, 'wait', 20, 30, '焼成時間の仮の目安（機器・大きさで調整）');
                else unresolved.push(item);
            } else if (!recorded.some(entry => entry.kind === 'wait') && !/冷ま|冷却/.test(text)) {
                unresolved.push(item);
            }
            if (bread && /冷ま|冷却/.test(text) && !recorded.some(entry => /冷ま|冷却/.test(entry.evidence))) {
                add(item.step, 'wait', 30, 60, '冷却時間の仮の目安');
            }
        }
        if (!item.missingWork && !item.missingWait && !recorded.length) unresolved.push(item);
    }
    const sum = kind => entries.filter(entry => !kind || entry.kind === kind).reduce((total, entry) => ({ min: total.min + entry.min, max: total.max + entry.max }), { min: 0, max: 0 });
    return { ...parsed, entries, unknown: unresolved, ...sum(), work: sum('work'), wait: sum('wait'), estimated: entries.some(entry => entry.estimated), complete: entries.length > 0 && !unresolved.length };
}

export function formatRecommendedRecipeTime(result) {
    if (!result.entries.length) return '作り方を入力すると自動計算します';
    const range = value => value.min === value.max ? formatRecipeMinutes(Math.ceil(value.min)) : `${formatRecipeMinutes(Math.ceil(value.min))}〜${formatRecipeMinutes(Math.ceil(value.max))}`;
    return `${result.unknown.length ? '算出分 ' : '約'}${range(result)}${result.estimated ? '（推定を含む）' : ''}${result.unknown.length ? '・要確認あり' : ''}`;
}
