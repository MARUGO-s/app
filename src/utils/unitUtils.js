/**
 * 単位の正規化・換算の共通定義（原価計算の一貫性のため）
 *
 * 重量: g, kg (1 kg = 1000 g)
 * 体積: ml, cc (= ml), l (1 l = 1000 ml), cl (1 cl = 10 ml, 海外表記)
 */

const FULLWIDTH = { g: 'ｇ', ml: 'ｍｌ', cc: 'ｃｃ', kg: 'ｋｇ', l: 'ｌ', cl: 'ｃｌ' };

/** 正規化された単位名（小文字）。重量・体積は「1000あたり単価」で原価計算する */
export const WEIGHT_UNITS = ['g', 'kg'];
export const VOLUME_ML_UNITS = ['ml', 'cc', 'l', 'cl'];

/** 原価が「円/1000g」または「円/1000ml」で扱う単位（g, ml, cc, cl は qty/1000 で単価掛け。kg/l はパック単価をそのまま別扱い） */
export const PER_1000_QUANTITY_UNITS = ['g', 'ml', 'cc', 'cl'];
export const PER_1000_QUANTITY_UNITS_AND_FULLWIDTH = [
    'g', 'ｇ', 'ml', 'ｍｌ', 'cc', 'ｃｃ', 'cl', 'ｃｌ'
];

/** パック単位が「円/1kg」または「円/1L」になる単位（pack 単価 ÷ size がそのまま単価） */
export const PER_ONE_PACK_UNITS = ['kg', 'l'];
export const PER_ONE_PACK_UNITS_AND_FULLWIDTH = ['kg', 'ｋｇ', 'l', 'ｌ'];

/** マスタの「測定可能」単位（不足計算で集計に使う） */
export const MEASURABLE_UNITS = ['g', 'kg', 'ml', 'cc', 'l', 'cl'];

/**
 * 単位文字列を正規化（小文字・全角→半角）
 * @param {string} u
 * @returns {string}
 */
export function normalizeUnit(u) {
    const s = String(u ?? '').trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    if (lower === 'ｇ') return 'g';
    if (lower === 'ｍｌ') return 'ml';
    if (lower === 'ｃｃ') return 'cc';
    if (lower === 'ｋｇ') return 'kg';
    if (lower === 'ｌ') return 'l';
    if (lower === 'ｃｌ') return 'cl';
    return lower;
}

/**
 * 原価計算で「数量あたり単価」を使うか（true = 円/1000単位で (qty/1000)*単価 を使う）
 * @param {string} unit
 * @returns {boolean}
 */
export function isPer1000Unit(unit) {
    const u = normalizeUnit(unit);
    return PER_1000_QUANTITY_UNITS.includes(u);
}

/**
 * 体積単位 cl を ml に換算した数量（1 cl = 10 ml）
 * @param {number} qtyCl
 * @returns {number} qtyMl
 */
export function clToMl(qtyCl) {
    return Number(qtyCl) * 10;
}

/**
 * パック単位から「円/1000ml」または「円/1000g」の単価を算出
 * @param {number} basePrice パック価格
 * @param {number} packetSize パックサイズ（packetUnit の単位）
 * @param {string} packetUnit 正規化済み推奨（g, kg, ml, cc, l, cl）
 * @returns {number} 円/1000単位（kg または L）
 */
export function normalizedCostPer1000(basePrice, packetSize, packetUnit) {
    const pu = normalizeUnit(packetUnit);
    if (!Number.isFinite(basePrice) || !Number.isFinite(packetSize) || packetSize <= 0) return NaN;
    if (['g', 'ml', 'cc'].includes(pu)) return (basePrice / packetSize) * 1000;
    if (['kg', 'l'].includes(pu)) return basePrice / packetSize;
    if (pu === 'cl') return (basePrice / packetSize) * 100;
    return basePrice / packetSize;
}

/**
 * レシピ数量×単位から原価を計算（pCost は円/1000単位を想定）
 * @param {number} qty レシピの数量
 * @param {number} pCost 円/1000g または 円/1000ml
 * @param {string} unit レシピの単位
 * @param {{ yieldRate?: number }} opts
 * @returns {number}
 */
export function costFromQuantityAndUnit(qty, pCost, unit, opts = {}) {
    const u = normalizeUnit(unit);
    const yieldRate = (opts.yieldRate != null && opts.yieldRate > 0) ? opts.yieldRate : 1;
    if (!Number.isFinite(qty) || !Number.isFinite(pCost)) return NaN;
    let base = 0;
    if (PER_1000_QUANTITY_UNITS.includes(u)) {
        if (u === 'cl') base = (qty * 10 / 1000) * pCost;
        else base = (qty / 1000) * pCost;
    } else {
        base = qty * pCost;
    }
    return base / yieldRate;
}
