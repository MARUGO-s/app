
import * as cheerio from "cheerio";

const url = "https://ouchi-ristrante.com/dressing/";

console.log(`Fetching ${url}...`);
const response = await fetch(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});
const html = await response.text();
const $ = cheerio.load(html);

console.log("Title found:", $('h1').text().trim());

console.log("--- Analyzing Headers ---");
$('h2, h3, h4').each((i, el) => {
    console.log(`Header [${$(el).prop('tagName')}]: "${$(el).text().trim()}"`);

    // Check next element
    const next = $(el).next();
    console.log(`  -> Next Tag: ${next.prop('tagName')}, Class: ${next.attr('class')}`);
    console.log(`  -> Next Text Snippet: ${next.text().substring(0, 50).replace(/\n/g, ' ')}...`);

    // Check pre/code specifically
    const codeBlock = $(el).nextAll('pre, .quicktags').first(); // naive check
    if (codeBlock.length) {
        // check distance?
    }
});

console.log("\n--- Debugging Ingredients Extraction (New Logic) ---");
// Re-run my logic
const ingredientHeaders = $('h2, h3, h4').filter((_, el) => {
    const t = $(el).text().trim();
    return t.includes('レシピ') || t.includes('材料');
});

if (ingredientHeaders.length) {
    console.log(`Found ${ingredientHeaders.length} potential ingredient headers.`);

    ingredientHeaders.each((i, el) => {
        const headerText = $(el).text().trim();
        console.log(`Checking header: "${headerText}"`);

        let contentEl = $(el).next();
        let attempts = 0;
        let foundText = '';

        while (attempts < 8 && contentEl.length > 0) {
            const text = contentEl.text().trim();
            const tagName = contentEl.prop('tagName');

            console.log(`  Sibling +${attempts} [${tagName}]: "${text.substring(0, 50)}..."`);

            // Case 1: PRE tag (Markdown code block style used by this author)
            if (contentEl.is('pre')) {
                console.log("  MATCH! Found PRE tag.");
                foundText = text;
                break;
            }

            // Case 2: P tag with many bullets
            if ((text.match(/・/g) || []).length >= 2) {
                console.log("  MATCH! Found many bullets.");
                foundText = text;
                break;
            }
            contentEl = contentEl.next();
            attempts++;
        }

        if (foundText) {
            console.log("  -> Extracted Text Block:\n" + foundText.substring(0, 100) + "...");
            const rawLines = foundText.split(/[\n\r・]+/).map(s => s.trim()).filter(s => s);
            console.log(`  -> Found ${rawLines.length} ingredients.`);
            rawLines.forEach(l => console.log(`     - ${l}`));
        } else {
            console.log("  -> No match found near this header.");
        }
    });
} else {
    console.log("No ingredient headers found with 'レシピ' or '材料'.");
}

console.log("\n--- Debugging Steps Extraction (New Logic) ---");
const stepHeader = $('h2, h3, h4').filter((_, el) => $(el).text().includes('作り方')).first();
if (stepHeader.length) {
    console.log(`Found Step Header: ${stepHeader.text()}`);
    let next = stepHeader.next();
    const steps = [];

    while (next.length > 0) {
        if (next.is('h2, h3')) {
            console.log("  Hit next header, stopping.");
            break;
        }

        const text = next.text().trim();
        const tagName = next.prop('tagName');

        // Only take things that look like steps (numbered or decent length)
        if (/^\d+\./.test(text) && text.length > 5) {
            console.log(`  MATCH! Numbered Step [${tagName}]: "${text.substring(0, 50)}..."`);
            steps.push(text);
        }
        else if (next.is('p') && text.length > 20 && !text.includes('レシピブログ')) {
            console.log(`  MATCH! Paragraph Step [${tagName}]: "${text.substring(0, 50)}..."`);
            steps.push(text);
        } else {
            // console.log(`  Ignored [${tagName}]: "${text.substring(0, 20)}..."`);
        }

        next = next.next();
    }
    console.log(`Total Steps Found: ${steps.length}`);
} else {
    console.log("No '作り方' header found.");
}
