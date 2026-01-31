
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sampleRecipe = {
    title: 'サンプルフレンチ・ディナー (Step Groups)',
    description: '作り方のグループ分けをテストするためのレシピ。',
    image: null,
    servings: 2,
    course: '主菜',
    category: '洋食',
    storeName: 'MARUGO-TEST',
    ingredientGroups: [
        { id: 'g1', name: 'ソース' },
        { id: 'g2', name: 'メイン' },
        { id: 'g3', name: '付け合わせ' }
    ],
    ingredients: [
        { id: 'i1', name: '赤ワイン', quantity: '100', unit: 'ml', groupId: 'g1', purchaseCost: '1500', cost: '200' },
        { id: 'i2', name: 'エシャロット', quantity: '1', unit: '個', groupId: 'g1', purchaseCost: '100', cost: '100' },
        { id: 'i3', name: '牛フィレ肉', quantity: '200', unit: 'g', groupId: 'g2', purchaseCost: '5000', cost: '2500' },
        { id: 'i4', name: '塩', quantity: '2', unit: 'g', groupId: 'g2', purchaseCost: '100', cost: '1' },
        { id: 'i5', name: '胡椒', quantity: '1', unit: 'g', groupId: 'g2', purchaseCost: '200', cost: '2' },
        { id: 'i6', name: 'アスパラガス', quantity: '3', unit: '本', groupId: 'g3', purchaseCost: '300', cost: '150' }
    ],
    stepGroups: [
        { id: 'sg1', name: 'ソース作り' },
        { id: 'sg2', name: '仕上げ' }
    ],
    steps: [
        { text: 'エシャロットをみじん切りにし、赤ワインと共に鍋に入れて半量になるまで煮詰める。', groupId: 'sg1' },
        { text: '煮詰まったら濾して、塩胡椒で味を調える。', groupId: 'sg1' },
        { text: '牛肉は常温に戻し、塩胡椒をする。', groupId: 'sg2' },
        { text: 'フライパンを熱し、牛肉を好みの焼き加減で焼く。', groupId: 'sg2' },
        { text: 'アスパラガスは茹でて添え、ソースをかける。', groupId: 'sg2' }
    ],
    tags: ['洋食', '主菜', 'ディナー', 'Test']
};

const toDbFormat = (recipe) => {
    let ingredientsToSave = recipe.ingredients || [];

    // Meta construction
    const metaItem = { _meta: true, type: 'normal' };

    if (recipe.ingredientGroups && recipe.ingredientGroups.length > 0) {
        metaItem.groups = recipe.ingredientGroups;
    }

    if (recipe.stepGroups && recipe.stepGroups.length > 0) {
        // Calculate counts
        const steps = recipe.steps || [];
        metaItem.stepGroups = recipe.stepGroups.map(g => ({
            ...g,
            count: steps.filter(s => s.groupId === g.id).length
            // NOTE: We only store { id, name, count }
        }));
    }

    // Clean ingredients (remove UI IDs if needed, keeping simple here)
    const cleanedIngs = ingredientsToSave.map(({ id, ...rest }) => ({ ...rest, groupId: rest.groupId }));
    ingredientsToSave = [metaItem, ...cleanedIngs];

    // Steps: map to string array
    const stepsToSave = (recipe.steps || []).map(s => typeof s === 'string' ? s : s.text);

    return {
        title: recipe.title,
        description: recipe.description,
        image: recipe.image,
        servings: recipe.servings,
        course: recipe.course,
        category: recipe.category,
        store_name: recipe.storeName,
        ingredients: ingredientsToSave,
        steps: stepsToSave,
        tags: recipe.tags
    };
};

async function addRecipe() {
    console.log('Adding sample recipe with Step Groups...');
    const payload = toDbFormat(sampleRecipe);

    const { data, error } = await supabase
        .from('recipes')
        .insert([payload])
        .select()
        .single();

    if (error) {
        console.error('Error adding recipe:', error);
    } else {
        console.log('Successfully added sample recipe:', data.title);
        console.log('ID:', data.id);
    }
}

addRecipe();
