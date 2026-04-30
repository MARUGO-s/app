// Normalize numeric inputs for Japanese IME / copy-paste:
// - Convert full-width digits/letters to half-width
// - Convert full-width punctuation to ASCII
// - Lowercase any letters (e.g. "E" -> "e")
// - Strip spaces and thousands separators
export const normalizeNumericInput = (value) => {
    if (value === null || value === undefined) return '';

    let s = String(value);

    // Full-width digits -> ASCII digits
    s = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

    // Full-width latin letters -> ASCII letters
    s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

    // Normalize punctuation commonly seen in numeric inputs.
    s = s
        .replace(/[‐‑‒–—−ー－]/g, '-') // dash variants
        .replace(/[＋]/g, '+')
        .replace(/[．。・]/g, '.')
        .replace(/[，]/g, ',')
        .replace(/[ \t\r\n\u00A0\u3000]/g, ''); // spaces (incl. full-width)

    // Lowercase (for scientific notation etc.)
    s = s.toLowerCase();

    // Remove thousands separators
    s = s.replace(/,/g, '');

    return s;
};

