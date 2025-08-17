/*
  handoff_wiring.compat.js — 既存の app-index.js / app-edit.js とバッティングしない最小配線

  目的：
  - index 側：既存レンダリングのまま、.recipe-link / data-recipe-id / data-recipe-json を“配線”だけ行う
  - view 側：URL ?id で Supabase 取得（sb が既に初期化されている場合のみ）、無ければ localStorage を描画

  重要：
  - ここでは Supabase の「初期化」も「一覧フェッチ」もしません（＝既存の app-index.js に委ねます）
  - 二重バインド防止に data-handoff-wired を使用
  - href が未設定なら id から自動補完（id が無い場合は補完しない）
*/
(function(){
  const $ = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const escapeHtml = (s)=> String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));

  // =====================
  // index.html 側：リンク配線のみ
  // =====================
  function wireIndexLinks(){
    const root = document;
    $$('a.recipe-link, [data-recipe-id], [data-recipe-json]', root).forEach(el=>{
      if (el.hasAttribute('data-handoff-wired')) return;
      el.setAttribute('data-handoff-wired','1');

      // href 補完（id ベースのみ）
      if (el.tagName === 'A' && !el.getAttribute('href')){
        const id = el.getAttribute('data-recipe-id');
        if (id) el.setAttribute('href', `recipe_view.html?id=${encodeURIComponent(id)}`);
      }

      // クリック時に JSON を保存（新規タブ等は素通し）
      el.addEventListener('click', (e)=>{
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || el.target==='_blank') return;
        const raw = el.getAttribute('data-recipe-json');
        if (raw){ try{ localStorage.setItem('selected_recipe', raw); }catch{} }
      }, { capture:true, passive:true });
    });
  }

  // 既存レンダリング後にも配線が適用されるよう、MutationObserver で監視
  function setupIndex(){
    wireIndexLinks();
    const list = document.getElementById('cardList') || document.body;
    const mo = new MutationObserver(()=> wireIndexLinks());
    mo.observe(list, { childList:true, subtree:true, attributes:true, attributeFilter:['data-recipe-json','data-recipe-id','href'] });
  }

  // =====================
  // recipe_view.html 側：受け取り
  // =====================
  async function fetchByIdViaExistingClient(id){
    // 既存の app-index.js 等が sb を初期化している前提
    if (!window.sb) return null;
    try{
      const { data, error } = await sb.from('recipes').select('*').eq('id', id).single();
      if (error) { console.warn('[handoff] fetch error:', error); return null; }
      return data;
    }catch(e){ console.warn('[handoff] fetch exception:', e); return null; }
  }
  function parseLocal(){ try{ const s=localStorage.getItem('selected_recipe'); return s? JSON.parse(s): null; }catch{ return null; } }

  function renderBadges(tags){ const wrap=$('#tags'); if(!wrap) return; wrap.innerHTML=''; (tags||[]).forEach(t=>{ const b=document.createElement('span'); b.className='badge'; b.textContent=t; wrap.appendChild(b); }); }
  function renderIngredients(ingredients){ const box=$('#ingredients'); if(!box) return; box.innerHTML=''; if(!ingredients||!ingredients.length){ box.innerHTML='<div class="muted">未登録</div>'; return;} const table=document.createElement('table'); table.className='table'; table.innerHTML='<thead><tr><th>材料</th><th style="text-align:right">数量</th><th>単位</th></tr></thead><tbody></tbody>'; const tb=table.querySelector('tbody'); ingredients.forEach(it=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${escapeHtml(it.item||'')}</td><td class="num" style="text-align:right">${escapeHtml(String(it.quantity??''))}</td><td>${escapeHtml(String(it.unit??''))}</td>`; tb.appendChild(tr); }); box.appendChild(table); }
  function renderSteps(steps){ const ol=$('#steps'); if(!ol) return; ol.innerHTML=''; if(!steps||!steps.length){ ol.innerHTML='<li class="muted">未登録</li>'; return;} steps.forEach(s=>{ const li=document.createElement('li'); li.textContent=s; ol.appendChild(li); }); }
  function renderMeta(created_at, updated_at){ const meta=$('#meta'); if(!meta) return; const fmt=(d)=> d? new Date(d).toLocaleDateString(): '—'; meta.textContent = `作成日 ${fmt(created_at)} / 更新日 ${fmt(updated_at)}`; }
  function renderView(r){ const titleEl=$('#recipeTitle'); if(titleEl) titleEl.textContent=r.title||'無題のレシピ'; const introEl=$('#recipeIntro'); if(introEl) introEl.textContent=r.intro||r.description||''; const notesEl=$('#notes'); if(notesEl) notesEl.textContent=r.notes||''; renderBadges(r.tags||r.tag_list||[]); renderIngredients(r.ingredients||[]); renderSteps(r.steps||[]); renderMeta(r.created_at, r.updated_at); }

  async function setupView(){
    if (!$('#recipeTitle') || !$('#steps')) return; // view 以外はスキップ
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    let recipe = null;
    if (id) recipe = await fetchByIdViaExistingClient(id);
    if (!recipe) recipe = parseLocal();

    if (!recipe){
      renderView({ title:'レシピが見つかりません', intro:'トップからレシピを選び直してください。', ingredients:[], steps:[] });
      return;
    }
    renderView(recipe);
    try{ localStorage.setItem('last_opened_recipe', JSON.stringify(recipe)); }catch{}
  }

  // =====================
  // 起動
  // =====================
  document.addEventListener('DOMContentLoaded', ()=>{ setupIndex(); setupView(); });
})();
// JavaScript Document