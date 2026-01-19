
import * as cheerio from 'cheerio';

async function main() {
    const url = 'https://www.thespruceeats.com/basque-cake-recipe-3083191';
    console.log(`Fetching ${url}...`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            console.error(`Status ${response.status}: ${response.statusText}`);
            return;
        }

        const html = await response.text();
        console.log(`Got HTML: ${html.length} chars`);
        const $ = cheerio.load(html);

        // Check JSON-LD
        let foundJsonLd = false;
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html());
                console.log('Found JSON-LD:', JSON.stringify(data, null, 2).slice(0, 500) + '...');

                const findRecipe = (obj) => {
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

                const recipe = findRecipe(data);
                if (recipe) {
                    console.log('SUCCESS: Found Recipe in JSON-LD!');
                    foundJsonLd = true;
                }
            } catch (e) {
                console.error('JSON Parse error', e);
            }
        });

        if (!foundJsonLd) {
            console.log('No JSON-LD Recipe found. Would fallback to universal parsing.');
            // Basic universal check
            const title = $('h1').text().trim();
            console.log('H1 Title:', title);
            const ingredients = [];
            $('.ingredient').each((_, el) => ingredients.push($(el).text().trim()));
            console.log('Class .ingredient count:', ingredients.length);
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

main();
