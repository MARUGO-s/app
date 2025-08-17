/*
  handoff_wiring.compat.no-slug.js — 競合ゼロ & slug非依存 受け渡し配線
  - index側：既存の描画をそのまま利用し、リンク配線のみ行う（Supabaseへの一覧APIは呼ばない）
  - view側：?id があれば既存の sb で1件取得、無ければ localStorage.selected_recipe を描画
  - slug カラムは一切参照しない（列が無くても安全）
  - 二重バインド防止: data-handoff-wired

  使い方：index.html と recipe_view.html の末尾でこのファイルだけ読み込む。
  <script src="assets/js/handoff_wiring.compat.no-slug.js?v=2025-08-17"></script>
*/
(function(){
  const $ = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const esc = (s)=> String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));

  // =====================
  // index.html 側：リンク配線のみ（APIは呼ばない）
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

  // 動的描画にも追従（既存app-index.jsが後から描画する場合に対応）
  function setupIndex(){
    wireIndexLinks();
    const list = document.getElementById('cardList') || document.body;
    const mo = new MutationObserver(()=> wireIndexLinks());
    mo.observe(list, { childList:true, subtree:true, attributes:true, attributeFilter:['data-recipe-json','data-recipe-id','href'] });
  }

  // =====================
  // recipe_view.html 側：受け取り
  // =====================
  async function fetchByIdIfClientExists(id){
    // 既存の app 側で sb が初期化済みなら、それを使って1件取得
    if (!window.sb) return null;
    try{
      const { data, error } = await sb.from('recipes').select('*').eq('id', id).single();
      if (error){ console.warn('[handoff] fetch error:', error); return null; }
      return data;
    }catch(e){ console.warn('[handoff] fetch exception:', e); return null; }
  }
  function parseLocal(){ try{ const s=localStorage.getItem('selected_recipe'); return s? JSON.parse(s): null; }catch{ return null; } }

  function renderBadges(tags){ const wrap=$('#tags'); if(!wrap) return; wrap.innerHTML=''; (tags||[]).forEach(t=>{ const b=document.createElement('span'); b.className='badge'; b.textContent=t; wrap.appendChild(b); }); }
  function renderIngredients(ingredients){ const box=$('#ingredients'); if(!box) return; box.innerHTML=''; if(!ingredients||!ingredients.length){ box.innerHTML='<div class="muted">未登録</div>'; return;} const table=document.createElement('table'); table.className='table'; table.innerHTML='<thead><tr><th>材料</th><th style="text-align:right">数量</th><th>単位</th></tr></thead><tbody></tbody>'; const tb=table.querySelector('tbody'); ingredients.forEach(it=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${esc(it.item||'')}</td><td class="num" style="text-align:right">${esc(String(it.quantity??''))}</td><td>${esc(String(it.unit??''))}</td>`; tb.appendChild(tr); }); box.appendChild(table); }
  function renderSteps(steps){ const ol=$('#steps'); if(!ol) return; ol.innerHTML=''; if(!steps||!steps.length){ ol.innerHTML='<li class="muted">未登録</li>'; return;} steps.forEach(s=>{ const li=document.createElement('li'); li.textContent=s; ol.appendChild(li); }); }
  function renderMeta(created_at, updated_at){ const meta=$('#meta'); if(!meta) return; const fmt=(d)=> d? new Date(d).toLocaleDateString(): '—'; meta.textContent = `作成日 ${fmt(created_at)} / 更新日 ${fmt(updated_at)}`; }
  function renderView(r){ const titleEl=$('#recipeTitle'); if(titleEl) titleEl.textContent=r.title||'無題のレシピ'; const introEl=$('#recipeIntro'); if(introEl) introEl.textContent=r.intro||r.description||''; const notesEl=$('#notes'); if(notesEl) notesEl.textContent=r.notes||''; renderBadges(r.tags||r.tag_list||[]); renderIngredients(r.ingredients||[]); renderSteps(r.steps||[]); renderMeta(r.created_at, r.updated_at); }

  async function setupView(){
    if (!$('#recipeTitle') || !$('#steps')) return; // view ではない
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    let recipe = null;
    if (id) recipe = await fetchByIdIfClientExists(id); // sb が無ければ null のまま
    if (!recipe) recipe = parseLocal();

    if (!recipe){
      renderView({ title:'レシピが見つかりません', intro:'トップからレシピを選び直してください。', ingredients:[], steps:[] });
      return;
    }
    renderView(recipe);
    try{ localStorage.setItem('last_opened_recipe', JSON.stringify(recipe)); }catch{}
  }

  // 起動
  document.addEventListener('DOMContentLoaded', ()=>{ setupIndex(); setupView(); });
})();
