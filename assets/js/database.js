// データベース操作関連の機能

// Supabaseクライアントの取得は utils.js で定義済み

// レシピデータの取得
async function getRecipe(id) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.from('recipes').select('*').eq('id', id).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  } catch (error) {
    errorLog('レシピ取得エラー:', error);
    return null;
  }
}

// レシピ材料の取得（JSONB形式）
async function getRecipeIngredients(recipeId) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('recipes')
      .select('ingredients')
      .eq('id', recipeId)
      .single();
    if (error) throw error;
    return data?.ingredients || [];
  } catch (error) {
    errorLog('材料取得エラー:', error);
    return [];
  }
}

// レシピ手順の取得（JSONB形式）
async function getRecipeSteps(recipeId) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('recipes')
      .select('steps')
      .eq('id', recipeId)
      .single();
    if (error) throw error;
    return data?.steps || [];
  } catch (error) {
    errorLog('手順取得エラー:', error);
    return [];
  }
}

// 翻訳レシピデータの取得
async function getTranslationRecipes(originalRecipeId) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('translation_recipes')
      .select('*')
      .eq('original_recipe_id', originalRecipeId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('relation "translation_recipes" does not exist')) {
        debugLog('translation_recipesテーブルが存在しません。create_translation_recipe_tables.sqlを実行してください。');
        return null;
      } else if (error.code === 'PGRST200') {
        debugLog('translation_recipesテーブルの関係性に問題があります。テーブル構造を確認してください。');
        return null;
      } else {
        throw error;
      }
    }
    
    return data;
  } catch (error) {
    errorLog('翻訳レシピ取得エラー:', error);
    return null;
  }
}

// 翻訳材料データの取得
async function getTranslationIngredients(translationRecipeId) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('translation_recipe_ingredients')
      .select('*')
      .eq('translation_recipe_id', translationRecipeId)
      .order('position', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    errorLog('翻訳材料取得エラー:', error);
    return [];
  }
}

// 翻訳手順データの取得
async function getTranslationSteps(translationRecipeId) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('translation_recipe_steps')
      .select('*')
      .eq('translation_recipe_id', translationRecipeId)
      .order('position', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    errorLog('翻訳手順取得エラー:', error);
    return [];
  }
}

// レシピの保存
async function saveRecipe(recipeData) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('recipes')
      .insert(recipeData)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    errorLog('レシピ保存エラー:', error);
    throw error;
  }
}

// レシピの更新
async function updateRecipe(id, updateData) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('recipes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    errorLog('レシピ更新エラー:', error);
    throw error;
  }
}

// 材料の保存（JSONB形式でrecipesテーブルに保存）
async function saveIngredients(recipeId, ingredients) {
  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('recipes')
      .update({ ingredients: ingredients })
      .eq('id', recipeId);
    if (error) throw error;
    return true;
  } catch (error) {
    errorLog('材料保存エラー:', error);
    throw error;
  }
}

// 手順の保存（JSONB形式でrecipesテーブルに保存）
async function saveSteps(recipeId, steps) {
  try {
    console.log('📋 saveSteps呼び出し:', { recipeId, stepsCount: steps.length, steps });
    
    // 空の手順配列の場合はデフォルト手順を追加
    if (!steps || steps.length === 0) {
      steps = [{ step: '手順を入力してください' }];
    }
    
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('recipes')
      .update({ steps: steps })
      .eq('id', recipeId);
    if (error) {
      console.error('📋 手順保存Supabaseエラー詳細:', {
        error: error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    console.log('📋 手順保存成功');
    return true;
  } catch (error) {
    console.error('📋 手順保存キャッチエラー:', error);
    errorLog('手順保存エラー:', error);
    throw error;
  }
}

// レシピの削除
async function deleteRecipe(id) {
  try {
    // 関連データも削除される（CASCADE設定）
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('recipes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (error) {
    errorLog('レシピ削除エラー:', error);
    throw error;
  }
}

// 材料の削除（JSONB形式のため、空配列で更新）
async function deleteIngredients(recipeId) {
  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('recipes')
      .update({ ingredients: [] })
      .eq('id', recipeId);
    if (error) throw error;
    return true;
  } catch (error) {
    errorLog('材料削除エラー:', error);
    throw error;
  }
}

// 手順の削除（JSONB形式のため、空配列で更新）
async function deleteSteps(recipeId) {
  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('recipes')
      .update({ steps: [] })
      .eq('id', recipeId);
    if (error) throw error;
    return true;
  } catch (error) {
    errorLog('手順削除エラー:', error);
    throw error;
  }
}

// 翻訳レシピの保存
async function saveTranslationRecipe(translationData) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('translation_recipes')
      .insert(translationData)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    errorLog('翻訳レシピ保存エラー:', error);
    throw error;
  }
}

// 翻訳材料の保存
async function saveTranslationIngredients(translationRecipeId, ingredients) {
  try {
    const ingredientsData = ingredients.map((ing, index) => ({
      translation_recipe_id: translationRecipeId,
      position: index + 1,
      translated_item: ing.translated_item || '',
      original_item: ing.original_item || '',
      quantity: ing.quantity || '',
      unit: ing.unit || ''
    }));
    
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('translation_recipe_ingredients')
      .insert(ingredientsData);
    if (error) throw error;
    return true;
  } catch (error) {
    errorLog('翻訳材料保存エラー:', error);
    throw error;
  }
}

// 翻訳手順の保存
async function saveTranslationSteps(translationRecipeId, steps) {
  try {
    const stepsData = steps.map((step, index) => ({
      translation_recipe_id: translationRecipeId,
      position: index + 1,
      translated_instruction: step.translated_instruction || '',
      original_instruction: step.original_instruction || ''
    }));
    
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('translation_recipe_steps')
      .insert(stepsData);
    if (error) throw error;
    return true;
  } catch (error) {
    errorLog('翻訳手順保存エラー:', error);
    throw error;
  }
}

// レシピ一覧の取得
async function getRecipes(filters = {}) {
  try {
    const sb = getSupabaseClient();
    let query = sb.from('recipes').select('*');
    
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }
    
    query = query.order('created_at', { ascending: false });
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    errorLog('レシピ一覧取得エラー:', error);
    return [];
  }
}

// カテゴリー一覧の取得
async function getCategories() {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('recipes')
      .select('category')
      .not('category', 'is', null);
    if (error) throw error;
    
    const categories = [...new Set(data.map(item => item.category))].filter(Boolean);
    return categories.sort();
  } catch (error) {
    errorLog('カテゴリー取得エラー:', error);
    return [];
  }
}

// タグ一覧の取得
async function getTags() {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('recipes')
      .select('tags')
      .not('tags', 'is', null);
    if (error) throw error;
    
    const allTags = data.flatMap(item => item.tags || []);
    const uniqueTags = [...new Set(allTags)].filter(Boolean);
    return uniqueTags.sort();
  } catch (error) {
    errorLog('タグ取得エラー:', error);
    return [];
  }
}

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getRecipe,
    getRecipeIngredients,
    getRecipeSteps,
    getTranslationRecipes,
    getTranslationIngredients,
    getTranslationSteps,
    saveRecipe,
    updateRecipe,
    saveIngredients,
    saveSteps,
    deleteRecipe,
    deleteIngredients,
    deleteSteps,
    saveTranslationRecipe,
    saveTranslationIngredients,
    saveTranslationSteps,
    getRecipes,
    getCategories,
    getTags
  };
}
