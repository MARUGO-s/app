
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// Default locations for local sample artifacts (gitignored).
const inputFile = process.argv[2] || 'samples/pdfs/シフォンケーキ10選.pdf';
const outputFile = process.argv[3] || 'samples/json/chiffon_recipes.json';

async function parse() {
    if (!fs.existsSync(inputFile)) {
        console.error('File not found:', inputFile);
        return;
    }

    console.log(`Parsing ${inputFile}...`);

    const dataBuffer = fs.readFileSync(inputFile);
    const data = await pdf(dataBuffer);
    const text = data.text;

    // Helper to get lines
    const allLines = text.split('\n').map(l => l.trim()).filter(l => l);

    const recipes = [];
    let currentRecipe = null;
    let mode = null; // 'desc', 'ing', 'step', 'point'

    // Regex to detect recipe start "N. Title"
    const recipeStartRegex = /^(\d+)\.\s*$/;

    for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];

        // Check for new recipe start
        if (recipeStartRegex.test(line)) {
            if (currentRecipe) {
                recipes.push(currentRecipe);
            }

            const title = allLines[i + 1]; // Next line is likely title
            i++; // skip title line

            currentRecipe = {
                title: title,
                description: '',
                ingredients: [],
                steps: []
            };
            mode = 'desc';
            continue;
        }

        if (!currentRecipe) continue;

        // Detect section headers
        if (line.includes('材料（')) {
            mode = 'ing_header';
            continue;
        }
        if (line === '分量') {
            mode = 'ing';
            continue;
        }
        if (line.startsWith('作り方')) {
            mode = 'step';
            continue;
        }
        if (line.startsWith('ポイント：')) {
            // Push strictly the "Point: ..." line as a new step for now
            currentRecipe.steps.push(line);
            mode = 'point';
            continue;
        }
        if (line.includes('おかずシフォンケーキ成功のコツ')) {
            break; // Valid end of recipes
        }

        if (mode === 'desc') {
            if (!line.includes('材料（')) {
                currentRecipe.description += line + ' ';
            }
        } else if (mode === 'ing') {
            // Ingredients format
            // Check if line looks like "Name Quantity"
            const parts = line.split(/\s+/);
            if (parts.length > 1) {
                const lastPart = parts[parts.length - 1];
                const isQty = /^[\d\.\/]+[a-zA-Z%]*$/.test(lastPart) ||
                    ['少々', '個分', '本', '枚', 'かけ', '適量'].some(u => lastPart.includes(u)) ||
                    lastPart.includes('さじ') || lastPart.includes('ml') || lastPart.includes('g');

                if (isQty) {
                    const quantity = parts.pop();
                    const name = parts.join(' ');
                    currentRecipe.ingredients.push({ name, quantity, unit: '' });
                } else {
                    currentRecipe.ingredients.push({ name: line, quantity: '', unit: '' });
                }
            } else {
                if (line.length > 0) {
                    // Start with digit or specific char?
                    const isQtyLine = /^[\d\.\/]+[a-zA-Z%]*$/.test(line) ||
                        ['少々', '個分', '本', '枚', 'かけ', '適量'].some(u => line.includes(u)) ||
                        line.includes('さじ') || line.includes('ml') || line.includes('g');

                    if (isQtyLine && currentRecipe.ingredients.length > 0) {
                        const lastIng = currentRecipe.ingredients[currentRecipe.ingredients.length - 1];
                        if (!lastIng.quantity) {
                            lastIng.quantity = line;
                        } else {
                            currentRecipe.ingredients.push({ name: line, quantity: '', unit: '' });
                        }
                    } else {
                        currentRecipe.ingredients.push({ name: line, quantity: '', unit: '' });
                    }
                }
            }
        } else if (mode === 'step') {
            const stepMatch = line.match(/^\d+\.\s*(.*)/);
            if (stepMatch) {
                currentRecipe.steps.push(stepMatch[1]);
            } else {
                if (currentRecipe.steps.length > 0) {
                    currentRecipe.steps[currentRecipe.steps.length - 1] += line;
                }
            }
        } else if (mode === 'point') {
            // Append to the last step
            if (currentRecipe.steps.length > 0) {
                currentRecipe.steps[currentRecipe.steps.length - 1] += line;
            }
        }
    }

    if (currentRecipe) {
        recipes.push(currentRecipe);
    }

    recipes.forEach(r => {
        r.description = r.description.trim();
    });

    console.log(`Parsed ${recipes.length} recipes.`);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(recipes, null, 2));
    console.log(`Saved to ${outputFile}`);
}

parse();
