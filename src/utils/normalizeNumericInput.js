/** 数値入力用: 全角数字・記号を半角に揃える */

const FW_DIGIT_OFFSET = 0xFEE0; // ０ (0xFF10) → 0 (0x30)

const NUMERIC_FIELD_NAMES = new Set([
  'quantity',
  'purchaseCost',
  'cost',
  'purchase_cost',
  'packetSize',
  'packet_size',
  'lastPrice',
  'last_price',
  'yieldPercent',
  'yield_percent',
  'content_amount',
]);

/**
 * 文字列中の全角数字・小数点・マイナスを半角に変換（カンマは除去）
 * @param {unknown} value
 * @returns {string}
 */
export const toHalfWidthNumericString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - FW_DIGIT_OFFSET))
    .replace(/[．。]/g, '.')
    .replace(/[－−—ー]/g, '-')
    .replace(/[，,]/g, '');
};

/** Input コンポーネント用の別名 */
export const normalizeNumericInput = toHalfWidthNumericString;

/**
 * フィールド名が数値系なら半角化、それ以外はそのまま
 */
export const normalizeNumericFieldValue = (field, value) => {
  if (!NUMERIC_FIELD_NAMES.has(field)) return value;
  return toHalfWidthNumericString(value);
};

/**
 * parseFloat の前処理付き（全角数字対応）
 */
export const parseNumericInput = (value) => {
  const s = toHalfWidthNumericString(value).trim();
  if (!s || s === '-' || s === '.') return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};
