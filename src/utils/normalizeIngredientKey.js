// Shared normalization for ingredient/material names.
// Goal: treat minor variations (case, whitespace, full-width/half-width) as the same key.
export const normalizeIngredientKey = (value) => {
  const raw = (value ?? '').toString();
  const nfkc = typeof raw.normalize === 'function' ? raw.normalize('NFKC') : raw;

  return nfkc
    .trim()
    // Remove all whitespace (including Japanese full-width space) to reduce duplicates.
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
};

