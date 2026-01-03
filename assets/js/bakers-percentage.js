// ベーカーズパーセンテージ計算UI（粉=100%）
// シンプルで読みやすい実装。%とgは双方向同期。

(function () {
  // Supabaseクライアントの初期化
  let sb;
  if (typeof supabase !== 'undefined') {
    sb = supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);
    
    // データベース接続テスト
    testDatabaseConnection();
  } else {
    console.error('❌ Supabaseクライアントが利用できません');
    // returnを削除して処理を続行
  }

  // データベース接続テスト
  async function testDatabaseConnection() {
    try {
      const { data, error } = await sb.from('bread_recipes').select('count').limit(1);
      if (error) {
        console.error('❌ データベース接続エラー:', error);
        alert('データベース接続に失敗しました: ' + error.message);
      } else {
      }
    } catch (err) {
      console.error('❌ データベース接続テストエラー:', err);
      alert('データベース接続テストに失敗しました: ' + err.message);
    }
  }
  const flourTotalInput = document.getElementById('flourTotal');
  // const piecesInput = document.getElementById('pieces'); // 分割数を削除
  const flourRows = document.getElementById('bpFlourRows');
  const ingRows = document.getElementById('bpIngRows');
  const addFlourRowBtn = document.getElementById('addFlourRowBtn');
  const addIngRowBtn = document.getElementById('addIngRowBtn');
  const resetBtn = document.getElementById('resetBtn');


  const DEFAULT_FLOUR = [
    { name: '粉A', pct: 100, grams: 200 }
  ];
  const DEFAULT_INGS = [
    { name: '水', pct: 65, grams: null },
    { name: '塩', pct: 2, grams: null },
    { name: '砂糖', pct: 5, grams: null },
    { name: '油脂', pct: 3, grams: null },
    { name: 'イースト', pct: 1, grams: null }
  ];

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function renderRow(target, index, row, isFlour) {
    const wrapper = document.createElement('div');
    wrapper.className = 'grid-ingredients';
    wrapper.dataset.index = String(index);

    const name = document.createElement('input');
    name.type = 'text';
    name.value = row.name || '';
    name.placeholder = '材料名';

    const grams = document.createElement('input');
    grams.type = 'number';
    grams.min = '0';
    grams.step = '1';
    grams.className = 'right';
    grams.value = row.grams != null ? String(row.grams) : '';

    const pct = document.createElement('input');
    pct.type = 'text';
    pct.className = 'center';
    pct.value = row.pct != null ? String(row.pct) + '%' : '';
    pct.readOnly = true; // g入力で%を自動計算
    pct.style.background = 'transparent';
    pct.style.border = 'none';
    pct.style.fontWeight = '600';
    pct.style.textAlign = 'center';

    const del = document.createElement('button');
    del.className = 'btn small';
    del.textContent = '削除';

    // g -> % 同期（標準）
    grams.addEventListener('input', () => {
      // 入力後に全体を再計算
      updateTotals();
      recalcPercentsFromGrams();
    });

    name.addEventListener('input', updateTotals);
    
    // 削除ボタンのイベントリスナー
    del.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // 正しいコンテナを特定
      const rowsContainer = isFlour ? flourRows : ingRows;
      
      if (rowsContainer.contains(wrapper)) {
        rowsContainer.removeChild(wrapper);
        renumber();
        updateTotals();
      } else {
      }
    });

    wrapper.appendChild(name);
    wrapper.appendChild(grams);
    wrapper.appendChild(pct);
    wrapper.appendChild(del);
    (target || ingRows).appendChild(wrapper);

    // パーセント表示は後で計算されるため、ここでは設定しない
  }

  function renumber() {
    // 番号表示を削除したため、この関数は不要
  }

  function getRows(container) {
    return Array.from(container.children).map(row => {
      const inputs = row.querySelectorAll('input');
      // パーセント値から%記号を除去してから数値化
      const pctValue = inputs[2]?.value?.replace('%', '') || '';
      return {
        name: inputs[0]?.value?.trim() || '',
        grams: toNumber(inputs[1]?.value, 0),
        pct: toNumber(pctValue, 0)
      };
    });
  }

  function updateTotals() {
    // 総重量を計算（粉 + 材料）
    const flour = toNumber(flourTotalInput.value, 0);
    let totalWeight = 0;
    
    // 粉の重量を合計
    getRows(flourRows).forEach(r => {
      if (r.name.trim()) {
        totalWeight += toNumber(r.grams, 0);
      }
    });
    
    // 材料の重量を合計
    getRows(ingRows).forEach(r => {
      if (r.name.trim()) {
        totalWeight += toNumber(r.grams, 0);
      }
    });
    
    // 総重量を更新
    if (totalWeight > 0) {
      flourTotalInput.value = String(totalWeight);
    }
    
  }

  function addFlourRow(data = { name: '', pct: 100, grams: 0 }) {
    renderRow(flourRows, flourRows.children.length, data, true);
  }
  function addIngRow(data = { name: '', pct: 0, grams: 0 }) {
    renderRow(ingRows, ingRows.children.length, data, false);
  }

  function resetRows() {
    flourRows.innerHTML = '';
    ingRows.innerHTML = '';
    DEFAULT_FLOUR.forEach(r => addFlourRow(r));
    DEFAULT_INGS.forEach(r => addIngRow(r));
    syncFlourToRows();
    updateTotals();
  }

  function recalcPercentsFromGrams() {
    // 粉類の合計を計算
    let totalFlour = 0;
    Array.from(flourRows.children).forEach(row => {
      const inputs = row.querySelectorAll('input');
      const name = inputs[0]?.value?.trim() || '';
      if (name) {
        const grams = toNumber(inputs[1]?.value, 0);
        totalFlour += grams;
      }
    });

    // 粉行の処理：ベーカーズパーセント = (各粉のg / 粉の合計) × 100
    Array.from(flourRows.children).forEach(row => {
      const inputs = row.querySelectorAll('input');
      const name = inputs[0]?.value?.trim() || '';
      if (name && totalFlour > 0) {
        const grams = toNumber(inputs[1]?.value, 0);
        inputs[2].value = (grams / totalFlour * 100).toFixed(1) + '%';
      } else {
        inputs[2].value = '0.0%';
      }
    });

    // 材料行の処理：ベーカーズパーセント = (各材料のg / 粉の合計) × 100
    // ※材料も粉の合計に対する比率で計算します
    Array.from(ingRows.children).forEach(row => {
      const inputs = row.querySelectorAll('input');
      const name = inputs[0]?.value?.trim() || '';
      if (name && totalFlour > 0) {
        const grams = toNumber(inputs[1]?.value, 0);
        inputs[2].value = (grams / totalFlour * 100).toFixed(1) + '%';
      } else {
        inputs[2].value = '0.0%';
      }
    });
  }

  function syncFlourToRows() {
    // 粉総量変更時は各行の%のみ再計算
    recalcPercentsFromGrams();
  }

  // 保存・読み込み・クリア機能
  document.getElementById('saveBreadRecipeBtn')?.addEventListener('click', saveBreadRecipe);
  document.getElementById('loadBreadRecipeBtn')?.addEventListener('click', loadBreadRecipe);
  document.getElementById('clearBreadRecipeBtn')?.addEventListener('click', clearBreadRecipe);

  // init
  addFlourRowBtn.addEventListener('click', () => { addFlourRow(); updateTotals(); recalcPercentsFromGrams(); });
  addIngRowBtn.addEventListener('click', () => { addIngRow(); updateTotals(); recalcPercentsFromGrams(); });
  resetBtn.addEventListener('click', resetRows);
  flourTotalInput.addEventListener('input', () => { syncFlourToRows(); updateTotals(); });
  // piecesInput.addEventListener('input', updateTotals); // 分割数を削除

  resetRows();

  // 編集用レシピIDをチェック
  const editRecipeId = localStorage.getItem('editBreadRecipeId');
  if (editRecipeId) {
    loadBreadRecipeById(editRecipeId);
    localStorage.removeItem('editBreadRecipeId'); // 使用後は削除
  }

  // 保存機能
  async function saveBreadRecipe() {
    try {
      // Supabaseクライアントの確認
      if (!sb) {
        alert('データベース接続が利用できません。ページをリロードしてください。');
        return;
      }

      const title = document.getElementById('breadTitle').value.trim();
      const totalWeight = parseInt(document.getElementById('flourTotal').value) || 500;
      // const pieces = parseInt(document.getElementById('pieces').value) || 1; // 分割数を削除
      const notes = document.getElementById('notes').value.trim();

      if (!title) {
        alert('レシピ名を入力してください');
        return;
      }

      // 粉データを取得
      const flourData = getRows(flourRows).filter(r => r.name.trim());
      const ingredientData = getRows(ingRows).filter(r => r.name.trim());

      if (flourData.length === 0) {
        alert('粉を1つ以上入力してください');
        return;
      }

      // メインレシピを保存
      const { data: recipe, error: recipeError } = await sb
        .from('bread_recipes')
        .insert({
          title,
          flour_total_g: totalWeight,
          pieces: 1, // デフォルト値
          notes
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      // 粉データを保存
      if (flourData.length > 0) {
        const flourPayload = flourData.map((r, index) => ({
          bread_recipe_id: recipe.id,
          flour_name: r.name,
          percentage: 100.0,
          grams: parseInt(r.grams) || 0,
          position: index + 1
        }));

        const { error: flourError } = await sb
          .from('bread_recipe_flours')
          .insert(flourPayload);

        if (flourError) throw flourError;
      }

      // 材料データを保存
      if (ingredientData.length > 0) {
        const ingredientPayload = ingredientData.map((r, index) => ({
          bread_recipe_id: recipe.id,
          ingredient_name: r.name,
          percentage: parseFloat(r.pct) || 0,
          grams: parseInt(r.grams) || 0,
          position: index + 1
        }));

        const { error: ingredientError } = await sb
          .from('bread_recipe_ingredients')
          .insert(ingredientPayload);

        if (ingredientError) throw ingredientError;
      }

      alert('パン用レシピを保存しました！');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + error.message);
    }
  }

  // ID指定でレシピを読み込み
  async function loadBreadRecipeById(recipeId) {
    try {
      // Supabaseクライアントの確認
      if (!sb) {
        alert('データベース接続が利用できません。ページをリロードしてください。');
        return;
      }


      // レシピデータを取得
      const { data: recipe, error: recipeError } = await sb
        .from('bread_recipes')
        .select('*')
        .eq('id', recipeId)
        .single();

      if (recipeError) throw recipeError;

      // 基本情報を設定
      document.getElementById('breadTitle').value = recipe.title;
      document.getElementById('flourTotal').value = recipe.flour_total_g;
      document.getElementById('notes').value = recipe.notes || '';

      // 粉データを読み込み
      const { data: flours } = await sb
        .from('bread_recipe_flours')
        .select('*')
        .eq('bread_recipe_id', recipe.id)
        .order('position');

      // 材料データを読み込み
      const { data: ingredients } = await sb
        .from('bread_recipe_ingredients')
        .select('*')
        .eq('bread_recipe_id', recipe.id)
        .order('position');

      // 粉行をクリアして再構築
      flourRows.innerHTML = '';
      flours.forEach(flour => {
        addFlourRow({
          name: flour.flour_name,
          pct: 100.0,
          grams: flour.grams
        });
      });

      // 材料行をクリアして再構築
      ingRows.innerHTML = '';
      ingredients.forEach(ingredient => {
        addIngRow({
          name: ingredient.ingredient_name,
          pct: ingredient.percentage,
          grams: ingredient.grams
        });
      });

      updateTotals();
      recalcPercentsFromGrams(); // パーセンテージを正しく再計算
      alert('レシピを読み込みました！');
    } catch (error) {
      console.error('読み込みエラー:', error);
      alert('読み込みに失敗しました: ' + error.message);
    }
  }

  // 読み込み機能
  async function loadBreadRecipe() {
    try {
      // Supabaseクライアントの確認
      if (!sb) {
        alert('データベース接続が利用できません。ページをリロードしてください。');
        return;
      }

      const recipeId = prompt('読み込むレシピのIDを入力してください:');
      if (!recipeId) return;

      // レシピデータを取得
      const { data: recipe, error: recipeError } = await sb
        .from('bread_recipes')
        .select('*')
        .eq('id', recipeId)
        .single();

      if (recipeError) throw recipeError;

      // 基本情報を設定
      document.getElementById('breadTitle').value = recipe.title;
      document.getElementById('flourTotal').value = recipe.flour_total_g;
      // document.getElementById('pieces').value = recipe.pieces; // 分割数を削除
      document.getElementById('notes').value = recipe.notes || '';

      // 粉データを読み込み
      const { data: flours } = await sb
        .from('bread_recipe_flours')
        .select('*')
        .eq('bread_recipe_id', recipe.id)
        .order('position');

      // 材料データを読み込み
      const { data: ingredients } = await sb
        .from('bread_recipe_ingredients')
        .select('*')
        .eq('bread_recipe_id', recipe.id)
        .order('position');

      // 粉行をクリアして再構築
      flourRows.innerHTML = '';
      flours.forEach(flour => {
        addFlourRow({
          name: flour.flour_name,
          pct: 100.0,
          grams: flour.grams
        });
      });

      // 材料行をクリアして再構築
      ingRows.innerHTML = '';
      ingredients.forEach(ingredient => {
        addIngRow({
          name: ingredient.ingredient_name,
          pct: ingredient.percentage,
          grams: ingredient.grams
        });
      });

      updateTotals();
      recalcPercentsFromGrams(); // パーセンテージを正しく再計算
      alert('レシピを読み込みました！');
    } catch (error) {
      console.error('読み込みエラー:', error);
      alert('読み込みに失敗しました: ' + error.message);
    }
  }

  // クリア機能
  function clearBreadRecipe() {
    if (confirm('すべてのデータをクリアしますか？')) {
      document.getElementById('breadTitle').value = '';
      document.getElementById('flourTotal').value = '500';
      // document.getElementById('pieces').value = '1'; // 分割数を削除
      document.getElementById('notes').value = '';
      resetRows();
    }
  }
})();


