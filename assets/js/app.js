/* global document, window, localStorage, Blob, URL */
(function(){
  window.addEventListener('error', (e)=>{
    try { alert('エラー: ' + (e && e.message ? e.message : '不明なエラー')); } catch(_) {}
    console.error('Global error', e);
  });
  const STORAGE_KEY = 'recipeBox.v1';
  const UI_KEY = 'recipeBox.ui.v1';

  const nowIso = () => new Date().toISOString();
  const generateId = () => 'r_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-6);
  const qs = (s) => document.querySelector(s);

  function saveAll(recipes) { localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes)); }
  function loadAll() {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return []; const data = JSON.parse(raw); return Array.isArray(data) ? data : []; } catch { return []; }
  }
  function formatDate(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function escapeHtml(str){ return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
  function escapeAttr(str){ return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }

  // Ingredients helpers (name + amount)
  function normalizeIngredients(arr){
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
      if (item && typeof item === 'object') {
        return { name: String(item.name || '').trim(), amount: String(item.amount || '').trim() };
      }
      const s = String(item || '').trim();
      return { name: s, amount: '' };
    });
  }
  function displayIngredient(ing){
    const name = String(ing && ing.name != null ? ing.name : '').trim();
    const amount = String(ing && ing.amount != null ? ing.amount : '').trim();
    return amount ? `${name} ${amount}` : name;
  }
  function normalizeRecipes(recipes){
    return (recipes || []).map(r => ({
      ...r,
      ingredients: normalizeIngredients(r.ingredients),
    }));
  }

  const uiInit = loadUi();
  const initialRecipes = normalizeRecipes(loadAll());
  let state = {
    recipes: initialRecipes, selectedId: null, searchText: '', tagFilter: '',
    viewMode: uiInit.viewMode || 'edit', fontScale: uiInit.fontScale || 1, theme: uiInit.theme || 'light',
    sortBy: 'updated', onlyFav: false, route: 'recipes'
  };

  function setState(patch){
    state = { ...state, ...patch };
    if (patch && ('viewMode' in patch || 'fontScale' in patch || 'theme' in patch)){
      saveUi({ viewMode: state.viewMode, fontScale: state.fontScale, theme: state.theme });
      applyUiScale(); applyTheme();
    }
    render(); renderRoute();
  }
  function applyUiScale(){
  // CSS variable for modern styles
  document.documentElement.style.setProperty('--fs', state.fontScale);
  // Also set root font-size so rem-based (and some UA default) sizes scale
  var base = Math.round(16 * state.fontScale);
  document.documentElement.style.fontSize = base + 'px';
}
  function renderRoute(){
    ['home','recipes','fav','settings'].forEach(v=>{ const el = qs(`#view-${v}`); if (el) el.style.display = state.route===v? '':'none'; });
    if (state.route==='home') renderHome();
    if (state.route==='recipes') render();
    if (state.route==='fav') renderFav();
    if (state.route==='settings') renderSettings();
  }
  function renderHome(){
    const statsEl = qs('#homeStats'); const total = state.recipes.length; const fav = state.recipes.filter(r=>r.favorite).length; const tags = Object.keys(getTagCounts(state.recipes)).length;
    statsEl.innerHTML = `<div>合計レシピ: <b>${total}</b> 件 ／ お気に入り: <b>${fav}</b> 件 ／ タグ種類: <b>${tags}</b></div>`;
    const recentEl = qs('#homeRecent'); const recent = [...state.recipes].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,10);
    recentEl.innerHTML = recent.map(r => `<div class="card" data-id="${r.id}"><div class="t">${escapeHtml(r.title||'無題のレシピ')}</div><div class="meta">更新: ${formatDate(r.updatedAt)}</div></div>`).join('') || '<div class="empty">まだレシピがありません</div>';
    recentEl.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=> setState({ selectedId: c.getAttribute('data-id'), route: 'recipes' })));
  }

  // CRUD
  function createRecipe(){
    const recipe = { id: generateId(), title: '', tags: [], ingredients: [], steps: [], image: null, createdAt: nowIso(), updatedAt: nowIso() };
    const recipes = [recipe, ...state.recipes];
    saveAll(recipes);
    // 新規作成時は編集モード・レシピ画面へ遷移してタイトルへフォーカス
    setState({ recipes, selectedId: recipe.id, viewMode: 'edit', route: 'recipes' });
    setTimeout(()=>{
      const t = document.querySelector('#fTitle');
      if (t) { try { t.focus(); t.select(); } catch(_){} }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  }
  function updateRecipe(id, patch){
    const recipes = state.recipes.map(r => r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r);
    saveAll(recipes);
    setState({ recipes });
  }
  function deleteRecipe(id){
    const target = state.recipes.find(r => r.id === id);
    if (!target) return;
    if (!window.confirm(`「${target.title || '無題のレシピ'}」を削除しますか？`)) return;
    const recipes = state.recipes.filter(r => r.id !== id);
    const nextSelected = state.selectedId === id ? (recipes[0]?.id || null) : state.selectedId;
    saveAll(recipes);
    setState({ recipes, selectedId: nextSelected });
  }
  function renderSettings(){ const el = qs('#sThemeLabel'); if (el) el.textContent = state.theme==='dark'?'ダーク':'ライト'; }
  function renderFav(){ const favEl = qs('#favList'); const favs = state.recipes.filter(r=>r.favorite);
    favEl.innerHTML = favs.map(r=>`<div class="card" data-id="${r.id}"><div class="t">${escapeHtml(r.title||'無題のレシピ')}</div><div class="meta">更新: ${formatDate(r.updatedAt)} ${r.tags.length?'・ '+r.tags.map(t=>`<span class=tag>${escapeHtml(t)}</span>`).join(' '):''}</div></div>`).join('') || '<div class="empty">お気に入りがありません</div>';
    favEl.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=> setState({ selectedId: c.getAttribute('data-id'), route: 'recipes' })));
  }
  function render(){
    const listEl = qs('#list'); const detailEl = qs('#detail');
    const btnToggleMode = qs('#btnToggleMode'); if (btnToggleMode) btnToggleMode.textContent = state.viewMode==='edit'?'調理モード':'編集モード';
    const btnTheme = qs('#btnTheme'); if (btnTheme) btnTheme.textContent = state.theme==='dark'?'ダーク':'ライト';
    const q = state.searchText.trim().toLowerCase();
    const filtered = state.recipes.filter(r => {
      const ingredientText = (r.ingredients || []).map(displayIngredient).join('\n');
      const matchesText = !q || [r.title, r.tags.join(','), ingredientText, r.steps.join('\n')].join('\n').toLowerCase().includes(q);
      return matchesText;
    }).sort((a,b)=> new Date(b.updatedAt)-new Date(a.updatedAt));
    if (!q) listEl.innerHTML = '<div class="empty">キーワードを入力すると結果が表示されます。</div>';
    else if (filtered.length===0) listEl.innerHTML = '<div class="empty">該当するレシピが見つかりませんでした。</div>';
    else listEl.innerHTML = filtered.map(r=>`<div class="card ${r.id===state.selectedId?'active':''}" data-id="${r.id}"><div class="t">${escapeHtml(r.title||'無題のレシピ')}</div><div class="meta">更新: ${formatDate(r.updatedAt)} ${r.tags.length?'・ '+r.tags.map(t=>`<span class=tag>${escapeHtml(t)}</span>`).join(' '):''}</div></div>`).join('');
    listEl.querySelectorAll('.card').forEach(card => card.addEventListener('click', ()=> setState({ selectedId: card.getAttribute('data-id') })));

    const selected = state.recipes.find(r=> r.id===state.selectedId);
    if (!selected){ detailEl.innerHTML = '<div class="empty">左の一覧からレシピを選ぶか「＋ 新規レシピ」を押してください。</div>'; return; }
    if (state.viewMode==='edit'){
      detailEl.innerHTML = `
        <div class="field"><label>タイトル</label><input type="text" id="fTitle" placeholder="例: 具だくさん味噌汁" value="${escapeAttr(selected.title)}" /></div>
        <div class="field"><label>タグ（カンマ区切り）</label><input type="text" id="fTags" placeholder="例: 和食, スープ, 10分" value="${escapeAttr(selected.tags.join(', '))}" /><div class="help">検索時の絞り込みに使えます</div></div>
        <div class="field"><label>画像（1枚まで）</label><div class="imgwrap">${selected.image?`<img src="${escapeAttr(selected.image)}" alt="recipe" />`:'<div class="help">まだ画像がありません</div>'}</div><div class="imgtools"><input type="file" id="fImage" accept="image/*" />${selected.image?'<button class="btn danger" id="btnRemoveImg">画像を削除</button>':''}</div></div>
        <div class="field"><label>材料（名前と分量）</label>
          <div id="ingList" class="inglist">
            ${(selected.ingredients||[]).map((ing,i)=>`
              <div class="ingrow">
                <input class="ing-name" type="text" placeholder="材料名" value="${escapeAttr(ing.name)}" />
                <input class="ing-amount" type="text" placeholder="分量" value="${escapeAttr(ing.amount)}" />
                <button class="btn small ing-del" data-idx="${i}">削除</button>
              </div>
            `).join('')}
          </div>
          <div class="row"><button class="btn" id="btnAddIngr">材料を追加</button></div>
        </div>
        <div class="field"><label>手順（1行につき1つ）</label><textarea id="fSteps">${escapeHtml(selected.steps.join('\n'))}</textarea></div>
        <div class="row"><button class="btn primary" id="btnSave">保存</button><button class="btn" id="btnShare">テキストをコピー</button><button class="btn" id="btnDuplicate">複製</button><button class="btn danger" id="btnDelete">削除</button><span class="help">作成: ${formatDate(selected.createdAt)} ／ 最終更新: ${formatDate(selected.updatedAt)} ／ お気に入り: ${selected.favorite?'★':'☆'}</span></div>`;
      qs('#btnSave').addEventListener('click', ()=> saveDetail(selected.id, true));
      qs('#btnDelete').addEventListener('click', ()=> deleteRecipe(selected.id));
      qs('#btnShare').addEventListener('click', ()=> copyRecipeText(selected));
      qs('#btnDuplicate').addEventListener('click', ()=> duplicateRecipe(selected.id));
      ['fTitle','fTags','fSteps'].forEach(id=>{ const el = qs('#'+id); if (el) el.addEventListener('change', ()=> saveDetail(selected.id)); });
      const ingListEl = qs('#ingList');
      function wireIngRowEvents(){
        ingListEl.querySelectorAll('.ing-del').forEach(btn => btn.addEventListener('click', (e)=>{ e.preventDefault(); const idx = Number(btn.getAttribute('data-idx')); const arr = Array.from(ingListEl.querySelectorAll('.ingrow')); if (arr[idx]) arr[idx].remove(); saveDetail(selected.id); }));
        ingListEl.querySelectorAll('.ing-name, .ing-amount').forEach(inp => inp.addEventListener('change', ()=> saveDetail(selected.id)));
      }
      wireIngRowEvents();
      const btnAddIngr = qs('#btnAddIngr');
      if (btnAddIngr) btnAddIngr.addEventListener('click', (e)=>{ e.preventDefault(); const div = document.createElement('div'); div.className='ingrow'; div.innerHTML = '<input class="ing-name" type="text" placeholder="材料名" /> <input class="ing-amount" type="text" placeholder="分量" /> <button class="btn small ing-del">削除</button>'; ingListEl.appendChild(div); wireIngRowEvents(); saveDetail(selected.id); });
      const fImage = qs('#fImage'); if (fImage){ fImage.addEventListener('change', async (e)=>{ const file = e.target.files?.[0]; if (file){ const dataUrl = await fileToDataUrl(file); updateRecipe(selected.id, { image: dataUrl }); } e.target.value=''; }); }
      const btnRemoveImg = qs('#btnRemoveImg'); if (btnRemoveImg) btnRemoveImg.addEventListener('click', ()=> updateRecipe(selected.id, { image: null }));
    } else {
      const tagsHtml = selected.tags.length? selected.tags.map(t=>`<span class=tag>${escapeHtml(t)}</span>`).join(' '):'<span class="help">タグなし</span>';
      detailEl.innerHTML = `<div class="cook"><div class="rtitle">${escapeHtml(selected.title||'無題のレシピ')}</div>${selected.image?`<div class="imgwrap" style="margin:6px 0 10px"><img src="${escapeAttr(selected.image)}" alt="recipe" /></div>`:''}<div class="rtags">${tagsHtml}</div><div class="twocol"><div><div class="section-title">材料</div><div class="checklist">${(selected.ingredients||[]).map(x=>`<label class="checkitem"><input type="checkbox" /><div class="txt">${escapeHtml(displayIngredient(x))}</div></label>`).join('') || '<div class="help">材料が未入力です</div>'}</div></div><div><div class="section-title">手順</div><div class="checklist steps">${selected.steps.map((x,i)=>`<label class="checkitem"><input type="checkbox" /><div class="txt"><span class="num">${i+1}</span>${escapeHtml(x)}</div></label>`).join('') || '<div class="help">手順が未入力です</div>'}</div></div></div><div class="row" style="margin-top:6px;"><button class="btn" id="btnBackToEdit">編集モード</button><button class="btn" id="btnShare">テキストをコピー</button><button class="btn" id="btnPrint">印刷</button></div></div>`;
      qs('#btnBackToEdit').addEventListener('click', ()=> setState({ viewMode: 'edit' }));
      qs('#btnShare').addEventListener('click', ()=> copyRecipeText(selected));
      qs('#btnPrint').addEventListener('click', ()=> window.print());
    }
  }

  function saveDetail(id, notify){
    const title = (qs('#fTitle')?.value || '').trim();
    const tags = (qs('#fTags')?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
    const steps = (qs('#fSteps')?.value || '').split('\n').map(s=>s.trim()).filter(Boolean);
    // collect ingredients from rows
    const ingRows = Array.from(document.querySelectorAll('#ingList .ingrow'));
    const ingredients = ingRows.length ? ingRows.map(row => ({
      name: (row.querySelector('.ing-name')?.value || '').trim(),
      amount: (row.querySelector('.ing-amount')?.value || '').trim(),
    })).filter(x => x.name || x.amount) : normalizeIngredients(([]));
    updateRecipe(id, { title, tags, ingredients, steps });
    if (notify) toast('保存しました');
  }
  function copyRecipeText(r){ const text = `【${r.title||'無題のレシピ'}】\n\nタグ: ${r.tags.join(', ')}\n\n[材料]\n${r.ingredients.map(x=>`- ${x}`).join('\n')}\n\n[手順]\n${r.steps.map((x,i)=>`${i+1}. ${x}`).join('\n')}`; navigator.clipboard.writeText(text).then(()=> toast('テキストをコピーしました')); }
  function exportJson(){ const data = JSON.stringify(state.recipes, null, 2); const blob = new Blob([data], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `recipe-box-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); }
  function importJson(file){ const reader = new FileReader(); reader.onload = ()=>{ try { const arr = JSON.parse(reader.result); if (!Array.isArray(arr)) throw new Error('JSONは配列ではありません'); if (!confirm('現在のデータを置き換えます。よろしいですか？')) return; saveAll(arr); setState({ recipes: arr, selectedId: arr[0]?.id || null }); toast('インポートしました'); } catch (e) { alert('読み込みに失敗しました: '+ e.message); } }; reader.readAsText(file); }
  function toast(msg){ const t = document.createElement('div'); t.textContent = msg; t.style.position='fixed'; t.style.left='50%'; t.style.bottom='24px'; t.style.transform='translateX(-50%)'; t.style.padding='10px 14px'; t.style.border='1px solid var(--border)'; t.style.borderRadius='10px'; t.style.background='#0f1117'; t.style.color='var(--text)'; t.style.boxShadow='var(--shadow)'; document.body.appendChild(t); setTimeout(()=> t.remove(), 1500); }
  function loadUi(){ try { const raw = localStorage.getItem(UI_KEY); if (!raw) return { viewMode:'edit', fontScale:1 }; const obj = JSON.parse(raw); return { viewMode: obj.viewMode==='cook'?'cook':'edit', fontScale: typeof obj.fontScale==='number'? obj.fontScale:1, theme: obj.theme==='dark'?'dark':'light' }; } catch { return { viewMode:'edit', fontScale:1, theme:'light' }; } }
  function saveUi(obj){ localStorage.setItem(UI_KEY, JSON.stringify(obj)); }
  function applyTheme(){ const root = document.documentElement; if (state.theme==='dark') root.setAttribute('data-theme','dark'); else root.removeAttribute('data-theme'); }
  function toggleFavorite(id){ const it = state.recipes.find(r=>r.id===id); if (!it) return; updateRecipe(id, { favorite: !it.favorite }); }
  function duplicateRecipe(id){ const it = state.recipes.find(r=>r.id===id); if (!it) return; const copy = { ...it, id: generateId(), title: (it.title||'無題のレシピ') + ' (複製)', createdAt: nowIso(), updatedAt: nowIso() }; const recipes = [copy, ...state.recipes]; saveAll(recipes); setState({ recipes, selectedId: copy.id }); toast('複製しました'); }
  function getTagCounts(recipes){ const map = {}; recipes.forEach(r => r.tags.forEach(t => { const k = String(t).trim(); if (!k) return; map[k] = (map[k]||0)+1; })); return map; }
  function quickAdd(){ const inp = qs('#quickTitle'); const title = inp.value.trim(); if (!title) return; const recipe = { id: generateId(), title, tags: [], ingredients: [], steps: [], image: null, createdAt: nowIso(), updatedAt: nowIso() }; const recipes=[recipe, ...state.recipes]; saveAll(recipes); inp.value=''; setState({ recipes, selectedId: recipe.id }); }
  function fileToDataUrl(file){ return new Promise((resolve,reject)=>{ const reader = new FileReader(); reader.onload = ()=> resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

  // Expose some for settings panel buttons
  window.__recipeBox = { exportJson, importJson, addDummyRecipes, setState };
  function addDummyRecipes(n){
    const tagPool=['和食','洋食','中華','スープ','麺','ご飯','10分','15分','簡単','辛い','甘い','ヘルシー'];
    const ingrPool=['玉ねぎ','にんじん','じゃがいも','鶏肉','豚肉','牛肉','豆腐','わかめ','卵','ほうれん草','トマト','ツナ'];
    const stepPool=['切る','炒める','煮る','茹でる','和える','焼く','味を整える','盛り付ける'];
    const newOnes = Array.from({length:n},(_,i)=>{ const pick=(arr,k)=>Array.from({length:k},()=>arr[Math.floor(Math.random()*arr.length)]); const uniq=a=>[...new Set(a)]; return { id:generateId(), title:`ダミー料理 ${i+1}`, tags:uniq(pick(tagPool,2+Math.floor(Math.random()*2))), ingredients:uniq(pick(ingrPool,4+Math.floor(Math.random()*3))).map(x=>`${x} 適量`), steps:pick(stepPool,3+Math.floor(Math.random()*3)), favorite: Math.random()<0.2, image:null, createdAt:nowIso(), updatedAt:nowIso() }; });
    const recipes = [...newOnes, ...state.recipes]; saveAll(recipes); setState({ recipes, selectedId: recipes[0]?.id || null }); toast(`${n}件追加しました`);
  }

  // Init wiring (runs now or on DOMContentLoaded)
  function on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }
  function init() {
    try {
      // Delegated handlers for ingredients UI
      document.addEventListener('click', function(e){
        // Add ingredient row
        const addBtn = e.target && (e.target.closest && e.target.closest('#btnAddIngr'));
        if (addBtn) {
          const ingListEl = document.querySelector('#ingList');
          if (ingListEl) {
            const div = document.createElement('div');
            div.className = 'ingrow';
            div.innerHTML = '<input class="ing-name" type="text" placeholder="材料名" /> <input class="ing-amount" type="text" placeholder="分量" /> <button class="btn small ing-del" type="button">削除</button>';
            ingListEl.appendChild(div);
            // フォーカスのみ。空行は saveDetail で除外されるため、ここでは保存しない
            const first = div.querySelector('.ing-name');
            if (first) try { first.focus(); } catch(_) {}
          }
          return;
        }
        // Delete row
        const delBtn = e.target && (e.target.closest && e.target.closest('.ing-del'));
        if (delBtn) {
          const row = delBtn.closest('.ingrow');
          if (row) row.remove();
          try { saveDetail(state.selectedId); } catch(_) {}
        }
      });

      
      on(qs('#btnNew'), 'click', createRecipe);
      on(qs('#btnExport'), 'click', exportJson);
      on(qs('#btnImport'), 'click', () => qs('#fileImport') && qs('#fileImport').click());
      on(qs('#fileImport'), 'change', (e)=>{ const file = e.target.files && e.target.files[0]; if (file) importJson(file); e.target.value=''; });
      on(qs('#btnToggleMode'), 'click', ()=> setState({ viewMode: state.viewMode==='edit'?'cook':'edit' }));
      on(qs('#btnSmaller'), 'click', ()=> setState({ fontScale: Math.max(0.9, Math.round((state.fontScale-0.1)*10)/10) }));
      on(qs('#btnLarger'), 'click', ()=> setState({ fontScale: Math.min(1.4, Math.round((state.fontScale+0.1)*10)/10) }));
      on(qs('#btnTheme'), 'click', ()=> setState({ theme: state.theme==='light'?'dark':'light' }));
      on(qs('#btnDummy20'), 'click', ()=> addDummyRecipes(20));
      on(qs('#btnNavHome'), 'click', ()=> setState({ route:'home' }));
      on(qs('#btnNavRecipes'), 'click', ()=> setState({ route:'recipes' }));
      on(qs('#btnNavFav'), 'click', ()=> setState({ route:'fav' }));
      on(qs('#btnNavSettings'), 'click', ()=> setState({ route:'settings' }));
      const searchEl = qs('#search'); on(searchEl, 'input', (e)=> setState({ searchText: e.target.value }));

      // Settings panel
      on(qs('#sExport'), 'click', exportJson);
      on(qs('#sImport'), 'click', ()=> qs('#sFile') && qs('#sFile').click());
      on(qs('#sFile'), 'change', (e)=>{ const f=e.target.files && e.target.files[0]; if (f) importJson(f); e.target.value=''; });
      on(qs('#sDummy'), 'click', ()=> addDummyRecipes(20));
      on(qs('#sTheme'), 'click', ()=> setState({ theme: state.theme==='light'?'dark':'light' }));
      on(qs('#sReset'), 'click', ()=>{ if (confirm('全データを削除しますか？')) { saveAll([]); setState({ recipes: [], selectedId: null }); } });

      // Initial
      applyUiScale(); applyTheme();
      if (state.recipes.length===0) setState({ route: 'home' }); else renderRoute();

      // Keyboard shortcuts
      window.addEventListener('keydown', (e)=>{ if (e.target && ['INPUT','TEXTAREA'].includes(e.target.tagName)) return; if (e.key==='n'){ e.preventDefault(); createRecipe(); } if (e.key==='/'){ e.preventDefault(); const s=qs('#search'); if (s) s.focus(); } if (e.key && e.key.toLowerCase()==='f'){ e.preventDefault(); if (state.selectedId) toggleFavorite(state.selectedId); }});
    } catch (err) {
      console.error('Init error', err);
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


