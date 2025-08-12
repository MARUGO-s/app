// app.supabase.open.js — ログイン無しで使う開発モード（RLS全開放前提）
(function(){
  'use strict';
  const sb = window.sb; if(!sb){ console.error('[Supabase] client not found'); return; }

  const $  = (s, el=document)=> el.querySelector(s);
  const $$ = (s, el=document)=> [...el.querySelectorAll(s)];
  const esc=(s)=> (s??'').toString().replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[m]));

  // --- Anonymous identity (client_id for favorites) ---
  const identity = { client_id: null };
  identity.client_id = localStorage.getItem('client_id') || (crypto?.randomUUID?.() || String(Math.random()).slice(2));
  localStorage.setItem('client_id', identity.client_id);

  // --- Views ---
  const views = { home:$('#view-home'), recipes:$('#view-recipes'), fav:$('#view-fav'), settings:$('#view-settings') };
  const nav   = { home:'#btnNavHome', recipes:'#btnNavRecipes', fav:'#btnNavFav', settings:'#btnNavSettings' };
  function show(view){
    Object.entries(views).forEach(([k,el])=>{ if(el) el.style.display = (k===view)?'':'none'; });
    Object.entries(nav).forEach(([k,sel])=>{ const b=$(sel); if(!b) return; const on=(k===view); b.classList.toggle('active',on); if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    location.hash = '#'+view;
    if(view==='home')     loadOverview();
    if(view==='recipes')  loadRecipes();
    if(view==='fav')      loadFav();
  }
  $('#btnNavHome')?.addEventListener('click',()=>show('home'));
  $('#btnNavRecipes')?.addEventListener('click',()=>show('recipes'));
  $('#btnNavFav')?.addEventListener('click',()=>show('fav'));
  $('#btnNavSettings')?.addEventListener('click',()=>show('settings'));
  window.addEventListener('hashchange',()=>{ const v=(location.hash||'#home').slice(1); show(['home','recipes','fav','settings'].includes(v)?v:'home'); });

  // --- Queries (no auth) ---
  async function qRecipesLite(){ const { data, error } = await sb.from('recipes').select('id,title,tags,updated_at').order('updated_at',{ascending:false}).limit(200); if(error){ console.error(error); return []; } return data||[]; }
  async function qRecipeFull(idv){ const { data: r, error: e1 } = await sb.from('recipes').select('*').eq('id',idv).single(); if(e1) throw e1; const { data: ings } = await sb.from('recipe_ingredients').select('*').eq('recipe_id',idv).order('position'); const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id',idv).order('position'); return { recipe:r, ings:ings||[], steps:steps||[] }; }
  async function qFavList(){ const { data, error } = await sb.from('favorites').select('recipe_id, recipes!inner(id,title,tags,updated_at)').eq('client_id', identity.client_id).order('created_at',{ascending:false}); if(error){ console.error(error); return []; } return (data||[]).map(x=>x.recipes); }
  async function qCounts(){
    const [{ data: r1 }, { data: r2 }] = await Promise.all([ sb.from('recipes').select('id,tags,updated_at'), sb.from('favorites').select('id').eq('client_id', identity.client_id) ]);
    const tagset=new Set(); (r1||[]).forEach(r=> (r.tags||[]).forEach(t=> tagset.add(t)));
    const recent=(r1||[]).sort((a,b)=> new Date(b.updated_at)-new Date(a.updated_at)).slice(0,5);
    return { total:(r1||[]).length, fav:(r2||[]).length, tags:tagset.size, recent };
  }

  // --- Overview ---
  async function loadOverview(){
    const s = await qCounts();
    $('#statTotal').textContent = s.total;
    $('#statFav').textContent   = s.fav;
    $('#statTags').textContent  = s.tags;
    const recentEl = $('#recentList'); recentEl.innerHTML='';
    if(!s.recent.length){ recentEl.classList.add('empty'); recentEl.textContent='まだレシピがありません'; }
    else{ recentEl.classList.remove('empty'); s.recent.forEach(r=>{ const card=document.createElement('div'); card.className='card'; card.innerHTML=`<div class="t">${esc(r.title)}</div><div class="meta">${(r.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</div>`; card.addEventListener('click',()=>{ show('recipes'); openRecipe(r.id); }); recentEl.appendChild(card); }); }
    const favs = await qFavList(); const homeFav = $('#homeFavList'); homeFav.innerHTML=''; if(!favs.length){ homeFav.classList.add('empty'); homeFav.textContent='なし'; } else { homeFav.classList.remove('empty'); favs.slice(0,5).forEach(r=>{ const card=document.createElement('div'); card.className='card'; card.innerHTML=`<div class="t">${esc(r.title)}</div>`; card.addEventListener('click',()=>{ show('recipes'); openRecipe(r.id); }); homeFav.appendChild(card); }); }
  }

  // --- Recipes list/detail ---
  const listEl = $('#list'), detailEl = $('#detail');
  let state = { list:[], current:null, search:'' };
  function renderList(items){
    const q = state.search.trim().toLowerCase();
    const arr = q? items.filter(r=>{ const tgt=[r.title,...(r.tags||[])].join(' ').toLowerCase(); return q.split(/\s+/).every(w=>tgt.includes(w)); }): items;
    listEl.innerHTML='';
    if(!arr.length){ const d=document.createElement('div'); d.className='empty'; d.textContent='レシピがありません。'; listEl.appendChild(d); return; }
    arr.forEach(r=>{ const card=document.createElement('div'); card.className='card'; card.innerHTML=`<div class="t">${esc(r.title)}</div><div class="meta">${(r.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</div>`; card.addEventListener('click',()=>openRecipe(r.id)); listEl.appendChild(card); });
  }
  async function openRecipe(idv){ try{ state.current = await qRecipeFull(idv); renderDetail(); }catch(e){ alert('読み込みに失敗: '+(e?.message||e)); } }
  function renderDetail(){
    const r=state.current?.recipe; const ings=state.current?.ings||[]; const steps=state.current?.steps||[];
    if(!r){ detailEl.innerHTML='<div class="empty">左の一覧から選ぶか「＋ 新規レシピ」を押してください。</div>'; return; }
    detailEl.innerHTML=`
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="field" style="flex:1"><label>タイトル</label><input id="fTitle" type="text" value="${esc(r.title||'')}" /></div>
        <button id="favToggle" class="btn" title="お気に入り">♡</button>
      </div>
      <div class="row gap">
        <div class="field" style="flex:1"><label>分量</label><input id="fYield" type="text" value="${r.yield??''}" /></div>
        <div class="field" style="flex:1"><label>単位</label><input id="fYieldUnit" type="text" value="${esc(r.yield_unit||'')}" /></div>
      </div>
      <div class="field"><label>タグ（カンマ区切り）</label><input id="fTags" type="text" value="${(r.tags||[]).join(', ')}" /></div>
      <div class="field"><label>メモ</label><textarea id="fNote">${esc(r.meta?.note||'')}</textarea></div>
      <div class="field"><label>材料</label><div id="ingList" class="inglist"></div><button id="addIng" class="btn small">＋ 材料行</button></div>
      <div class="field"><label>手順</label><div id="stepList" class="inglist"></div><button id="addStep" class="btn small">＋ 手順行</button></div>
      <div class="row"><button id="save" class="btn primary">保存</button><button id="del" class="btn danger">削除</button></div>`;
    const ingList=$('#ingList',detailEl), stepList=$('#stepList',detailEl);
    function addIngRow(v={}){ const w=document.createElement('div'); w.className='ingrow'; w.innerHTML=`
      <input data-k="item" placeholder="材料名 *" value="${esc(v.item||'')}" />
      <input data-k="quantity" placeholder="数量" value="${v.quantity??''}" />
      <div class="row"><input data-k="unit" class="small" placeholder="単位" value="${esc(v.unit||'')}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      w.querySelector('[data-act="rm"]').addEventListener('click',()=>w.remove()); ingList.appendChild(w); }
    function addStepRow(v={}){ const w=document.createElement('div'); w.className='ingrow'; w.innerHTML=`
      <input data-k="instruction" placeholder="手順 *" value="${esc(v.instruction||'')}" />
      <input data-k="timer_sec" placeholder="秒" value="${v.timer_sec??''}" />
      <div class="row"><input data-k="temp_c" class="small" placeholder="℃" value="${v.temp_c??''}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      w.querySelector('[data-act="rm"]').addEventListener('click',()=>w.remove()); stepList.appendChild(w); }
    ings.forEach(addIngRow); steps.forEach(addStepRow);
    $('#addIng',detailEl)?.addEventListener('click',()=>addIngRow({}));
    $('#addStep',detailEl)?.addEventListener('click',()=>addStepRow({}));
    $('#save',detailEl)?.addEventListener('click',saveCurrent);
    $('#del',detailEl)?.addEventListener('click',delCurrent);

    (async()=>{ const btn=$('#favToggle',detailEl); if(!btn) return;
      let on = await isFav(r.id); btn.textContent = on?'♥':'♡';
      btn.addEventListener('click', async ()=>{ on=!on; const ok=await setFav(r.id,on); if(!ok){ on=!on; return; } btn.textContent = on?'♥':'♡'; if((location.hash||'#').slice(1)==='fav') loadFav(); });
    })();
  }

  // --- CRUD ---
  function num(s){ const v=parseFloat(String(s||'').replace(/[, \t]/g,'')); return Number.isFinite(v)?v:null; }
  async function saveCurrent(){
    const r=state.current?.recipe || { title:'' }; const idv=r.id;
    const payload={ title:$('#fTitle').value.trim(), yield:num($('#fYield').value), yield_unit:$('#fYieldUnit').value.trim()||null, tags: $('#fTags').value.split(',').map(s=>s.trim()).filter(Boolean), meta:{ note: $('#fNote').value } };
    if(!payload.title){ alert('タイトルは必須です'); return; }
    let res; if(idv) res=await sb.from('recipes').update(payload).eq('id',idv).select('*').single(); else res=await sb.from('recipes').insert(payload).select('*').single();
    if(res.error){ alert('保存失敗: '+res.error.message); return; }
    const recipe_id = res.data.id;
    const ingRows = $$('#ingList .ingrow').map((row,i)=>{ const g=k=>$('[data-k="'+k+'"]',row)?.value||''; const q=num(g('quantity')); return { recipe_id, position:i+1, item:g('item').trim(), quantity:(q==null?null:q), unit:(g('unit').trim()||null) }; }).filter(x=>x.item);
    const stepRows= $$('#stepList .ingrow').map((row,i)=>{ const g=k=>$('[data-k="'+k+'"]',row)?.value||''; const t=parseInt(g('timer_sec')); const tmp=num(g('temp_c')); return { recipe_id, position:i+1, instruction:g('instruction').trim(), timer_sec:(Number.isFinite(t)?t:null), temp_c:tmp }; }).filter(x=>x.instruction);
    await sb.from('recipe_ingredients').delete().eq('recipe_id',recipe_id);
    await sb.from('recipe_steps').delete().eq('recipe_id',recipe_id);
    if(ingRows.length){ const {error:e1}=await sb.from('recipe_ingredients').insert(ingRows); if(e1){ alert('材料の保存に失敗: '+e1.message); return; } }
    if(stepRows.length){ const {error:e2}=await sb.from('recipe_steps').insert(stepRows); if(e2){ alert('手順の保存に失敗: '+e2.message); return; } }
    await loadRecipes(); await openRecipe(recipe_id);
  }
  async function delCurrent(){
    if(!state.current?.recipe?.id) return;
    if(!confirm('このレシピを削除しますか？')) return;
    const idv=state.current.recipe.id;
    const { error } = await sb.from('recipes').delete().eq('id',idv);
    if(error){ alert('削除失敗: '+error.message); return; }
    state.current=null; detailEl.innerHTML=''; await loadRecipes(); await loadOverview(); await loadFav();
  }

  // --- Favorites (client_id) ---
  const favListEl = $('#favList');
  function renderFavList(items){
    favListEl.innerHTML='';
    if(!items.length){ const d=document.createElement('div'); d.className='empty'; d.textContent='お気に入りがありません。'; favListEl.appendChild(d); return; }
    items.forEach(r=>{ const card=document.createElement('div'); card.className='card'; card.innerHTML=`<div class="t">${esc(r.title)}</div>`; card.addEventListener('click',()=>{ show('recipes'); openRecipe(r.id); }); favListEl.appendChild(card); });
  }
  async function isFav(recipe_id){ const { data }=await sb.from('favorites').select('id').eq('client_id', identity.client_id).eq('recipe_id', recipe_id).limit(1); return !!(data&&data[0]); }
  async function setFav(recipe_id, on){
    if(on){
      const { error } = await sb.from('favorites').insert({ client_id: identity.client_id, recipe_id });
      if(error && error.code!=='23505'){ alert('追加に失敗: '+error.message); return false; }
      return true;
    }else{
      const { error } = await sb.from('favorites').delete().eq('client_id', identity.client_id).eq('recipe_id', recipe_id);
      if(error){ alert('削除に失敗: '+error.message); return false; }
      return true;
    }
  }

  // --- Settings ---
  $('#search')?.addEventListener('input', e=>{ state.search=e.target.value||''; renderList(state.list); });
  $('#btnNew')?.addEventListener('click', ()=>{ state.current={ recipe:{title:''}, ings:[], steps:[] }; show('recipes'); renderDetail(); });

  // Export / Import (オプション：自分の client_id に紐づけはしないで全体を対象とします)
  $('#btnExport')?.addEventListener('click', async ()=>{
    const { data: recipes } = await sb.from('recipes').select('*').order('updated_at',{ascending:false});
    const ids = (recipes||[]).map(r=>r.id);
    const { data: ings } = await sb.from('recipe_ingredients').select('*').in('recipe_id', ids);
    const { data: steps }= await sb.from('recipe_steps').select('*').in('recipe_id', ids);
    const blob = new Blob([JSON.stringify({ recipes, ings, steps }, null, 2)], { type:'application/json' });
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='recipes-export.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  $('#btnImport')?.addEventListener('click', ()=> $('#fileImport')?.click());
  $('#fileImport')?.addEventListener('change', async (e)=>{
    const file=e.target.files?.[0]; if(!file) return; const text=await file.text();
    try{
      const obj=JSON.parse(text); if(!Array.isArray(obj.recipes)) throw new Error('不正な形式');
      for(const r of obj.recipes){
        const payload={ title:r.title, yield:r.yield, yield_unit:r.yield_unit, tags:r.tags||[], meta:r.meta||{} };
        const { data: ins, error } = await sb.from('recipes').insert(payload).select('*').single(); if(error) throw error;
        const recipe_id=ins.id;
        const ingRows=(obj.ings||[]).filter(x=>x.recipe_id===r.id).map((x,i)=>({ recipe_id, position:i+1, item:x.item, quantity:x.quantity, unit:x.unit }));
        const stepRows=(obj.steps||[]).filter(x=>x.recipe_id===r.id).map((x,i)=>({ recipe_id, position:i+1, instruction:x.instruction, timer_sec:x.timer_sec, temp_c:x.temp_c }));
        if(ingRows.length){ const {error:e1}=await sb.from('recipe_ingredients').insert(ingRows); if(e1) throw e1; }
        if(stepRows.length){ const {error:e2}=await sb.from('recipe_steps').insert(stepRows); if(e2) throw e2; }
      }
      alert('インポート完了'); await loadRecipes(); await loadOverview();
    }catch(err){ alert('インポート失敗: '+(err?.message||err)); } finally { e.target.value=''; }
  });

  // --- Start ---
  async function loadRecipes(){ state.list = await qRecipesLite(); renderList(state.list); }
  async function loadFav(){ const items = await qFavList(); renderFavList(items); }
  show((location.hash||'#home').slice(1));
  loadOverview();
  loadRecipes();
})();