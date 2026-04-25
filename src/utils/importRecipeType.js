const BREAD_KEYWORDS = ['ベーカーズ', 'baker', '生地', 'パン', '発酵', 'dough', 'fermentation'];
const FLOUR_KEYWORDS = ['flour', '強力粉', '薄力粉', '準強力粉', '中力粉', '全粒粉', 'ライ麦粉', 'フランス粉', 'デュラムセモリナ', '粉'];
const STRICT_FLOUR_KEYWORDS = ['flour', '強力粉', '薄力粉', '準強力粉', '中力粉', '全粒粉', 'ライ麦粉', 'フランス粉', 'デュラムセモリナ'];
const YEAST_KEYWORDS = ['yeast', 'イースト', '酵母', 'ルヴァン'];

const toStringSafe = (value) => String(value || '').trim();

const getIngredientName = (ingredient) => {
  if (typeof ingredient === 'string') return toStringSafe(ingredient);
  if (ingredient && typeof ingredient === 'object') return toStringSafe(ingredient.name);
  return '';
};

const hasKeyword = (text, keywords) => {
  const lowerText = toStringSafe(text).toLowerCase();
  return keywords.some((keyword) => lowerText.includes(String(keyword).toLowerCase()));
};

const splitBreadIngredients = (ingredients) => {
  const flours = [];
  const breadIngredients = [];

  ingredients.forEach((ingredient) => {
    const name = getIngredientName(ingredient).toLowerCase();
    const isFlour = STRICT_FLOUR_KEYWORDS.some((keyword) => name.includes(String(keyword).toLowerCase()));
    if (isFlour) {
      flours.push(ingredient);
    } else {
      breadIngredients.push(ingredient);
    }
  });

  // Fallback: If no flour bucket exists, treat the first "粉" item as flour.
  if (flours.length === 0 && ingredients.length > 0) {
    const first = ingredients[0];
    const firstName = getIngredientName(first);
    if (firstName.includes('粉')) {
      flours.push(first);
      const index = breadIngredients.indexOf(first);
      if (index >= 0) breadIngredients.splice(index, 1);
    }
  }

  return { flours, breadIngredients };
};

const detectBreadRecipe = (recipeData) => {
  const title = toStringSafe(recipeData?.title || recipeData?.name);
  const ingredients = Array.isArray(recipeData?.ingredients) ? recipeData.ingredients : [];

  const titleMatch = hasKeyword(title, BREAD_KEYWORDS);
  const hasYeast = ingredients.some((ingredient) => hasKeyword(getIngredientName(ingredient), YEAST_KEYWORDS));
  const hasFlour = ingredients.some((ingredient) => {
    const name = getIngredientName(ingredient);
    return hasKeyword(name, FLOUR_KEYWORDS) && !name.includes('粉糖');
  });
  const hasPercent = ingredients.some((ingredient) => {
    if (!ingredient || typeof ingredient !== 'object') return false;
    return String(ingredient.quantity || '').includes('%') || String(ingredient.unit || '').includes('%');
  });

  return hasPercent || hasYeast || (titleMatch && hasFlour);
};

const mergeBreadItemsToIngredients = (recipeData) => {
  const currentIngredients = Array.isArray(recipeData.ingredients) ? recipeData.ingredients : [];
  if (currentIngredients.length > 0) return currentIngredients;

  const flours = Array.isArray(recipeData.flours) ? recipeData.flours : [];
  const others = Array.isArray(recipeData.breadIngredients) ? recipeData.breadIngredients : [];
  if (flours.length === 0 && others.length === 0) return currentIngredients;
  return [...flours, ...others];
};

// mode:
// - "auto": existing heuristic behavior (for URL import etc.)
// - "normal": force normal recipe
// - "bread": force bread recipe
export const applyImportedRecipeType = (recipeData, mode = 'auto') => {
  const next = { ...(recipeData || {}) };
  const ingredients = mergeBreadItemsToIngredients(next);
  next.ingredients = ingredients;

  const shouldUseBread =
    mode === 'bread' ||
    (mode === 'auto' && detectBreadRecipe({ ...next, ingredients }));

  if (shouldUseBread) {
    const { flours, breadIngredients } = splitBreadIngredients(ingredients);
    next.type = 'bread';
    next.flours = flours;
    next.breadIngredients = breadIngredients;
  } else {
    next.type = 'normal';
    next.flours = [];
    next.breadIngredients = [];
  }

  return next;
};

