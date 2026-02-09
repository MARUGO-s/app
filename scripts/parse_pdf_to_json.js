
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const inputFile = process.argv[2];
// Default locations for local sample artifacts (gitignored).
const outputFile = process.argv[3] || 'samples/json/recipes.json';

if (!inputFile) {
    console.error('Usage: node parse_pdf_to_json.js <input_pdf> [output_json]');
    process.exit(1);
}

// Map "Name" to "Title" key for consistency if needed, but script used "name"
// We will stick to the script's logic but maybe refine it.

async function parse() {
    if (!fs.existsSync(inputFile)) {
        console.error('File not found:', inputFile);
        return;
    }

    console.log(`Parsing ${inputFile}...`);

    const dataBuffer = fs.readFileSync(inputFile);
    const data = await pdf(dataBuffer);
    const text = data.text;

    // Split by "N. " (number followed by newline or space)
    // Regex: Start of line, Number, Dot, whitespace
    const rSplit = /\n\d+\.\s+/g;

    let matches = [];
    let match;
    while ((match = rSplit.exec(text)) !== null) {
        matches.push({ index: match.index, number: match[0].trim() });
    }

    const recipes = [];

    // If no numbered list found, maybe try to parse as single block or different format?
    // "Dressing 1" PDF might have different format. 
    // Let's assume similar format for now.

    if (matches.length === 0) {
        console.warn('No numbered sections found (e.g. "1. "), trying to parse entire text as one or check format.');
        // Fallback or just debug log
        console.log('Text content start:', text.substring(0, 500));
    }

    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = matches[i + 1] ? matches[i + 1].index : text.length;
        const block = text.substring(start, end);

        const lines = block.split('\n').map(l => l.trim()).filter(l => l);

        let title = '';
        let description = '';
        let ingredients = [];
        let steps = [];

        let mode = 'desc'; // desc, ing, step

        let startIndex = 0;
        // Skip header number line
        if (/^\d+\.$/.test(lines[0])) {
            startIndex = 1;
        }

        title = lines[startIndex];

        // Heuristics for mode switching
        for (let j = startIndex + 1; j < lines.length; j++) {
            const line = lines[j];

            // Detect Ingredients section
            if (['材料', '分量', '材料 分量', '＜材料＞', '【材料】'].some(k => line.includes(k))) {
                mode = 'ing';
                continue;
            }
            // Detect Steps section
            if (['作り方', '作り方：', '＜作り方＞', '【作り方】'].some(k => line.startsWith(k) || line === k)) {
                mode = 'step';
                continue;
            }
            // Detect End
            if (line.includes('相性の良いサラダ') || line.includes('Point')) {
                // Point might be part of steps or separate. Let's keep it in steps or ignore.
                // If "相性の良いサラダ" (Good salad pairings), usually end of recipe info.
                mode = 'done';
                continue;
            }

            if (mode === 'desc') {
                // If it looks like a japanese char string, append.
                description += line + ' ';
            } else if (mode === 'ing') {
                // Split Name / Quantity
                // "Olive Oil 3 Tbsp" -> Name: Olive Oil, Qty: 3 Tbsp
                // Japanese: "オリーブオイル 大さじ3"
                // Sometimes "塩 少々"

                // Naive split by space
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    const quantity = parts.pop();
                    const name = parts.join(' ');
                    ingredients.push({ name, quantity, unit: '' });
                } else {
                    ingredients.push({ name: line, quantity: '', unit: '' });
                }
            } else if (mode === 'step') {
                steps.push(line);
            }
        }

        if (title) {
            recipes.push({
                name: title, // DB expects 'title' but let's keep 'name' for intermediate JSON or rename now
                title: title,
                description: description.trim(),
                ingredients,
                steps
            });
        }
    }

    console.log(`Parsed ${recipes.length} recipes.`);

    // Normalize structure for DB import script later
    // The DB script typically expects: title, description, ingredients: [{name, quantity...}], steps: ["..."]

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(recipes, null, 2));
    console.log(`Saved to ${outputFile}`);
}

parse();
