// app.supabase.js — fixed build (favorites + header buttons + no redeclare bugs)
(function () {
  'use strict';
  // ===== Helpers =====
  const sb = window.sb;
  if (!sb) {
    console.error('[Supabase] client not found. Ensure supabase-js and supabase.init.js are loaded before this script.');
    return;
  }
  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => (s ?? '').toString().replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));

  // ===== Identity (dev-openはclient_id、secureはuser_id) =====
  const identity = { uid: null, client_id: null, rlsMode: 'dev' }; // 'dev' or 'secure'
  (async () => {
    try {
      const { data: { user } } = await sb.auth.getUser();
      identity.uid = user?.id || null;
    } catch {}
    // client_id を常に持つ（secure運用なら未使用）
    identity.client_id = localStorage.getItem('client_id') || (crypto?.randomUUID?.() || String(Math.random()).slice(2));
    localStorage.setItem('client_id', identity.client_id);

    // RLSモード推定：favoritesテーブルに anonymous で insert できるなら dev
    // （最初の判定だけダミーIDで試行し、失敗したら secure とみなす）
    try {
      const dummy = { recipe_id: '00000000-0000-0000-0000-000000000000' };
      const payload = identity.uid ? { ...dummy, user_id: identity.uid } : { ...dummy, client_id: identity.client_id };
      const { error } = await sb.from('favorites').insert(payload);
      if (error) identity.rlsMode = 'secure'; // 失敗=secureの可能性が高い
      // 後始末：ダミーデータは存在しないrecipe_idなので無視される（FKで弾かれる）
    } catch {
      identity.rlsMode = 'secure';
    }
  })();

  // ===== State =====
  const state = {
    list: [],       // all recipes (for recipes view)
    favList: [],    // favorite recipes (for fav view)
    current: null,  // { recipe, ings, steps }
    search: ''
  };

  // ===== Views & Nav =====
  const views = {
    home:     $('#view-home'),
    recipes:  $('#view-recipes'),
    fav:      $('#view-fav'),
    settings: $('#view-settings')
  };
  const navMap = {
    home:     '#btnNavHome',
    recipes:  '#btnNavRecipes',
    fav:      '#btnNavFav',
    settings: '#btnNavSettings'
  };
  function show(view) {
    Object.entries(views).forEach(([k, el]) => { if (el) el.style.display = (k === view) ? '' : 'none'; });
    Object.entries(navMap).forEach(([k, sel]) => {
      const b = $(sel); if (!b) return;
      const on = (k === view);
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    location.hash = '#' + view;
    if (view === 'recipes')  loadAndRender();
    if (view === 'fav')      loadAndRenderFav();
    if (view === 'home')     loadHome();
  }
  $('#btnNavHome')?.addEventListener('click', () => show('home'));
  $('#btnNavRecipes')?.addEventListener('click', () => show('recipes'));
  $('#btnNavFav')?.addEventListener('click', () => show('fav'));
  $('#btnNavSettings')?.addEventListener('click', () => show('settings'));
  window.addEventListener('hashchange', () => {
    const v = (location.hash || '#recipes').slice(1);
    show(['home','recipes','fav','settings'].includes(v) ? v : 'recipes');
  });

  // ===== Query shortcuts =====
  async function fetchRecipesLite(limit = 200) {
    const { data, error } = await sb.from('recipes').select('id,title,tags,updated_at').order('updated_at', { ascending: false }).limit(limit);
    if (error) { console.error(error); return []; }
    return data;
  }
  async function fetchRecipeFull(id) {
    const { data: recipe, error: e1 } = await sb.from('recipes').select('*').eq('id', id).single();
    if (e1) throw e1;
    const { data: ings }  = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position', { ascending: true });
    const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position', { ascending: true });
    return { recipe, ings: ings || [], steps: steps || [] };
  }

  // ===== List (Recipes) =====
  const listEl = $('#list');
  function renderList(items) {
    if (!listEl) return;
    const q = state.search.trim().toLowerCase();
    const filtered = q ? items.filter(r => {
      const tgt = [r.title, ...(r.tags || [])].join(' ').toLowerCase();
      return q.split(/\s+/).every(w => tgt.includes(w));
    }) : items;
    listEl.innerHTML = '';
    if (!filtered.length) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'レシピがありません。「＋ 新規レシピ」で作成します。';
      listEl.appendChild(div);
      return;
    }
    filtered.forEach(r => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="t">${esc(r.title)}</div>
        <div class="meta">${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>
        <div class="meta">${r.updated_at ? '更新: ' + new Date(r.updated_at).toLocaleString('ja-JP', { hour12: false }) : ''}</div>`;
      card.addEventListener('click', () => openRecipe(r.id));
      listEl.appendChild(card);
    });
  }

  async function openRecipe(id) {
    try {
      state.current = await fetchRecipeFull(id);
      renderDetail();
    } catch (e) {
      console.error(e);
      alert('読み込みに失敗: ' + (e?.message || e));
    }
  }

  // ===== Detail =====
  const detailEl = $('#detail');
  function renderDetail() {
    const r = state.current?.recipe;
    const ings = state.current?.ings || [];
    const steps = state.current?.steps || [];
    if (!detailEl) return;
    if (!r) {
      detailEl.innerHTML = `<div class="empty">左の一覧からレシピを選ぶか「＋ 新規レシピ」を押してください。</div>`;
      return;
    }
    detailEl.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="field" style="flex:1"><label>タイトル</label><input id="fTitle" type="text" value="${esc(r.title||'')}" /></div>
        <button id="favToggle" class="btn" title="お気に入り">♡</button>
      </div>
      <div class="twocol">
        <div class="field"><label>分量</label><input id="fYield" type="text" value="${r.yield??''}" /></div>
        <div class="field"><label>単位</label><input id="fYieldUnit" type="text" value="${esc(r.yield_unit||'')}" /></div>
      </div>
      <div class="field"><label>タグ（カンマ区切り）</label><input id="fTags" type="text" value="${(r.tags||[]).join(', ')}" /></div>
      <div class="field"><label>メモ</label><textarea id="fNote">${esc(r.meta?.note||'')}</textarea></div>

      <div class="field"><label>材料</label><div id="ingList" class="inglist"></div><button id="addIng" class="btn small">＋ 材料行</button></div>
      <div class="field"><label>手順</label><div id="stepList" class="inglist"></div><button id="addStep" class="btn small">＋ 手順行</button></div>

      <div class="row"><button id="save" class="btn primary">保存</button><button id="del" class="btn danger">削除</button></div>
    `;
    const ingList = $('#ingList', detailEl);
    const stepList = $('#stepList', detailEl);

    function addIngRow(v = {}) {
      const wrap = document.createElement('div');
      wrap.className = 'ingrow';
      wrap.innerHTML = `
        <input data-k="item" placeholder="材料名 *" value="${esc(v.item||'')}" />
        <input data-k="quantity" placeholder="数量" value="${v.quantity??''}" />
        <div class="row"><input data-k="unit" class="small" placeholder="単位" value="${esc(v.unit||'')}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      wrap.querySelector('[data-act="rm"]').addEventListener('click', () => wrap.remove());
      ingList.appendChild(wrap);
    }
    function addStepRow(v = {}) {
      const wrap = document.createElement('div');
      wrap.className = 'ingrow';
      wrap.innerHTML = `
        <input data-k="instruction" placeholder="手順 *" value="${esc(v.instruction||'')}" />
        <input data-k="timer_sec" placeholder="秒" value="${v.timer_sec??''}" />
        <div class="row"><input data-k="temp_c" class="small" placeholder="℃" value="${v.temp_c??''}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      wrap.querySelector('[data-act="rm"]').addEventListener('click', () => wrap.remove());
      stepList.appendChild(wrap);
    }
    ings.forEach(addIngRow); steps.forEach(addStepRow);
    $('#addIng', detailEl)?.addEventListener('click', () => addIngRow({}));
    $('#addStep', detailEl)?.addEventListener('click', () => addStepRow({}));
    $('#save', detailEl)?.addEventListener('click', saveCurrent);
    $('#del', detailEl)?.addEventListener('click', delCurrent);

    // お気に入りトグル
    (async () => {
      const btn = $('#favToggle', detailEl);
      if (!btn) return;
      let on = await isFav(r.id);
      btn.textContent = on ? '♥' : '♡';
      btn.addEventListener('click', async () => {
        try {
          on = !on;
          const ok = await setFav(r.id, on);
          if (!ok) { on = !on; return; }
          btn.textContent = on ? '♥' : '♡';
          if ((location.hash || '#').slice(1) === 'fav') await loadAndRenderFav();
        } catch (err) {
          alert('お気に入り更新に失敗: ' + (err?.message || err));
        }
      });
    })();
  }

  // ===== Favorites =====
  const favListEl = $('#favList');
  function renderFavList(items) {
    if (!favListEl) return;
    favListEl.innerHTML = '';
    if (!items.length) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'お気に入りがありません。レシピ詳細の「♡」で追加できます。';
      favListEl.appendChild(div);
      return;
    }
    items.forEach(r => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="t">${esc(r.title)}</div>
        <div class="meta">${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>
        <div class="meta">${r.updated_at ? '更新: ' + new Date(r.updated_at).toLocaleString('ja-JP', { hour12: false }) : ''}</div>`;
      card.addEventListener('click', () => {
        show('recipes');
        openRecipe(r.id);
      });
      favListEl.appendChild(card);
    });
  }

  async function isFav(recipe_id) {
    try {
      let q = sb.from('favorites').select('id').eq('recipe_id', recipe_id).limit(1);
      if (identity.rlsMode === 'secure') {
        if (!identity.uid) { return false; }
        q = q.eq('user_id', identity.uid);
      } else {
        q = identity.uid ? q.eq('user_id', identity.uid) : q.eq('client_id', identity.client_id);
      }
      const { data } = await q;
      return !!(data && data[0]);
    } catch {
      return false;
    }
  }
  async function setFav(recipe_id, on) {
    // secureモードで未ログインの場合は不可
    if (identity.rlsMode === 'secure' && !identity.uid) {
      alert('お気に入りは本番RLS（secure）ではログインが必要です。');
      return false;
    }
    if (on) {
      const payload = identity.uid
        ? { recipe_id, user_id: identity.uid }
        : { recipe_id, client_id: identity.client_id };
      const { error } = await sb.from('favorites').insert(payload);
      if (error && error.code !== '23505') {
        alert('追加に失敗: ' + error.message);
        return false;
      }
      return true;
    } else {
      let q = sb.from('favorites').delete().eq('recipe_id', recipe_id);
      q = identity.uid ? q.eq('user_id', identity.uid) : q.eq('client_id', identity.client_id);
      const { error } = await q;
      if (error) { alert('削除に失敗: ' + error.message); return false; }
      return true;
    }
  }
  async function fetchFavList() {
    let q = sb.from('favorites')
      .select('recipe_id, created_at, recipes!inner(id,title,tags,updated_at)')
      .order('created_at', { ascending: false });
    if (identity.rlsMode === 'secure') {
      if (!identity.uid) return [];
      q = q.eq('user_id', identity.uid);
    } else {
      q = identity.uid ? q.eq('user_id', identity.uid) : q.eq('client_id', identity.client_id);
    }
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data || []).map(x => x.recipes);
  }

  // ===== Save / Delete =====
  function num(s) {
    const v = parseFloat(String(s || '').replace(/[, \t]/g, ''));
    return Number.isFinite(v) ? v : null;
  }
  async function saveCurrent() {
    const r = state.current?.recipe || { title: '' };
    const id = r.id;
    const payload = {
      title: $('#fTitle').value.trim(),
      yield: num($('#fYield').value),
      yield_unit: $('#fYieldUnit').value.trim() || null,
      tags: $('#fTags').value.split(',').map(s => s.trim()).filter(Boolean),
      meta: { note: $('#fNote').value }
    };
    if (!payload.title) { alert('タイトルは必須です'); return; }

    let res;
    if (id) res = await sb.from('recipes').update(payload).eq('id', id).select('*').single();
    else    res = await sb.from('recipes').insert(payload).select('*').single();
    if (res.error) { alert('保存失敗: ' + res.error.message); return; }
    const recipe_id = res.data.id;

    // children
    const ingRows = $$('#ingList .ingrow').map((row, i) => {
      const get = k => $('[data-k="'+k+'"]', row)?.value || '';
      const qty = num(get('quantity'));
      return { recipe_id, position: i + 1, item: get('item').trim(), quantity: (qty==null?null:qty), unit: (get('unit').trim() || null) };
    }).filter(x => x.item);
    const stepRows = $$('#stepList .ingrow').map((row, i) => {
      const get = k => $('[data-k="'+k+'"]', row)?.value || '';
      const tsec = parseInt(get('timer_sec'));
      const temp = num(get('temp_c'));
      return { recipe_id, position: i + 1, instruction: get('instruction').trim(), timer_sec: (Number.isFinite(tsec)?tsec:null), temp_c: temp };
    }).filter(x => x.instruction);

    await sb.from('recipe_ingredients').delete().eq('recipe_id', recipe_id);
    await sb.from('recipe_steps').delete().eq('recipe_id', recipe_id);
    if (ingRows.length)  { const { error: e1 } = await sb.from('recipe_ingredients').insert(ingRows); if (e1) { alert('材料の保存に失敗: ' + e1.message); return; } }
    if (stepRows.length) { const { error: e2 } = await sb.from('recipe_steps').insert(stepRows); if (e2) { alert('手順の保存に失敗: ' + e2.message); return; } }

    await loadAndRender();
    await openRecipe(recipe_id);
  }
  async function delCurrent() {
    if (!state.current?.recipe?.id) return;
    if (!confirm('このレシピを削除しますか？')) return;
    const id = state.current.recipe.id;
    const { error } = await sb.from('recipes').delete().eq('id', id);
    if (error) { alert('削除失敗: ' + error.message); return; }
    state.current = null;
    renderDetail();
    await loadAndRender();
    await loadAndRenderFav();
  }

  // ===== Favorites View =====
  async function loadAndRenderFav() {
    state.favList = await fetchFavList();
    renderFavList(state.favList);
  }

  // ===== Recipes View load =====
  async function loadAndRender() {
    state.list = await fetchRecipesLite();
    renderList(state.list);
  }

  // ===== Search input (Recipes view only) =====
  $('#search')?.addEventListener('input', (e) => {
    state.search = e.target.value || '';
    renderList(state.list);
  });

  // ===== Header buttons =====
  $('#btnNew')?.addEventListener('click', () => {
    state.current = { recipe: { title: '' }, ings: [], steps: [] };
    show('recipes'); renderDetail();
  });

  $('#btnExport')?.addEventListener('click', exportAll);
  $('#btnImport')?.addEventListener('click', () => $('#fileImport')?.click());
  $('#fileImport')?.addEventListener('change', importAll);

  $('#btnDummy20')?.addEventListener('click', seedDummy);
  $('#btnSmaller')?.addEventListener('click', () => scaleFont(-0.05));
  $('#btnLarger')?.addEventListener('click', () => scaleFont(+0.05));
  $('#btnToggleMode')?.addEventListener('click', () => document.body.classList.toggle('cook'));

  function scaleFont(delta) {
    const r = document.documentElement;
    const cur = parseFloat(getComputedStyle(r).getPropertyValue('--fs') || '1') || 1;
    r.style.setProperty('--fs', String(Math.max(0.8, Math.min(1.3, cur + delta))));
  }

  async function exportAll() {
    const { data: recipes } = await sb.from('recipes').select('*').order('updated_at', { ascending: false });
    const { data: ings }    = await sb.from('recipe_ingredients').select('*');
    const { data: steps }   = await sb.from('recipe_steps').select('*');
    const blob = new Blob([JSON.stringify({ recipes, ings, steps }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'recipes-export.json';
    a.click(); URL.revokeObjectURL(a.href);
  }
  async function importAll(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      if (!Array.isArray(obj.recipes)) throw new Error('不正な形式');
      for (const r of obj.recipes) {
        const payload = { title: r.title, yield: r.yield, yield_unit: r.yield_unit, tags: r.tags || [], meta: r.meta || {} };
        const { data: rec, error } = await sb.from('recipes').insert(payload).select('*').single();
        if (error) throw error;
        const recipe_id = rec.id;
        const ingRows = (obj.ings || []).filter(x => x.recipe_id === r.id).map((x, i) => ({ recipe_id, position: i + 1, item: x.item, quantity: x.quantity, unit: x.unit }));
        const stepRows = (obj.steps || []).filter(x => x.recipe_id === r.id).map((x, i) => ({ recipe_id, position: i + 1, instruction: x.instruction, timer_sec: x.timer_sec, temp_c: x.temp_c, note: x.note }));
        if (ingRows.length)  { const { error: e1 } = await sb.from('recipe_ingredients').insert(ingRows); if (e1) throw e1; }
        if (stepRows.length) { const { error: e2 } = await sb.from('recipe_steps').insert(stepRows); if (e2) throw e2; }
      }
      alert('インポート完了');
      await loadAndRender();
    } catch (err) {
      alert('インポート失敗: ' + (err?.message || err));
    } finally {
      e.target.value = '';
    }
  }
  async function seedDummy() {
    const titles = Array.from({ length: 20 }, (_, i) => `試作#${String(i + 1).padStart(2, '0')}`);
    for (const t of titles) {
      const { data: r } = await sb.from('recipes').insert({ title: t, tags: ['demo'] }).select('*').single();
      if (!r) continue;
      await sb.from('recipe_ingredients').insert([
        { recipe_id: r.id, position: 1, item: 'T65', quantity: 500, unit: 'g' },
        { recipe_id: r.id, position: 2, item: '水', quantity: 300, unit: 'g' }
      ]);
      await sb.from('recipe_steps').insert([
        { recipe_id: r.id, position: 1, instruction: 'ミキシング 低3→中4', timer_sec: 420, temp_c: 24 },
        { recipe_id: r.id, position: 2, instruction: 'ホイロ 27℃ RH75% 120分', timer_sec: 7200, temp_c: 27 }
      ]);
      await new Promise(r => setTimeout(r, 40));
    }
    await loadAndRender();
  }

  // Kick
  show((location.hash || '#recipes').slice(1));
  loadAndRender();
})();