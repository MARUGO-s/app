import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

// Exercise the actual service and DB format conversion without writing production data.
// Run: node --experimental-vm-modules --test tests/recipe-duplicate.test.mjs
async function loadService(source, readError = null) {
    const writes = [];
    const sourceWrites = [];
    const reads = [];
    const supabase = {
        from(table) {
            let payload;
            let id;
            return {
                select() { return this; },
                eq(_column, value) { id = value; return this; },
                insert(rows) { payload = rows[0]; return this; },
                then(resolve, reject) {
                    assert.equal(table, 'recipe_sources');
                    sourceWrites.push(structuredClone(payload));
                    return Promise.resolve({ error: null }).then(resolve, reject);
                },
                async single() {
                    assert.equal(table, 'recipes');
                    if (payload) {
                        writes.push(structuredClone(payload));
                        return { data: { ...payload, id: 'copy-id' }, error: null };
                    }
                    reads.push(id);
                    return { data: structuredClone(source), error: readError };
                },
            };
        },
    };
    const supabaseModule = new SyntheticModule(['supabase'], function () {
        this.setExport('supabase', supabase);
    });
    const service = new SourceTextModule(await readFile(new URL('../src/services/recipeService.js', import.meta.url), 'utf8'));
    await service.link(async (specifier) => {
        if (specifier === '../supabase') return supabaseModule;
        assert.equal(specifier, '../utils/normalizeIngredientKey.js');
        const dependency = new SourceTextModule(await readFile(new URL('../src/utils/normalizeIngredientKey.js', import.meta.url), 'utf8'));
        await dependency.link(() => { throw new Error('Unexpected dependency'); });
        return dependency;
    });
    await service.evaluate();
    const recipeService = service.namespace.recipeService;
    recipeService._ensureActiveSession = async () => {};
    return { recipeService, reads, writes, sourceWrites };
}

const user = { id: 'new-owner' };
const baseRecipe = {
    id: 'source-id',
    title: '元の料理',
    description: '料理の説明',
    image: 'https://example.com/recipe.jpg',
    servings: '4',
    course: 'main',
    category: '肉料理',
    country: '日本',
    store_name: 'テスト店',
    tags: ['owner:original-owner', '夕食'],
    recipe_sources: [{ url: 'https://example.com/source' }],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
};

test('duplicating a cached title-only entry preserves normal ingredients, grouped steps and metadata', async () => {
    const source = {
        ...baseRecipe,
        // Skip the separate source-URL write in this case; tested below.
        recipe_sources: [],
        ingredients: [
            { _meta: true, type: 'normal', yieldRate: 0.8, groups: [{ id: 'sauce', name: 'ソース' }], stepGroups: [{ id: 'prep', name: '準備', count: 1 }, { id: 'cook', name: '調理', count: 2 }] },
            { name: '鶏肉', quantity: '400', unit: 'g', cost: '500' },
            { name: '醤油', quantity: '2', unit: '大さじ', groupId: 'sauce' },
        ],
        steps: ['材料を切る', '火にかける', '盛り付ける'],
    };
    const original = structuredClone(source);
    const { recipeService, reads, writes } = await loadService(source);
    const copy = await recipeService.duplicateRecipe({ id: source.id, title: source.title }, user);

    assert.deepEqual(reads, [source.id]);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].ingredients, source.ingredients);
    assert.deepEqual(writes[0].steps, source.steps);
    assert.deepEqual(writes[0].tags, ['夕食', 'owner:new-owner']);
    assert.equal(copy.title, `${source.title} (コピー)`);
    assert.equal(copy.id, 'copy-id');
    for (const key of ['description', 'image', 'servings', 'course', 'category', 'country', 'store_name']) {
        assert.equal(writes[0][key], source[key], key);
    }
    assert.deepEqual(copy.steps.map(step => step.groupId), ['prep', 'cook', 'cook']);
    assert.equal(copy.yieldRate, 0.8);
    assert.equal(copy.storeName, source.store_name);
    assert.equal(writes[0].id, undefined);
    assert.equal(writes[0].created_at, undefined);
    assert.equal(writes[0].updated_at, undefined);
    assert.deepEqual(source, original);
});

test('duplicating bread preserves flour amounts, other ingredients and grouped steps', async () => {
    const source = {
        ...baseRecipe,
        recipe_sources: [],
        ingredients: [
            { _meta: true, type: 'bread', stepGroups: [{ id: 'dough', name: '生地', count: 2 }] },
            { name: '強力粉', quantity: '500', unit: 'g', percentage: '100', _group: 'flour' },
            { name: '水', quantity: '350', unit: 'g', percentage: '70', _group: 'other' },
        ],
        steps: ['こねる', '発酵させる'],
    };
    const { recipeService, writes } = await loadService(source);
    const copy = await recipeService.duplicateRecipe({ id: source.id, title: source.title, ingredients: [], steps: [] }, user);

    assert.deepEqual(writes[0].ingredients, source.ingredients);
    assert.deepEqual(writes[0].steps, source.steps);
    assert.equal(copy.type, 'bread');
    assert.equal(copy.flours[0].quantity, '500');
    assert.equal(copy.breadIngredients[0].quantity, '350');
    assert.deepEqual(copy.steps.map(step => step.groupId), ['dough', 'dough']);
});

test('a source detail read failure rejects duplication before any recipe is saved', async () => {
    const { recipeService, writes } = await loadService(null, new Error('detail unavailable'));
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null };
    try {
        await assert.rejects(recipeService.duplicateRecipe({ id: baseRecipe.id, title: baseRecipe.title }, user), /detail unavailable/);
        assert.deepEqual(writes, []);
    } finally {
        globalThis.localStorage = previousStorage;
    }
});

test('source URL is associated with the new recipe and ungrouped steps remain intact', async () => {
    const source = { ...baseRecipe, ingredients: [{ name: '塩', quantity: '少々' }], steps: ['塩をふる'] };
    const { recipeService, writes, sourceWrites } = await loadService(source);
    const copy = await recipeService.duplicateRecipe({ id: source.id, title: source.title }, user);
    assert.equal(copy.sourceUrl, source.recipe_sources[0].url);
    assert.deepEqual(sourceWrites, [{ recipe_id: copy.id, url: source.recipe_sources[0].url }]);
    assert.deepEqual(writes[0].steps, source.steps);
    assert.deepEqual(writes[0].ingredients.slice(1), source.ingredients);
});
