// import "jsr:@supabase/functions-js/edge-runtime.d.ts"
// Import Cheerio for reliable HTML parsing
import * as cheerio from "npm:cheerio@1.0.0-rc.12"
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts"

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-user-jwt, x-client-info, apikey, content-type',
}

console.log("Scrape Recipe Function Initialized v6 (Universal)")

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // JWT検証（--no-verify-jwt でデプロイし、ここで検証する）
    const token = getAuthToken(req)
    if (!token) {
      return new Response(JSON.stringify({ error: '認証が必要です。再ログインしてください。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    try {
      await verifySupabaseJWT(token)
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'トークンが無効または期限切れです。再ログインしてください。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { url } = await req.json()

    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    console.log(`Fetching URL: ${url}`);

    // Use Chrome User-Agent to bypass consent walls and anti-bot checks (e.g. The Spruce Eats)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
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
    // Strategy 1b: Detect Menu/Collection Pages (Fast Fail)
    // ---------------------------------------------------------
    if (!recipeData) {
      const pageTitle = $('title').text().toLowerCase();
      // Specific check for CuisineActuelle/French "Menu of the week" pages which are lists, not recipes
      const isMenuPage = pageTitle.includes('menu de la semaine') ||
        (pageTitle.includes('menu') && pageTitle.includes('semaine') && url.includes('cuisineactuelle'));

      if (isMenuPage) {
        throw new Error("このURLは週間メニューやまとめページのようです。個別のレシピページのURLを指定してインポートしてください。");
      }
    }
    // ---------------------------------------------------------
    // Strategy 2a: Site Specific Fixes
    // ---------------------------------------------------------
    if (url.includes('note.com')) {
      console.log("Detecting note.com URL, using specific text parsing...");
      const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      const image = $('meta[property="og:image"]').attr('content') || '';
      const description = $('meta[property="og:description"]').attr('content') || '';

      // note.com article body usually has this class
      const bodyContainer = $('.note-common-styles__textnote-body');

      const ingredients: any[] = [];
      const steps: string[] = [];

      if (bodyContainer.length) {
        // Clone the container to not mess up original if needed (though cheerio is in memory)
        // note.com uses <br> for line breaks frequently
        const content = bodyContainer.clone();
        content.find('br').replaceWith('\n');

        // Get text with newlines preserved
        const fullText = content.text();
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

        let isStepsMode = false;

        lines.forEach(line => {
          // SKIP headers/metadata lines if they are not ingredients
          if (line.includes('レシピ紹介') || line.includes('お疲れ様です')) {
            // Optional: ignore intro chatter
          }

          if (line.includes('作り方') || line === '材料') {
            if (line.includes('作り方')) isStepsMode = true;
            return;
          }

          if (isStepsMode) {
            steps.push(line);
            return;
          }

          // Ingredient finding logic: "Name   Quantity"
          // Regex to split by 2 or more spaces (full or half width)
          const ingredientMatch = line.match(/^(.+?)[\s\u3000\t]{2,}(.+)$/);

          if (ingredientMatch) {
            const name = ingredientMatch[1].trim();
            const quantity = ingredientMatch[2].trim();

            // Basic validation
            if (quantity.length < 20 && name.length < 50) {
              ingredients.push({ text: line, name, quantity });
              return;
            }
          }

          // If likely a step or description line (long enough, not an ingredient)
          if (line.length > 5 && !line.startsWith('#')) {
            steps.push(line);
          }
        });

        if (title) {
          recipeData = {
            name: title,
            description,
            image,
            recipeIngredient: ingredients,
            recipeInstructions: steps,
            recipeYield: ''
          };
        }
      }
    }

    if (!recipeData && url.includes('oceans-nadia.com')) {
      console.log("Detecting Nadia URL, trying specific selectors...");
      const title = $('h1').text().trim();

      const ingredients: any[] = [];
      $('li:has([class*="IngredientsList_ingredient"])').each((_, el) => {
        const name = $(el).find('[class*="IngredientsList_ingredient"]').text().trim();
        const amount = $(el).find('[class*="IngredientsList_amount"]').text().trim();
        if (name) {
          ingredients.push({ text: `${name} ${amount}`, name, quantity: amount });
        }
      });

      const steps: string[] = [];
      $('li:has([class*="CookingProcess_text"])').each((_, el) => {
        const txt = $(el).find('[class*="CookingProcess_text"]').text().trim();
        if (txt) steps.push(txt);
      });

      const description = $('meta[name="description"]').attr('content') || '';
      const image = $('meta[property="og:image"]').attr('content') || '';
      const servings = $('.RecipeHeading_bunryoYield__678kz').text().trim() || $('[class*="RecipeHeading_bunryoYield"]').text().trim();

      if (title && ingredients.length > 0) {
        recipeData = {
          name: title,
          description,
          image,
          recipeIngredient: ingredients,
          recipeInstructions: steps,
          recipeYield: servings
        };
      }
    }

    // RE-INSERTING NADIA LOGIC (truncated in thought, but must be in ReplacementContent)
    if (!recipeData && url.includes('oceans-nadia.com')) {
      console.log("Detecting Nadia URL, trying specific selectors...");
      const title = $('h1').text().trim();

      const ingredients: any[] = [];
      $('li:has([class*="IngredientsList_ingredient"])').each((_, el) => {
        const name = $(el).find('[class*="IngredientsList_ingredient"]').text().trim();
        const amount = $(el).find('[class*="IngredientsList_amount"]').text().trim();
        if (name) {
          ingredients.push({ text: `${name} ${amount}`, name, quantity: amount });
        }
      });

      const steps: string[] = [];
      $('li:has([class*="CookingProcess_text"])').each((_, el) => {
        const txt = $(el).find('[class*="CookingProcess_text"]').text().trim();
        if (txt) steps.push(txt);
      });

      const description = $('meta[name="description"]').attr('content') || '';
      const image = $('meta[property="og:image"]').attr('content') || '';
      const servings = $('.RecipeHeading_bunryoYield__678kz').text().trim() || $('[class*="RecipeHeading_bunryoYield"]').text().trim();

      if (title && ingredients.length > 0) {
        recipeData = {
          name: title,
          description,
          image,
          recipeIngredient: ingredients,
          recipeInstructions: steps,
          recipeYield: servings
        };
      }
    }



    // ---------------------------------------------------------
    // Site-Specific Logic: Chill Tea Tokyo
    // ---------------------------------------------------------
    if (!recipeData && url.includes('chilltea-tokyo.com')) {
      console.log("Detecting Chill Tea Tokyo URL...");
      const title = $('h1.p-entry__title').text().trim() || $('h1').text().trim();

      // Ingredients are in a <p> starting with 'Ingrédients'
      const ingredients: any[] = [];
      $('p').each((_, el) => {
        const text = $(el).text();
        if (text.includes('Ingrédients') || $(el).find('strong').text().includes('Ingrédients')) {
          // Clone and replace br with newline to preserve structure
          const html = $(el).html() || '';
          const parts = html.split(/<br\s*\/?>/i);

          parts.forEach(part => {
            const partText = part.replace(/<[^>]*>/g, '').trim();
            if (partText && !partText.includes('Ingrédients')) {
              // Remove bullet point if present
              const cleanText = partText.replace(/^・/, '').trim();
              if (cleanText) {
                ingredients.push(parseIngredient(cleanText));
              }
            }
          });
        }
      });

      // Steps are in a <p> starting with 'Préparation'
      const steps: string[] = [];
      $('p').each((_, el) => {
        const text = $(el).text();
        if (text.includes('Préparation') || $(el).find('strong').text().includes('Préparation')) {
          const html = $(el).html() || '';
          const parts = html.split(/<br\s*\/?>/i);

          parts.forEach(part => {
            const partText = part.replace(/<[^>]*>/g, '').trim();
            // Simple heuristic: parts that look like steps (longer text or numbered)
            if (partText && !partText.includes('Préparation') && partText.length > 3) {
              steps.push(partText);
            }
          });
        }
      });

      const description = $('meta[name="description"]').attr('content') || '';
      const image = $('meta[property="og:image"]').attr('content') || $('.p-entry__thumbnail img').attr('src') || '';

      if (title && (ingredients.length > 0 || steps.length > 0)) {
        recipeData = {
          name: title,
          description,
          image,
          recipeIngredient: ingredients,
          recipeInstructions: steps,
          recipeYield: ''
        };
      }
    }

    // ---------------------------------------------------------
    // Site-Specific Logic: Maison Gateau (Cooked Plugin)
    // ---------------------------------------------------------
    if (!recipeData && (url.includes('maisongateau.xsrv.jp') || $('.cooked-recipe-ingredients').length > 0)) {
      try {
        console.log("Detecting Maison Gateau / Cooked Plugin...");
        const title = $('h1.entry-title').text().trim() || $('h1').text().trim();

        let currentIngGroup = 'Main';
        // Locate the main content container to avoid picking up hidden modal/print versions
        const $mainContent = $('.entry-content .cooked-recipe-ingredients').first().parent();
        // If main content container not found (fallback), use root but exclude .cooked-panel
        const $container = $mainContent.length > 0 ? $mainContent : $('body');

        const ingredients: any[] = [];
        $container.find('.cooked-single-ingredient').not('.cooked-panel .cooked-single-ingredient').each((_, el) => {
          if ($(el).hasClass('cooked-heading')) {
            currentIngGroup = $(el).text().trim().replace(/[:：]$/, '') || 'Main';
            return;
          }

          const amount = $(el).find('.cooked-ing-amount').text().trim();
          const measurement = $(el).find('.cooked-ing-measurement').text().trim();
          const name = $(el).find('.cooked-ing-name').text().trim();

          if (name) {
            ingredients.push({
              name: name,
              quantity: amount,
              unit: measurement,
              group: currentIngGroup
            });
          } else {
            const text = $(el).text().trim();
            if (text) {
              const parsed = parseIngredient(text);
              ingredients.push({ ...parsed, group: currentIngGroup });
            }
          }
        });

        let currentStepGroup = 'Main';
        const steps: any[] = [];
        $container.find('.cooked-single-direction').not('.cooked-panel .cooked-single-direction').each((_, el) => {
          if ($(el).hasClass('cooked-heading')) {
            currentStepGroup = $(el).text().trim().replace(/[:：]$/, '') || 'Main';
            return;
          }

          const text = $(el).find('.cooked-direction').text().trim() || $(el).text().trim();
          if (text) {
            steps.push({
              text: text,
              group: currentStepGroup
            });
          }
        });

        const description = $('meta[name="description"]').attr('content') || '';
        // Try to get high-res image
        const image = $('.cooked-recipe-image img').attr('src') || $('.wp-post-image').attr('src') || $('meta[property="og:image"]').attr('content') || '';

        if (title && ingredients.length > 0) {
          recipeData = {
            name: title,
            description,
            image,
            recipeIngredient: ingredients,
            recipeInstructions: steps,
            recipeYield: ''
          };
        }
      } catch (e: any) {
        console.error("Maison Gateau Parsing Error:", e);
        return new Response(JSON.stringify({ error: `Maison Parsing Error: ${e.message}` }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ---------------------------------------------------------
    // Site-Specific Logic: Ouchi Ristrante
    // ---------------------------------------------------------
    // ---------------------------------------------------------
    // Site-Specific Logic: Ouchi Ristrante
    // ---------------------------------------------------------
    // ---------------------------------------------------------
    // Site-Specific Logic: Tomiz
    // ---------------------------------------------------------
    if (!recipeData && url.includes('tomiz.com')) {
      console.log("Detecting Tomiz URL...");
      const title = $('h1').text().trim();

      let recipeYield = $('.recipeYield').text().trim();
      if (!recipeYield) {
        // Look for yield in h2/h3 near "材料"
        $('h2, h3, div').each((_, el) => {
          const text = $(el).text();
          if (text.includes('材料') && text.includes('分')) {
            recipeYield = text.replace('材料', '').trim();
          }
        });
      }

      const ingredients: any[] = [];
      $('.materialInputBlock').each((_, el) => {
        // Tomiz structure: .materialInputBlock includes .materialInputBlock__figure (name?) and .materialInputBlock__text (quantity?)
        // Or sometimes name is directly in the block text if simple
        const name = $(el).find('.materialInputBlock__figure').text().trim() || $(el).find('.top-name').text().trim();
        const quantity = $(el).find('.materialInputBlock__text').text().trim() || $(el).find('.top-amount').text().trim();

        if (name) {
          ingredients.push({ name, quantity: quantity || '', unit: '' });
        } else {
          // Fallback: try to parse raw text if structure matches "Name Quantity"
          // But Tomiz usually uses the blocks. 
          // Let's also check for DL structure which appeared in logs (materialBlock1__dl)
        }
      });

      // Fallback for ingredients if materialInputBlock was empty (older tomiz pages?)
      if (ingredients.length === 0) {
        $('.materialBlock1__dl').each((_, el) => {
          const dt = $(el).find('dt').text().trim();
          const dd = $(el).find('dd').text().trim();
          if (dt) {
            ingredients.push({ name: dt, quantity: dd, unit: '' });
          }
        });
      }

      // Fallback 3: Standard checks if specific classes fail
      if (ingredients.length === 0) {
        $('.recipe-material__item, .ingredients-list li').each((_, el) => {
          const txt = $(el).text().trim();
          if (txt) ingredients.push(parseIngredient(txt));
        });
      }

      const steps: string[] = [];
      // Steps: Look for header "作り方" and then following siblings
      let stepContainer: any = null;
      $('h1, h2, h3, h4').each((_, el) => {
        if ($(el).text().includes('作り方')) {
          stepContainer = $(el).parent(); // Usually in a parent container
        }
      });

      if (stepContainer) {
        // Look for .instructionBlock, .stepBlock inside
        stepContainer.find('.instructionBlock, .stepBlock, .steps__item').each((_, el) => {
          let txt = $(el).text().trim();
          // Remove leading numbers
          txt = txt.replace(/^\d+[\.\s]*/, '').trim();
          if (txt) steps.push(txt);
        });
      }

      // Fallback for steps
      if (steps.length === 0) {
        $('.recipe-step__item, .steps-list li').each((_, el) => {
          let txt = $(el).text().trim();
          txt = txt.replace(/^\d+[\.\s]*/, '').trim();
          if (txt) steps.push(txt);
        });
      }

      const description = $('meta[name="description"]').attr('content') || '';
      const image = $('meta[property="og:image"]').attr('content') || $('.recipe-main-image img').attr('src') || '';

      if (title && (ingredients.length > 0 || steps.length > 0)) {
        recipeData = {
          name: title,
          description,
          image,
          recipeIngredient: ingredients,
          recipeInstructions: steps,
          recipeYield
        };
      }
    }

    if (!recipeData && url.includes('ouchi-ristrante.com')) {
      console.log("Detecting Ouchi Ristrante URL...");
      const title = $('h1').text().trim();

      // Ingredients: Look for "レシピ" or "材料" header
      const ingredients: any[] = [];
      const ingredientHeaders = $('h2, h3, h4').filter((_, el) => {
        const t = $(el).text().trim();
        return t.includes('レシピ') || t.includes('材料');
      });

      if (ingredientHeaders.length > 0) {
        const header = ingredientHeaders.first();
        // The content is usually in the next P or DIV, possibly separated by bullets '・'
        let contentEl = header.next();
        let attempts = 0;
        let foundText = '';

        while (attempts < 8 && contentEl.length > 0) {
          const text = contentEl.text().trim();
          // Case 1: PRE tag (Markdown code block style used by this author)
          if (contentEl.is('pre')) {
            foundText = text;
            break;
          }

          // Case 2: P tag with many bullets
          // Check if this looks like an ingredient list (has bullets or newlines)
          if ((text.match(/・/g) || []).length >= 2) {
            foundText = text;
            break;
          }
          contentEl = contentEl.next();
          attempts++;
        }

        // Parse the found text
        if (foundText) {
          // Split by interpuncts or newlines
          // Also clean up common surrounding weirdness
          const rawLines = foundText.split(/[\n\r・]+/).map(s => s.trim()).filter(s => s);
          rawLines.forEach(line => {
            // Ignore empty or weird header-like lines
            if (line.length < 2) return;
            // Use parseIngredient helper
            ingredients.push(parseIngredient(line));
          });
        }
      }

      // Steps: Look for "作り方"
      const steps: string[] = [];
      const stepHeader = $('h2, h3, h4').filter((_, el) => $(el).text().includes('作り方')).first();

      if (stepHeader.length > 0) {
        // Iterate siblings until next header
        let next = stepHeader.next();
        while (next.length > 0) {
          if (next.is('h2, h3')) break; // Stop at next major header

          const text = next.text().trim();

          // Only take things that look like steps (starting with number)
          // The site uses "1. ...", "2. ..."
          // Also ensure we don't pick up garbage spacers
          if (/^\d+\./.test(text) && text.length > 5) {
            // Clean up leading numbers if desired, but keeping them is fine too.
            steps.push(text);
          }
          // Fallback for non-numbered but likely steps (long P tags)
          else if (next.is('p') && text.length > 20 && !text.includes('レシピブログ')) {
            steps.push(text);
          }

          next = next.next();
        }
      }

      const description = $('meta[property="og:description"]').attr('content') || '';
      const image = $('meta[property="og:image"]').attr('content') || '';

      if (title && (ingredients.length > 0 || steps.length > 0)) {
        recipeData = {
          name: title,
          description,
          image,
          recipeIngredient: ingredients,
          recipeInstructions: steps,
          recipeYield: ''
        };
      }
    }

    // ---------------------------------------------------------
    // Site-Specific Logic: Freddy's Harajuku (WordPress paragraphs + <br>)
    // ---------------------------------------------------------
    if (!recipeData && url.includes('freddysharajuku.com')) {
      console.log("Detecting Freddy's Harajuku URL...");

      const title =
        $('h1.entry-title').first().text().trim() ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('h1').first().text().trim();
      const description =
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        '';
      const image =
        $('meta[property="og:image"]').attr('content') ||
        $('.entry-content img').first().attr('src') ||
        '';

      const ingredients: any[] = [];
      const steps: string[] = [];
      let recipeYield = '';
      let currentGroup = 'Main';
      let inRecipeSection = false;

      const isIngredientLike = (line: string) => {
        const text = String(line || '').trim();
        if (!text) return false;

        // Ex: "1 oz sugar", ".25oz honey", "1/2 cup milk", "1 Korean pear..."
        if (/^(?:\d+(?:\.\d+)?(?:\/\d+)?|\.\d+|[¼½¾⅓⅔⅛⅜⅝⅞])/.test(text)) return true;

        const lower = text.toLowerCase();
        // Ex: "a pinch of salt", "a knob ginger", "pinch of..."
        if (/^(?:a|an)\s+(?:pinch|dash|few|handful|knob)\b/.test(lower)) return true;
        if (/^(?:pinch|dash)\b/.test(lower)) return true;

        return false;
      };

      $('.entry-content p.wp-block-paragraph, .entry-content p').each((_, el) => {
        const paragraphHtml = $(el).html() || '';
        if (!paragraphHtml) return;

        const lines = paragraphHtml
          .split(/<br\s*\/?>/i)
          .map((part) => part.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        lines.forEach((rawLine) => {
          const line = String(rawLine || '').trim();
          if (!line) return;

          // Ex: "Makes 6-8 servings:"
          const makesMatch = line.match(/^makes?\s+(.+?)\s*(?:servings?)?[:：]?\s*$/i);
          if (makesMatch) {
            inRecipeSection = true;
            if (!recipeYield) {
              recipeYield = makesMatch[1].trim();
            }
            return;
          }

          // Ex: "For the ginger sable:"
          const groupMatch = line.match(/^for\s+(.+?)[:：]\s*$/i);
          if (groupMatch) {
            inRecipeSection = true;
            currentGroup = groupMatch[1].trim() || 'Main';
            return;
          }

          // Skip intros before recipe starts
          if (!inRecipeSection) return;

          if (isIngredientLike(line)) {
            const parsed = parseIngredient(line);
            if (parsed?.name) {
              ingredients.push({
                ...parsed,
                group: currentGroup || 'Main',
              });
            }
            return;
          }

          // In this site, instruction lines are plain sentences after ingredient lines.
          if (line.length >= 12) {
            steps.push(line);
          }
        });
      });

      if (title && (ingredients.length > 0 || steps.length > 0)) {
        recipeData = {
          name: title,
          description,
          image,
          recipeIngredient: ingredients,
          recipeInstructions: steps,
          recipeYield: recipeYield || '',
        };
      }
    }

    // ---------------------------------------------------------
    // Site-Specific Logic: Andrea Home Pastry (Wix / JS-heavy page fallback)
    // ---------------------------------------------------------
    if (!recipeData && url.includes('andreahomepastry.com')) {
      console.log("Detecting Andrea Home Pastry URL, using markdown-reader fallback...");

      const sourceUrl = url.replace(/^https?:\/\//i, '');
      const readerUrl = `https://r.jina.ai/http://${sourceUrl}`;

      try {
        const readerRes = await fetch(readerUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/plain,text/markdown;q=0.9,*/*;q=0.8',
          },
        });

        if (readerRes.ok) {
          const md = await readerRes.text();

          const stripMd = (s: string) => String(s || '')
            .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[*_`~>#]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          const title =
            (md.match(/^Title:\s*(.+)$/m)?.[1] || '').trim() ||
            $('meta[property="og:title"]').attr('content')?.trim() ||
            $('h1').first().text().trim();

          const image =
            (md.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/)?.[1] || '').trim() ||
            $('meta[property="og:image"]').attr('content') ||
            '';

          const contentStart = md.match(/Markdown Content:\s*([\s\S]*)$/i)?.[1] || md;
          const lines = contentStart
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

          const findHeadingIndex = (pattern: RegExp) => {
            return lines.findIndex((line) => pattern.test(stripMd(line)));
          };

          const ingredientsHeaderIndex = findHeadingIndex(/^ingredients?$/i);
          const stepsHeaderIndex = findHeadingIndex(/^(process|method|instruction|instructions|directions?)$/i);
          const firstStepLineIndex = lines.findIndex((line) => /^\d+\.\s+/.test(line));
          const sectionSplitIndex =
            stepsHeaderIndex >= 0
              ? stepsHeaderIndex
              : (firstStepLineIndex >= 0 ? firstStepLineIndex : lines.length);

          let description = '';
          const introSliceEnd = ingredientsHeaderIndex >= 0 ? ingredientsHeaderIndex : sectionSplitIndex;
          if (introSliceEnd > 0) {
            const introLines = lines
              .slice(0, introSliceEnd)
              .map((line) => stripMd(line))
              .filter((line) => line && !/^(?:\w{3}\s+\d{1,2},\s+\d{4}|\d+\s*min\b)/i.test(line));
            description = introLines
              .filter((line) => !/^https?:\/\//i.test(line))
              .slice(0, 3)
              .join(' ')
              .trim();
          }
          if (!description) {
            description = $('meta[name="description"]').attr('content')
              || $('meta[property="og:description"]').attr('content')
              || '';
          }

          const ingredients: any[] = [];
          const ingredientStart =
            ingredientsHeaderIndex >= 0 ? ingredientsHeaderIndex + 1 : 0;
          const ingredientLines = lines.slice(ingredientStart, sectionSplitIndex);
          ingredientLines.forEach((line) => {
            // Skip markdown heading separators such as "-----"
            if (/^[-=]{3,}$/.test(line)) return;

            // Prefer bullet entries, but also accept quantity-like plain lines.
            const bulletCore = line.match(/^\*\s+(.+)$/)?.[1]?.trim();
            let core = bulletCore ?? line;

            if (!core) return;

            // If italic notes are appended, keep the first highlighted phrase as ingredient core.
            const firstItalic = core.match(/_([^_]+)_/);
            if (firstItalic && firstItalic[1]) {
              core = firstItalic[1].trim();
            }

            core = stripMd(core);
            if (!core) return;

            // Skip obvious metadata lines
            if (/^\d+\s*min\b/i.test(core)) return;
            if (/^\w{3}\s+\d{1,2},\s+\d{4}$/i.test(core)) return;

            // Accept if bullet, or if line starts with quantity and has ingredient-ish text
            if (bulletCore || /^(?:\d+(?:\.\d+)?(?:\/\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*\w*/.test(core)) {
              ingredients.push(parseIngredient(core));
            }
          });

          const steps: string[] = [];
          const stepStart =
            stepsHeaderIndex >= 0 ? stepsHeaderIndex + 1 : (firstStepLineIndex >= 0 ? firstStepLineIndex : -1);
          if (stepStart >= 0) {
            lines.slice(stepStart).forEach((line) => {
              if (/^[-=]{3,}$/.test(line)) return;
              const m = line.match(/^(\d+)\.\s+(.+)$/);
              if (m && m[2]) {
                const cleaned = stripMd(m[2]);
                if (cleaned) steps.push(cleaned);
              }
            });
          }

          console.log(`Andrea fallback parsed: ingredients=${ingredients.length}, steps=${steps.length}`);

          if (title && (ingredients.length > 0 || steps.length > 0)) {
            recipeData = {
              name: title,
              description,
              image,
              recipeIngredient: ingredients,
              recipeInstructions: steps,
              recipeYield: '',
            };
          }
        }
      } catch (e) {
        console.warn('Andrea Home Pastry fallback parsing failed', e);
      }
    }

    // ---------------------------------------------------------
    // Strategy 2: Universal HTML Parsing (Fallback)
    // ---------------------------------------------------------
    if (!recipeData) {
      console.log("No JSON-LD found. Executing Universal Fallback Strategy.");

      const getMeta = (name: string) => $(`meta[name="${name}"], meta[property="${name}"]`).attr('content');

      // --- A. Title ---
      // Priority: Site Specific -> OG Title -> Wrapper H1/H2 -> H1 -> Title Tag
      let title = '';

      // Marmiton Specific (and others using main-title)
      if (url.includes('marmiton.org')) {
        title = $('.main-title h1').text().trim() || $('.main-title').text().trim() || $('.recipe-header__title').text().trim() || $('h1.SHRD__sc-10plygc-0').text().trim();
      }

      if (!title) title = getMeta('og:title');

      if (!title) {
        // Try specific selectors for known sites or semantic structures
        title = $('h1[class*="title"], h1[class*="name"], .recipe-title, .recipe-header h1').first().text().trim();
      }
      if (!title) title = $('h1').first().text().trim();
      if (!title) title = $('title').text().trim(); // Last resort

      // Clean up title (remove site name often appended | SiteName)
      if (title) {
        title = title.split('|')[0].trim().split(' - ')[0].trim();
      }

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
        'directions', 'steps', 'how to make', 'procedure', 'étapes', 'etapes',
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
          const isMatch = keywords.some(k => text === k || (text.includes(k) && text.length < 60));
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
    // Helper: Normalize Unit Strings (e.g. Japanese -> cc)
    // ---------------------------------------------------------
    function normalizeUnit(str: string) {
      if (!str) return str;
      // Normalize Full-width numbers to Half-width for Regex compatibility
      // 0-9 (0xFF10-0xFF19) -> 0-9 (0x0030-0x0039)
      let s = str.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/[．]/g, '.');

      const parseNum = (n: string) => {
        if (n.includes('/')) {
          const [a, b] = n.split('/');
          return parseFloat(a) / parseFloat(b);
        }
        return parseFloat(n);
      };

      // 大さじ (Tbsp) -> 15cc
      s = s.replace(/大さじ\s*(\d+(?:\.\d+)?(?:\/\d+)?)/g, (_, n) => {
        const val = parseNum(n);
        return isNaN(val) ? _ : `${val * 15}cc`;
      });
      // 小さじ (Tsp) -> 5cc
      s = s.replace(/小さじ\s*(\d+(?:\.\d+)?(?:\/\d+)?)/g, (_, n) => {
        const val = parseNum(n);
        return isNaN(val) ? _ : `${val * 5}cc`;
      });
      // カップ (Cup) -> 200cc
      // Usually "1カップ" or "1/2カップ"
      s = s.replace(/(\d+(?:\.\d+)?(?:\/\d+)?)\s*カップ/g, (_, n) => {
        const val = parseNum(n);
        return isNaN(val) ? _ : `${val * 200}cc`;
      });
      return s;
    };

    // ---------------------------------------------------------
    // Universal Ingredient Parser (Regex)
    // ---------------------------------------------------------
    function parseIngredient(text: string) {
      const original = text;
      text = text.trim().replace(/[\s\u00A0\u3000]+/g, ' ');
      console.log(`[ParseIng] In: "${original}" -> Clean: "${text}"`);

      // Apply unit normalization first
      text = normalizeUnit(text);

      // A. Specific Format: "Name: Quantity"
      if (text.includes('：') || text.includes(':')) {
        const parts = text.split(/[：:]/);
        const name = parts[0].trim();
        const rawQty = parts.slice(1).join(' ').trim();

        if (rawQty.length < 30) {
          // Try to parse the right side as Quantity + Unit
          const numberPattern = `[\\d\\s\\.,/\\u00BC-\\u00BE\\u2150-\\u215E]+`;
          // Simple Regex for Amount Only: "^(Number) (Unit)?$"
          // Note: Using a slightly more permissive regex that allows for suffix
          const amountRegex = new RegExp(`^(${numberPattern})\\s*([a-zA-Z%]+|cc|g|ml|kg|tbsp|tsp|cup|個|本|枚|つ|かけ|片|束|cm)?(.*)$`);

          const match = rawQty.match(amountRegex);
          if (match) {
            const num = match[1].trim();
            const unit = (match[2] || '').trim();
            const suffix = match[3].trim();

            // If we have a suffix (e.g. "(フレンチ...)"), append it to unit or handle it?
            // User usually expects "500" in qty, "g (フレンチ...)" in unit.
            return {
              name,
              quantity: num,
              unit: unit + (suffix ? ` ${suffix}` : '')
            };
          }

          // Fallback: Return raw if parsing fails
          return { name, quantity: rawQty, unit: '' };
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
        '個', '本', '束', '枚', '杯', 'g', 'ml', 'cc', 'cm'
      ].join('|').replace(/\./g, '\\.'); // Escape dots

      // Pattern 1: Quantity Starts (Western) "200g Beef" / "1/2 cup Sugar"
      // ^ (Number) (Optional Unit) (Rest)
      const westernRegex = new RegExp(`^(${numberPattern})\\s*(${units}|cc)?\\s+(.*)$`, 'i');
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
      const easternRegex = new RegExp(`^(.*)\\s+(${numberPattern})\\s*(${units}|個|本|枚|つ|かけ|片|束|head|heads|cc)?$`, 'i');
      const easternMatch = text.match(easternRegex);

      if (easternMatch) {
        const rawName = easternMatch[1].trim();
        const rawNum = easternMatch[2].trim();
        const rawUnit = (easternMatch[3] || '').trim();

        if (/[\d\u00BC-\u00BE\u2150-\u215E]/.test(rawNum)) {
          console.log(`[ParseIng] Match Eastern: Qty=${rawNum}, Unit=${rawUnit}`);
          return { name: rawName, quantity: rawNum, unit: rawUnit };
        }
      }

      // Pattern 3: Tight Packing "NameQuantity" (Japanese often) e.g. "肉100g", "キャベツ1個"
      // Needs strong unit validation to avoid false positives (e.g. "Model500")
      const easternRegexTight = new RegExp(`^(.*?)(${numberPattern})\\s*(${units}|個|本|枚|つ|かけ|片|束|head|heads|cc)$`, 'i');
      const tightMatch = text.match(easternRegexTight);

      if (tightMatch) {
        const rawName = tightMatch[1].trim();
        const rawNum = tightMatch[2].trim();
        const rawUnit = tightMatch[3].trim();

        if (rawName.length > 0 && /[\d\u00BC-\u00BE\u2150-\u215E]/.test(rawNum)) {
          return { name: rawName, quantity: rawNum, unit: rawUnit };
        }
      }

      // Fallback
      console.log(`[ParseIng] Fallback for "${text}"`);
      return { name: text, quantity: '', unit: '' };
    };

    // Normalize ingredients with stateful grouping (for JSON-LD flat lists)
    const rawIngs = (Array.isArray(recipeData.recipeIngredient)
      ? recipeData.recipeIngredient
      : (typeof recipeData.recipeIngredient === 'string' ? [recipeData.recipeIngredient] : []))
      .filter((i: any) => i);

    let currentGroup = 'Main';
    const ingredients: any[] = [];

    for (const ing of rawIngs) {
      const rawText = typeof ing === 'string' ? ing : ing.text;
      const preDefinedGroup = typeof ing === 'object' ? ing.group : null;

      // Group Header Detection (mainly for flattened JSON-LD like Dancyu)
      // Look for "★", "●", "■" at start, or ending with ":"
      // e.g. "★ ［ミックススパイス］："
      const cleanText = (rawText || '').trim();

      // Heuristic: specific symbols start, or specific wrapping, or end with colon AND short
      const isHeaderSymbol = /^[★●■▲▼]/.test(cleanText);
      const isHeaderColon = /[:：]$/.test(cleanText);

      if ((isHeaderSymbol || isHeaderColon) && cleanText.length < 30) {
        // It's a group header! Update currentGroup and skip adding as ingredient
        currentGroup = cleanText
          .replace(/^[★●■▲▼]\s*/, '') // Remove leader symbol
          .replace(/[:：]$/, '')      // Remove trailing colon
          .replace(/^［/, '').replace(/］$/, '') // Remove Dancyu style brackets if present
          .trim();
        continue;
      }

      // Use existing group if available (from HTML parsing), else use current tracked group
      const group = preDefinedGroup || currentGroup;

      let parsed;
      if (typeof ing === 'object' && ing.name) {
        // PATH A: Structured Data
        const cleanName = ing.name;
        const rawQty = ing.quantity || '';
        const existingUnit = ing.unit || '';

        const normalizedQty = normalizeUnit(rawQty);
        // Simple Regex for Amount Only: "^(Number) (Unit)?$"
        const amountOnlyRegex = /^([\d\.]+(?:\/\d+)?)\s*([a-zA-Z%]+|cc|g|ml|個|本|枚|つ|かけ|片|束)?$/;
        const match = normalizedQty.match(amountOnlyRegex);

        if (match) {
          parsed = { name: cleanName, quantity: match[1], unit: match[2] || existingUnit };
        } else {
          const numMatch = normalizedQty.match(/^([\d\.]+)/);
          if (numMatch) {
            const q = numMatch[1];
            const u = normalizedQty.substring(q.length).trim();
            parsed = { name: cleanName, quantity: q, unit: u || existingUnit };
          } else {
            parsed = { name: cleanName, quantity: '', unit: rawQty || existingUnit };
          }
        }
      } else {
        // PATH B: Full Text Parsing
        parsed = parseIngredient(rawText);
      }

      ingredients.push({ ...parsed, group });
    }

    // Normalize
    const normalized = {
      name: recipeData.name || '',
      description: recipeData.description || '',
      image: recipeData.image ? (Array.isArray(recipeData.image) ? recipeData.image[0] : (typeof recipeData.image === 'object' ? recipeData.image.url : recipeData.image)) : '',
      ingredients: ingredients,
      steps: Array.isArray(recipeData.recipeInstructions)
        ? recipeData.recipeInstructions.map((step: any) => {
          // Already object with text? (Maison Logic)
          if (typeof step === 'object' && step.text) return step;
          // Schema.org HowToStep / HowToSection? 
          if (step['@type'] === 'HowToStep') return step.text;
          if (step['@type'] === 'HowToSection') return step.itemListElement?.map((s: any) => s.text) || [];

          return step.text || step.name || step;
        }).flat()
        : (typeof recipeData.recipeInstructions === 'string' ? [recipeData.recipeInstructions] : []),
      recipeYield: recipeData.recipeYield || '',
      prepTime: recipeData.prepTime || '',
      cookTime: recipeData.cookTime || '',
    };

    // Final cleanup
    // Remove 'Step 1' prefixes from steps if present
    // normalized.steps = normalized.steps.map((s: string) => s.replace(/^(step|étape|schritt|手順)?\s*\d+[:\.]\s*/i, '').trim()).filter(Boolean);
    normalized.steps = normalized.steps.map((s: any) => {
      if (typeof s === 'string') {
        return s.replace(/^(step|étape|schritt|手順)?\s*\d+[:\.]\s*/i, '').trim();
      }
      if (typeof s === 'object' && s.text) {
        s.text = s.text.replace(/^(step|étape|schritt|手順)?\s*\d+[:\.]\s*/i, '').trim();
        return s;
      }
      return s;
    }).filter(Boolean);

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
