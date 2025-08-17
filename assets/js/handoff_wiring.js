/*
  handoff_wiring.js — index → recipe_view 受け渡し + Supabase フェッチ対応版
  使い方：index.html と recipe_view.html の末尾でこのファイルを読み込むだけ。
  要件：
    - CDN で supabase-js@2 を読み込んでいること
    - 下の URL / ANON_KEY をあなたのプロジェクトの値に合わせること
*/
(function(){
  const $ = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const escapeHtml = (s)=> String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));

  // ====== Supabase 初期化 ======
  const SUPABASE_URL = "https://ctxyawinblwcbkovfsyj.supabase.co"; // ←あなたのURL
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q"; // ←あなたのANON KEY
  if (window.supabase && !window.sb) {
    try{ window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
    catch(e){ console.warn('Supabase init failed:', e.message); }
  }

  // ====== index 側：カード描画 & クリックで受け渡し ======
  async function fetchRecipeList(){
    if (!window.sb) return [];
    try{
      const { data, error } = await sb
        .from('recipes')
        .select('id, title, slug, tags, updated_at, ingredients, steps')
        .order('updated_at', { ascending:false })
        .limit(200);
      if (error) throw error;
      return data || [];
    }catch(e){ console.warn('fetchRecipeList:', e.message); return []; }
  }

  function buildCard(r){
    const a = document.createElement('a');
    a.className = 'recipe-link card';
    a.setAttribute('data-recipe-id', r.id || '');
    if (r.slug) a.setAttribute('data-recipe-slug', r.slug);
    try{ a.setAttribute('data-recipe-json', JSON.stringify(r)); }catch{}
    a.innerHTML = `
      <div class="card-body">
        <div class="card-title">${escapeHtml(r.title||'無題')}</div>
        <div class="card-meta">更新 ${fmtDate(r.updated_at)}</div>
        <div class="card-tags">${(r.tags||[]).map(t=>`<span class="badge">${escapeHtml(t)}</span>`).join('')}</div>
      </div>`;
    return a;
  }

  function wireRecipeLinks(root){
    $$('a.recipe-link', root).forEach(el=>{
      if (el._wired) return; el._wired = true;
      // href 補完
      if (!el.getAttribute('href')){
        const id = el.getAttribute('data-recipe-id');
        const slug = el.getAttribute('data-recipe-slug');
        if (id) el.setAttribute('href', `recipe_view.html?id=${encodeURIComponent(id)}`);
        else if (slug) el.setAttribute('href', `recipe_view.html?slug=${encodeURIComponent(slug)}`);
        else el.setAttribute('href', 'recipe_view.html');
      }
      // クリックで JSON を保存（新規タブ等は素通し）
      el.addEventListener('click', (e)=>{
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || el.target==='_blank') return;
        const raw = el.getAttribute('data-recipe-json');
        if (raw){ try{ localStorage.setItem('selected_recipe', raw); }catch{} }
      }, { capture:true, passive:true });
    });
  }

  async function setupIndex(){
    const list = $('#cardList');
    if (!list) return; // index ではない

    // 既に静的カードがある場合でもリンクを配線
    wireRecipeLinks(list);

    // Supabase から一覧をロード（失敗しても致命的ではない）
    const rows = await fetchRecipeList();
    if (rows.length){
      const frag = document.createDocumentFragment();
      rows.forEach(r=> frag.appendChild(buildCard(r)));
      list.innerHTML = '';
      list.appendChild(frag);
      const empty = $('#empty-message'); if (empty) empty.style.display = 'none';
      wireRecipeLinks(list);
    } else {
      // 何も取れない場合は空表示
      const empty = $('#empty-message'); if (empty) empty.style.display = '';
    }

    // 動的追加にも追従
    const mo = new MutationObserver(()=> wireRecipeLinks(list));
    mo.observe(list, { childList:true, subtree:true });
  }

  // ====== recipe_view 側：受け取り & 描画 ======
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
      if (error) throw error; return data || null;
    }catch(e){ console.warn('fetchBySlug:', e.message); return null; }
  }
  function parseLocal(){ try{ const s=localStorage.getItem('selected_recipe'); return s? JSON.parse(s): null; }catch{ return null; } }

  function renderBadges(tags){ const wrap=$('#tags'); if(!wrap) return; wrap.innerHTML=''; (tags||[]).forEach(t=>{ const b=document.createElement('span'); b.className='badge'; b.textContent=t; wrap.appendChild(b); }); }
  function renderIngredients(ingredients){ const box=$('#ingredients'); if(!box) return; box.innerHTML=''; if(!ingredients||!ingredients.length){ box.innerHTML='<div class="muted">未登録</div>'; return;} const table=document.createElement('table'); table.className='table'; table.innerHTML='<thead><tr><th>材料</th><th style="text-align:right">数量</th><th>単位</th></tr></thead><tbody></tbody>'; const tb=table.querySelector('tbody'); ingredients.forEach(it=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${escapeHtml(it.item||'')}</td><td class="num" style="text-align:right">${escapeHtml(String(it.quantity??''))}</td><td>${escapeHtml(String(it.unit??''))}</td>`; tb.appendChild(tr); }); box.appendChild(table); }
  function renderSteps(steps){ const ol=$('#steps'); if(!ol) return; ol.innerHTML=''; if(!steps||!steps.length){ ol.innerHTML='<li class="muted">未登録</li>'; return;} steps.forEach(s=>{ const li=document.createElement('li'); li.textContent=s; ol.appendChild(li); }); }
  function renderMeta(created_at, updated_at){ const meta=$('#meta'); if(!meta) return; const fmt=(d)=> d? new Date(d).toLocaleDateString(): '—'; meta.textContent = `作成日 ${fmt(created_at)} / 更新日 ${fmt(updated_at)}`; }
  function renderView(r){ const titleEl=$('#recipeTitle'); if(titleEl) titleEl.textContent=r.title||'無題のレシピ'; const introEl=$('#recipeIntro'); if(introEl) introEl.textContent=r.intro||r.description||''; const notesEl=$('#notes'); if(notesEl) notesEl.textContent=r.notes||''; renderBadges(r.tags||r.tag_list||[]); renderIngredients(r.ingredients||[]); renderSteps(r.steps||[]); renderMeta(r.created_at, r.updated_at); }

  async function setupView(){
    if (!$('#recipeTitle') || !$('#steps')) return; // view でなければスキップ
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const slug = params.get('slug');

    let recipe = null;
    if (id) recipe = await fetchById(id);
    if (!recipe && slug) recipe = await fetchBySlug(slug);
    if (!recipe) recipe = parseLocal();

    if (!recipe){
      renderView({ title:'レシピが見つかりません', intro:'トップからレシピを選び直してください。', ingredients:[], steps:[] });
      return;
    }
    renderView(recipe);
    try{ localStorage.setItem('last_opened_recipe', JSON.stringify(recipe)); }catch{}
  }

  function fmtDate(d){ if(!d) return '-'; const x=new Date(d); return isNaN(x)?'-': x.toLocaleDateString(); }

  // ====== 起動 ======
  document.addEventListener('DOMContentLoaded', ()=>{
    setupIndex();
    setupView();
  });
})();
