export function parseRecipeMinutes(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const text = String(value).trim();
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(?:分|minutes?|mins?)?$/i);
    if (match) return Math.round(Number(match[1]));
    const hours = text.match(/^(\d+(?:\.\d+)?)\s*時間(?:\s*(\d+)\s*分)?$/);
    return hours ? Math.round(Number(hours[1]) * 60 + Number(hours[2] || 0)) : null;
}
export function formatRecipeMinutes(value) {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${hours ? `${hours}時間` : ''}${minutes || !hours ? `${minutes}分` : ''}`;
}
export function getRecipeTimeLabel(recipe) {
    const prep = parseRecipeMinutes(recipe?.prepTime);
    const cook = parseRecipeMinutes(recipe?.cookTime);
    if (prep === null && cook === null) return '未設定';
    const parts = [];
    if (prep !== null) parts.push(`作業 ${formatRecipeMinutes(prep)}`);
    if (cook !== null) parts.push(`待ち・加熱 ${formatRecipeMinutes(cook)}`);
    if (prep === null || cook === null) return `${parts.join('／')}（合計は未設定）`;
    return `約${formatRecipeMinutes(prep + cook)}（${parts.join('／')}）`;
}
