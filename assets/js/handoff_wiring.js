/*
 handoff_wiring.js — index → recipe_view 受け渡しの共通配線
 この1ファイルを index.html と recipe_view.html の末尾で読み込めば、
  - index側: .recipe-link をクリックしたとき localStorage にJSON保存 → ?id= 付きで遷移
  - view側: URL (?id / ?slug) または localStorage.selected_recipe から受取・描画
 を自動で行います。既存コードと共存できるよう、グローバル汚染を極力避けています。
*/
(function(){
  const $ = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const escapeHtml = (s)=> String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));

  // =====================
  // index.html 側の配線
  // =====================
  function wireIndexLinks(){
    const list = $('#cardList');
    if (!list) return; // index でなければ無視
    $$('.recipe-link', list).forEach(el=>{
      if (el._wired) return; el._wired = true;
      // href が未設定なら id/slug から補完
      const id = el.getAttribute('data-recipe-id');
      const slug = el.getAttribute('data-recipe-slug');
      if (el.tagName === 'A' && !el.getAttribute('href')){
        if (id) el.setAttribute('href', `recipe_view.html?id=${encodeURIComponent(id)}`);
        else if (slug) el.setAttribute('href', `recipe_view.html?slug=${encodeURIComponent(slug)}`);
        else el.setAttribute('href', 'recipe_view.html');
      }
      // クリック時に JSON を保存
      el.addEventListener('click', (e)=>{
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || el.target==='_blank') return; // 新規タブ等は素通し
        const raw = el.getAttribute('data-recipe-json');
        if (raw){ try{ localStorage.setItem('selected_recipe', raw); }catch{} }
      }, { capture:true, passive:true });
    });
  }

  // 初回 & 動的更新にも対応（MutationObserver）
  function setupIndex(){
    wireIndexLinks();
    const list = $('#cardList');
    if (!list) return;
    const mo = new MutationObserver(()=> wireIndexLinks());
    mo.observe(list, { childList:true, subtree:true, attributes:true, attributeFilter:['data-recipe-json','data-recipe-id','href'] });
  }

  // ==========================
  // recipe_view.html 側の受け取り
  // ==========================
  async function fetchById(id){
    if (!window.sb) return null;
    try{
      const { data, error } = await sb.from('recipes').select('*').eq('id', id).single();
      if (error) throw error; return data;
    }catch(e){ console.warn('fetchById:', e.message); return null; }
  }
  async function fetchBySlug(slug){
    if (!window.sb) return null;
    try{
      const { data, error } = await sb.from('recipes').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error; return data||null;
    }catch(e){ console.warn('fetchBySlug:', e.message); return null; }
  }
  function parseLocalSelected(){
    try{ const s = localStorage.getItem('selected_recipe'); return s? JSON.parse(s): null; }catch{ return null; }
  }
  function renderBadges(tags){
    const wrap = $('#tags'); if(!wrap) return; wrap.innerHTML = '';
    (tags||[]).forEach(t=>{ const b=document.createElement('span'); b.className='badge'; b.textContent=t; wrap.appendChild(b); });
  }
  function renderIngredients(ingredients){
    const box = $('#ingredients'); if(!box) return; box.innerHTML = '';
    if(!ingredients || !ingredients.length){ box.innerHTML = '<div class="muted">未登録</div>'; return; }
    const table = document.createElement('table'); table.className='table';
    table.innerHTML = '<thead><tr><th>材料</th><th style="text-align:right">数量</th><th>単位</th></tr></thead><tbody></tbody>';
    const tb = table.querySelector('tbody');
    ingredients.forEach(it=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(it.item||'')}</td>`+
                     `<td class="num" style="text-align:right">${escapeHtml(String(it.quantity??''))}</td>`+
                     `<td>${escapeHtml(String(it.unit??''))}</td>`;
      tb.appendChild(tr);
    });
    box.appendChild(table);
  }
  function renderSteps(steps){
    const ol = $('#steps'); if(!ol) return; ol.innerHTML='';
    if(!steps || !steps.length){ ol.innerHTML = '<li class="muted">未登録</li>'; return; }
    steps.forEach(s=>{ const li=document.createElement('li'); li.textContent = s; ol.appendChild(li); });
  }
  function renderMeta(created_at, updated_at){
    const meta = $('#meta'); if(!meta) return;
    const fmt = (d)=> d? new Date(d).toLocaleDateString(): '—';
    meta.textContent = `作成日 ${fmt(created_at)} / 更新日 ${fmt(updated_at)}`;
  }
  function renderView(r){
    const titleEl = $('#recipeTitle'); if (titleEl) titleEl.textContent = r.title || '無題のレシピ';
    const introEl = $('#recipeIntro'); if (introEl) introEl.textContent = r.intro || r.description || '';
    const notesEl = $('#notes'); if (notesEl) notesEl.textContent = r.notes || '';
    renderBadges(r.tags || r.tag_list || []);
    renderIngredients(r.ingredients || []);
    renderSteps(r.steps || []);
    renderMeta(r.created_at, r.updated_at);
  }

  async function setupView(){
    // recipe_view 判定
    if (!$('#recipeTitle') || !$('#steps')) return; // view でなければ何もしない
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const slug = params.get('slug');
    let recipe = null;
    if (id) recipe = await fetchById(id);
    if (!recipe && slug) recipe = await fetchBySlug(slug);
    if (!recipe) recipe = parseLocalSelected();
    if (!recipe){
      // フォールバック
      try{ const s = localStorage.getItem('last_opened_recipe'); if(s) recipe = JSON.parse(s); }catch{}
    }
    if (!recipe){
      renderView({ title:'レシピが見つかりません', intro:'トップからレシピを選び直してください。', ingredients:[], steps:[] });
      return;
    }
    renderView(recipe);
    try{ localStorage.setItem('last_opened_recipe', JSON.stringify(recipe)); }catch{}
  }

  // ===== 起動 =====
  document.addEventListener('DOMContentLoaded', ()=>{
    setupIndex();
    setupView();
  });
})();
// JavaScript Document