// Setup type definitions for Deno environment
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
// Import Cheerio for reliable HTML parsing
import * as cheerio from "npm:cheerio@1.0.0-rc.12"

console.log("Scrape Recipe Function Initialized v6 (Universal)")

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const { url } = await req.json()

    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    console.log(`Fetching URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        // Mimic a real browser to avoid blocking
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8,fr;q=0.7',
      }
    });

    if (!response.ok) {
      const errorMsg = `Failed to fetch URL: ${response.status} ${response.statusText}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let recipeData: any = null;

    // ---------------------------------------------------------
    // Strategy 1: JSON-LD (Schema.org/Recipe)
    // ---------------------------------------------------------
    $('script[type="application/ld+json"]').each((_, el) => {
      if (recipeData) return;
      try {
        const jsonContent = $(el).html();
        if (!jsonContent) return;
        const data = JSON.parse(jsonContent);

        const findRecipe = (obj: any): any => {
          if (Array.isArray(obj)) return obj.find(item => findRecipe(item));
          if (obj && typeof obj === 'object') {
            const type = obj['@type'];
            if (type && (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe')))) {
              return obj;
            }
            if (obj['@graph']) return findRecipe(obj['@graph']);
          }
          return null;
        };
        recipeData = findRecipe(data);
      } catch (e) {
        console.warn("JSON-LD parse error", e);
      }
    });

    // ---------------------------------------------------------
    // Strategy 2: Universal HTML Parsing (Fallback)
    // ---------------------------------------------------------
    if (!recipeData) {
      console.log("No JSON-LD found. Executing Universal Fallback Strategy.");

      const getMeta = (name: string) => $(`meta[name="${name}"], meta[property="${name}"]`).attr('content');

      // --- A. Title ---
      // Priority: OG Title -> Wrapper H1/H2 -> H1 -> Title Tag
      let title = getMeta('og:title');
      if (!title) {
        // Try specific selectors for known sites or semantic structures
        title = $('h1[class*="title"], h1[class*="name"]').first().text().trim();
      }
      if (!title) title = $('h1').first().text().trim();
      if (!title) title = $('title').text().trim();

      // --- B. Description ---
      let description = getMeta('og:description') || getMeta('description') || '';

      // --- C. Image ---
      let image = getMeta('og:image');
      if (!image) {
        // Find the largest image ideally, but first image in article is a good heuristic
        const articleImg = $('article img, main img, .recipe-image img').first().attr('src');
        if (articleImg) {
          // Resolve relative URLs
          try {
            image = new URL(articleImg, url).href;
          } catch {
            image = articleImg;
          }
        }
      }

      // --- Keywords Definition (Multilingual) ---
      const INGREDIENT_KEYWORDS = [
        'ingredients', 'ingrédients', 'ingredientes', 'ingredienti', 'zutaten', // EU
        '材料', '用意するもの', '用意する物', '食材', // JP
        'shopping list', 'what you need', 'ce qu\'il vous faut'
      ];

      const STEP_KEYWORDS = [
        'instructions', 'method', 'preparation', 'préparation', 'preparazione', 'elaboración', 'zubereitung', 'anleitung', // EU
        'directions', 'steps', 'how to make', 'procedure',
        '作り方', '手順', '工程', '調理方法', 'レシピ' // JP
      ];

      // --- Helper: Find List by Headers (Enhanced for Groups) ---
      const findListByHeader = (keywords: string[]): { text: string, group?: string }[] => {
        const results: { text: string, group?: string }[] = [];

        // Find all headers (h1-h6, strong, div with class title)
        const headers = $('h1, h2, h3, h4, h5, h6, strong, b, .title, .header, p');

        let rootHeader: any = null;

        headers.each((_, el) => {
          if (rootHeader) return; // Only find first main header
          const text = $(el).text().toLowerCase().trim();
          const isMatch = keywords.some(k => text === k || (text.includes(k) && text.length < 30));
          if (isMatch) {
            rootHeader = $(el);
          }
        });

        if (rootHeader) {
          // Look for lists properly
          let nextEl = rootHeader.next();
          let currentGroup = '';
          let attempts = 0;
          // Look ahead more aggressively for multiple sections
          // e.g. Header -> List -> SubHeader -> List
          while (nextEl.length && attempts < 20) {

            // Check for Sub-headers (Simple heuristic: H3-H6 or Strong immediately causing a new section)
            // Only if we already have some items or it's clearly a subhead
            if (nextEl.is('h3, h4, h5, h6, strong, b, .group-name')) {
              const subHeadText = nextEl.text().trim();
              // Avoid empty or giant headers
              if (subHeadText && subHeadText.length < 50) {
                currentGroup = subHeadText.replace(/[:：]/g, '');
              }
            }

            // Check for UL/OL directly
            if (nextEl.is('ul, ol')) {
              nextEl.find('li').each((_, li) => {
                const t = $(li).text().trim();
                if (t) results.push({ text: t, group: currentGroup });
              });
            }
            // Check for nested lists
            else {
              const nestedList = nextEl.find('ul, ol');
              if (nestedList.length) {
                nestedList.each((_, list) => {
                  $(list).find('li').each((_, li) => {
                    const t = $(li).text().trim();
                    if (t) results.push({ text: t, group: currentGroup });
                  });
                });
              }
            }
            // Note: skipping div-based parsing for now to keep it safe, ensuring we don't grab garbage.

            nextEl = nextEl.next();
            attempts++;
          }
        }

        // Fallback: Check for specific class names if header search failure
        if (results.length === 0) {
          const keywordRoot = keywords[0]; // 'ingredients' or 'instructions'
          const selector = `[class*="${keywordRoot}"], [id*="${keywordRoot}"]`;
          $(selector).each((_, el) => {
            if (results.length > 0 && results.some(r => r.group !== 'Fallback')) return; // Stop if we found better/other results??

            // Try to find a previous header for this list?
            let groupName = 'Main';
            const prev = $(el).prev();
            if (prev.is('h3, h4, h5, h6')) groupName = prev.text().trim() || 'Main';

            if ($(el).is('ul, ol')) {
              $(el).find('li').each((_, li) => results.push({ text: $(li).text().trim(), group: groupName }));
            } else {
              $(el).find('li').each((_, li) => results.push({ text: $(li).text().trim(), group: groupName }));
            }
          });
        }

        return results;
      };

      // --- D. Ingredients Extraction ---
      let rawIngredients = findListByHeader(INGREDIENT_KEYWORDS);
      // Fallback for Marmiton/Specific sites if generic fails
      if (rawIngredients.length === 0) {
        $('.ingredient, .ingredients, .recipe-ingredients, .m-ingredient').each((_, el) => {
          const txt = $(el).text().trim();
          if (txt && txt.length > 2) rawIngredients.push({ text: txt });
        });
      }

      // --- E. Steps Extraction (Keep simple string[] for now or update if needed) ---
      // For steps, we often don't need strict grouping as much as ingredients, but we can reuse logic
      let rawSteps = findListByHeader(STEP_KEYWORDS);
      let steps: string[] = [];
      if (rawSteps.length > 0) {
        steps = rawSteps.map(s => {
          // Combine group if present? e.g. "Sauce: Step 1"
          if (s.group && s.group !== 'Main') return `【${s.group}】 ${s.text}`;
          return s.text;
        });
      } else {
        // Fallback
        $('.instruction, .instructions, .recipe-instructions, .step, .preparation').each((_, el) => {
          const txt = $(el).text().trim();
          if (txt && txt.length > 5) steps.push(txt);
        });
      }

      if (title) {
        recipeData = {
          name: title,
          description,
          image,
          recipeIngredient: rawIngredients, // Now Array<{text, group?}>
          recipeInstructions: steps
        };
      }
    }

    if (!recipeData) {
      throw new Error('Could not parse recipe data (No Schema found, and structure too ambiguous).');
    }

    // ---------------------------------------------------------
    // Universal Ingredient Parser (Regex)
    // ---------------------------------------------------------
    const parseIngredient = (text: string) => {
      text = text.trim().replace(/\s+/g, ' '); // Clean excessive whitespace

      // A. Specific Format: "Name: Quantity" (Japanese/Casual)
      if (text.includes('：') || text.includes(':')) {
        const parts = text.split(/[：:]/);
        const name = parts[0].trim();
        const quantity = parts.slice(1).join(' ').trim();
        if (quantity.length < 20) { // Safety check to ensure it's not a description
          return { name, quantity, unit: '' };
        }
      }

      // B. Regex Patterns
      // Supports Unicode Fractions: ½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅛ ⅜ ⅝ ⅞
      const numberPattern = `[\\d\\s\\.,/\\u00BC-\\u00BE\\u2150-\\u215E]+`;

      // Multilingual Common Units
      const units = [
        // English
        'g', 'kg', 'mg', 'oz', 'lb', 'lbs', 'tsp', 'tbsp', 'cup', 'cups', 'ml', 'cl', 'l', 'liter', 'quart', 'pint', 'box', 'bag', 'slice', 'slices', 'piece', 'pieces', 'clove', 'cloves', 'pinch', 'dash', 'can', 'jar', 'package',
        // French
        'g', 'gr', 'kgs', 'c.à.s', 'c.à.c', 'cuillère', 'cuillères', 'verre', 'verres', 'tranche', 'tranches', 'pincée', 'brin', 'feuille', 'feuilles', 'gousse', 'gousses',
        // Spanish/Italian
        'cucharada', 'cucharadita', 'taza', 'vaso', 'hoja', 'spicchi', 'bicchiere', 'fetta',
        // Japanese (often unused in this regex flow but good for reference)
        '個', '本', '束', '枚', '杯', 'g', 'ml', 'cc', 'カップ'
      ].join('|').replace(/\./g, '\\.'); // Escape dots

      // Pattern 1: Quantity Starts (Western) "200g Beef" / "1/2 cup Sugar"
      // ^ (Number) (Optional Unit) (Rest)
      const westernRegex = new RegExp(`^(${numberPattern})\\s*(${units})?\\s+(.*)$`, 'i');
      const westernMatch = text.match(westernRegex);

      if (westernMatch) {
        const rawNum = westernMatch[1].trim();
        const rawUnit = (westernMatch[2] || '').trim();
        const rawName = westernMatch[3].trim();

        // Validate Num: must contain at least one digit or fraction
        if (/[\d\u00BC-\u00BE\u2150-\u215E]/.test(rawNum)) {
          return { name: rawName, quantity: rawNum, unit: rawUnit };
        }
      }

      // Pattern 2: Quantity Ends (Japanese/Eastern) "Beef 200g" / "Onion 1 pc"
      // (Rest) (Number) (Optional Unit or 'pcs' etc implicit) $
      // Note: This is harder because distinguishing name from quantity is tricky.
      // We rely on the number being at the very end.
      const easternRegex = new RegExp(`^(.*)\\s+(${numberPattern})\\s*(${units}|個|本|枚|つ|かけ|片|束|head|heads)?$`, 'i');
      const easternMatch = text.match(easternRegex);

      if (easternMatch) {
        const rawName = easternMatch[1].trim();
        const rawNum = easternMatch[2].trim();
        const rawUnit = (easternMatch[3] || '').trim();

        if (/[\d\u00BC-\u00BE\u2150-\u215E]/.test(rawNum)) {
          return { name: rawName, quantity: rawNum, unit: rawUnit };
        }
      }

      // Heuristic for simple "2 onions" where unit is implied or "onions" is the unit?
      // "2 onions" -> Western match handles it (unit undefined, name=onions). 
      // We can refine logic to say if unit is missing, and name is plural, maybe the name implies the unit? 
      // For now, let's stick to standard behavior.

      // Fallback
      return { name: text, quantity: '', unit: '' };
    };

    // Normalize
    const normalized = {
      title: recipeData.name || '',
      description: recipeData.description || '',
      image: recipeData.image ? (Array.isArray(recipeData.image) ? recipeData.image[0] : (typeof recipeData.image === 'object' ? recipeData.image.url : recipeData.image)) : '',
      ingredients: (Array.isArray(recipeData.recipeIngredient)
        ? recipeData.recipeIngredient
        : (typeof recipeData.recipeIngredient === 'string' ? [recipeData.recipeIngredient] : []))
        .filter((i: any) => i) // Remove nulls
        .map((ing: any) => {
          const rawText = typeof ing === 'string' ? ing : ing.text;
          const group = typeof ing === 'object' ? ing.group : 'Main';
          const parsed = parseIngredient(rawText);

          // Add group to result if present and not default
          // Note: The frontend expects 'group' property? or we just use 'group'
          // Let's add 'group' to the return object
          return {
            ...parsed,
            group: (group && group !== 'Main') ? group : undefined
          };
        }),
      steps: Array.isArray(recipeData.recipeInstructions)
        ? recipeData.recipeInstructions.map((step: any) => step.text || step.name || step).flat()
        : (typeof recipeData.recipeInstructions === 'string' ? [recipeData.recipeInstructions] : []),
      servings: recipeData.recipeYield || '',
      prepTime: recipeData.prepTime || '',
      cookTime: recipeData.cookTime || '',
    };

    // Final cleanup
    // Remove 'Step 1' prefixes from steps if present
    normalized.steps = normalized.steps.map((s: string) => s.replace(/^(step|étape|schritt|手順)?\s*\d+[:\.]\s*/i, '').trim()).filter(Boolean);

    return new Response(JSON.stringify({ recipe: normalized }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })

  } catch (error) {
    console.error("Scrape Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
