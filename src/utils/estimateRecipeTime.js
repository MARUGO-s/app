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
                const kind = wait.test(sentence) ? 'wait' : work.test(sentence) ? 'work' : null;
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
            unknown.push({ step: index + 1, text: raw, reason: /同時|並行|間に|中に/.test(text) ? '同時進行を含むため時間配分の確認が必要' : '時間が未記載、または確認時刻のみの工程あり' });
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
