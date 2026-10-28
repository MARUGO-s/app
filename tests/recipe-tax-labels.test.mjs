import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = await readFile(new URL('../src/components/RecipeDetail.css', import.meta.url), 'utf8');
const result = await build({
    stdin: {
        contents: `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecipeDetail } from './src/components/RecipeDetail.jsx';
export const render = recipe => renderToStaticMarkup(React.createElement(RecipeDetail, { recipe }));`,
        resolveDir: root,
        loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    define: { 'import.meta.env': '{}' },
    plugins: [{
        name: 'offline-render-boundaries',
        setup(builder) {
            builder.onResolve({ filter: /(?:supabase|useAuth|useToast)(?:\.js)?$/ }, ({ path }) => ({ path, namespace: 'offline' }));
            builder.onLoad({ filter: /.*/, namespace: 'offline' }, ({ path }) => ({
                contents: path.endsWith('useAuth')
                    ? 'export const useAuth = () => ({ user: null });'
                    : path.endsWith('useToast')
                        ? 'export const useToast = () => ({});'
                        : `export const SUPABASE_URL = 'https://offline.invalid';
export const SUPABASE_ANON_KEY = '';
export const supabase = new Proxy({}, { get() { throw new Error('Network boundary must not be called during static rendering'); } });`,
                loader: 'js',
            }));
            builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
        },
    }],
});
const renderedModule = new Module(`${root}tests/offline-tax-render.cjs`);
renderedModule.paths = [`${root}node_modules`];
renderedModule._compile(result.outputFiles[0].text, renderedModule.filename = `${root}tests/offline-tax-render.cjs`);
const { render } = renderedModule.exports;

const ingredients = [
    { name: '栗', quantity: 25, unit: 'g', purchaseCost: 2187.9, cost: 72.9 },
    { name: 'クリーム', quantity: 60, unit: 'ml', purchaseCost: 1100, cost: 66 },
];
const recipe = { id: 'offline-tax-preview', title: '税表示の検証', type: 'normal', ingredients, steps: [], tags: [] };

// Exercise the actual JSX for the screen and the dedicated print layout.
test('normal detail and print explicitly distinguish net ingredient prices from gross totals', () => {
    const html = render(recipe);
    const printStart = html.indexOf('class="print-layout"');
    assert.ok(printStart > 0);
    for (const section of [html.slice(0, printStart), html.slice(printStart)]) {
        const text = section.replace(/<[^>]*>/g, '');
        assert.match(text, /仕入れ（税抜）/);
        assert.match(text, /原価（税抜）/);
        assert.match(text, /合計原価（税込）/);
        assert.match(section, /class="ingredient-tax-label">（税抜）<\/span>/, 'tax qualifier is an indivisible second line');
    }
});

test('flat, grouped and bread views explain tax consistently on screen and print', () => {
    const fixtures = [
        recipe,
        { ...recipe, ingredientGroups: [{ id: 'cream', name: 'クリーム' }], ingredients: ingredients.map(item => ({ ...item, groupId: 'cream' })) },
        { ...recipe, type: 'bread', flours: [{ name: '強力粉', quantity: 100, unit: 'g', purchaseCost: 1000, cost: 100 }], breadIngredients: [] },
    ];
    for (const fixture of fixtures) {
        const html = render(fixture);
        const printStart = html.indexOf('class="print-layout"');
        for (const section of [html.slice(0, printStart), html.slice(printStart)]) {
            assert.ok(section.includes('材料の仕入れ・原価は税抜、合計原価は税込です。'), `${fixture.type}: tax explanation is visible in both layouts`);
            assert.ok(section.includes('食材8％／酒類・資材10％'), 'explanation covers mixed tax rates');
        }
    }
});

test('print CSS does not hide the tax explanation', () => {
    const rule = css.match(/\.recipe-detail__tax-footnote\s*\{([^}]+)\}/g) || [];
    assert.ok(rule.length > 0);
    assert.ok(!rule.some(block => /display:\s*none/.test(block)), 'tax explanation must survive printing and PDF export');
});

const totalValues = html => {
    const totals = Array.from(html.matchAll(/class="cost-summary__value">([\s\S]*?)<\/span>/g), match => match[1].trim());
    assert.ok(totals.length >= 2, 'screen and print both contain a total');
    return totals;
};

test('Mont Blanc still totals 482 yen and rendering never mutates recipe input', () => {
    const costs = [72.9, 66, 37.3, 74.7, 10.7, 33.8, 75.2, 7.7, 37.4, 30.7];
    const fixture = { ...recipe, ingredients: costs.map((cost, index) => ({ name: `材料${index}`, quantity: 1, unit: 'g', cost })) };
    const before = JSON.stringify(fixture);
    const totals = totalValues(render(fixture));
    assert.ok(totals.length >= 2);
    assert.ok(totals.every(value => value === '¥482'), 'screen and print retain the same rounded gross total');
    assert.equal(JSON.stringify(fixture), before);
});

test('food, alcohol, supplies, zero and bread keep their original tax calculations', () => {
    for (const itemCategory of ['alcohol', 'supplies']) {
        const fixture = { ...recipe, ingredients: [{ name: '食材', cost: 100 }, { name: '10％対象', cost: 100, itemCategory }] };
        assert.ok(totalValues(render(fixture)).every(value => value === '¥218'));
    }
    assert.ok(totalValues(render({ ...recipe, ingredients: [{ name: '水', cost: 0 }] })).every(value => value === '¥0'));
    const bread = { ...recipe, type: 'bread', flours: [{ name: '粉', quantity: 100, unit: 'g', purchaseCost: 1000, cost: 100 }], breadIngredients: [{ name: '酒', quantity: 10, unit: 'g', purchaseCost: 1000, cost: 10, itemCategory: 'alcohol' }] };
    assert.ok(totalValues(render(bread)).every(value => value === '¥119'));
});
