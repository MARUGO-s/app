// app.supabase.js — secure-only build (no anon probing; no 404 noise)
(function(){
  'use strict';
  const sb = window.sb;
  if(!sb){ console.error('[Supabase] client not found'); return; }

  const $  = (s, el=document)=> el.querySelector(s);
  const $$ = (s, el=document)=> [...el.querySelectorAll(s)];
  const esc = (s)=> (s??'').toString().replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[m]));

  // ===== Identity: always secure mode =====
  const identity = { uid:null, rlsMode:'secure' };
  (async ()=>{
    try{ const { data:{ user } } = await sb.auth.getUser(); identity.uid = user?.id || null; }catch{}
    // reflect auth state changes
    sb.auth.onAuthStateChange((_e, sess)=>{ identity.uid = sess?.user?.id || null; });
  })();

  // ===== Minimal state/views =====
  const state = { list:[], favList:[], current:null, search:'' };
  const views = { home:$('#view-home'), recipes:$('#view-recipes'), fav:$('#view-fav'), settings:$('#view-settings') };
  const nav   = { home:'#btnNavHome', recipes:'#btnNavRecipes', fav:'#btnNavFav', settings:'#btnNavSettings' };

  function show(view){
    Object.entries(views).forEach(([k,el])=>{ if(el) el.style.display=(k===view)?'':''; });
    Object.entries(nav).forEach(([k,sel])=>{ const b=$(sel); if(!b) return; const on=(k===view); b.classList.toggle('active',on); if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    location.hash='#'+view;
    if(view==='recipes') loadAndRender();
    if(view==='fav')     loadAndRenderFav();
  }
  $('#btnNavHome')?.addEventListener('click',()=>show('home'));
  $('#btnNavRecipes')?.addEventListener('click',()=>show('recipes'));
  $('#btnNavFav')?.addEventListener('click',()=>show('fav'));
  $('#btnNavSettings')?.addEventListener('click',()=>show('settings'));
  window.addEventListener('hashchange',()=>{ const v=(location.hash||'#recipes').slice(1); show(['home','recipes','fav','settings'].includes(v)?v:'recipes'); });

  // ===== Queries =====
  async function fetchRecipesLite(limit=200){
    const { data, error } = await sb.from('recipes').select('id,title,tags,updated_at').order('updated_at',{ascending:false}).limit(limit);
    if(error){ console.error(error); return []; } return data;
  }
  async function fetchRecipeFull(id){
    const { data: recipe, error: e1 } = await sb.from('recipes').select('*').eq('id',id).single(); if(e1) throw e1;
    const { data: ings }  = await sb.from('recipe_ingredients').select('*').eq('recipe_id',id).order('position',{ascending:true});
    const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id',id).order('position',{ascending:true});
    return { recipe, ings: ings||[], steps: steps||[] };
  }

  // ===== Recipes list/detail =====
  const listEl = $('#list'), detailEl = $('#detail');
  function renderList(items){
    const q=state.search.trim().toLowerCase();
    const filtered = q? items.filter(r=>{ const tgt=[r.title,...(r.tags||[])].join(' ').toLowerCase(); return q.split(/\s+/).every(w=>tgt.includes(w)); }) : items;
    listEl.innerHTML='';
    if(!filtered.length){ const div=document.createElement('div'); div.className='empty'; div.textContent='レシピがありません。'; listEl.appendChild(div); return; }
    filtered.forEach(r=>{
      const card=document.createElement('div'); card.className='card';
      card.innerHTML=`<div class="t">${esc(r.title)}</div>
        <div class="meta">${(r.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</div>
        <div class="meta">${r.updated_at ? '更新: '+new Date(r.updated_at).toLocaleString('ja-JP',{hour12:false}) : ''}</div>`;
      card.addEventListener('click',()=>openRecipe(r.id));
      listEl.appendChild(card);
    });
  }
  async function openRecipe(id){
    try{ state.current = await fetchRecipeFull(id); renderDetail(); }catch(e){ alert('読み込みに失敗: '+(e?.message||e)); }
  }
  function renderDetail(){
    const r=state.current?.recipe; const ings=state.current?.ings||[]; const steps=state.current?.steps||[];
    if(!r){ detailEl.innerHTML=`<div class="empty">左の一覧から選択してください。</div>`; return; }
    detailEl.innerHTML=`
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
      <div class="row"><button id="save" class="btn primary">保存</button><button id="del" class="btn danger">削除</button></div>`;
    const ingList=$('#ingList',detailEl), stepList=$('#stepList',detailEl);
    function addIngRow(v={}){ const w=document.createElement('div'); w.className='ingrow'; w.innerHTML=`
      <input data-k="item" placeholder="材料名 *" value="${esc(v.item||'')}" />
      <input data-k="quantity" placeholder="数量" value="${v.quantity??''}" />
      <div class="row"><input data-k="unit" class="small" placeholder="単位" value="${esc(v.unit||'')}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      w.querySelector('[data-act="rm"]').addEventListener('click',()=>w.remove()); ingList.appendChild(w);
    }
    function addStepRow(v={}){ const w=document.createElement('div'); w.className='ingrow'; w.innerHTML=`
      <input data-k="instruction" placeholder="手順 *" value="${esc(v.instruction||'')}" />
      <input data-k="timer_sec" placeholder="秒" value="${v.timer_sec??''}" />
      <div class="row"><input data-k="temp_c" class="small" placeholder="℃" value="${v.temp_c??''}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      w.querySelector('[data-act="rm"]').addEventListener('click',()=>w.remove()); stepList.appendChild(w);
    }
    ings.forEach(addIngRow); steps.forEach(addStepRow);
    $('#addIng',detailEl)?.addEventListener('click',()=>addIngRow({}));
    $('#addStep',detailEl)?.addEventListener('click',()=>addStepRow({}));
    $('#save',detailEl)?.addEventListener('click',saveCurrent);
    $('#del',detailEl)?.addEventListener('click',delCurrent);

    // Fav toggle（要ログイン）
    (async ()=>{
      const btn=$('#favToggle',detailEl);
      if(!btn) return;
      if(!identity.uid){
        btn.addEventListener('click',()=> alert('お気に入りはログインが必要です'));
        return;
      }
      let on = await isFav(r.id);
      btn.textContent = on ? '♥' : '♡';
      btn.addEventListener('click', async ()=>{
        on = !on;
        const ok = await setFav(r.id, on);
        if(!ok){ on=!on; return; }
        btn.textContent = on ? '♥':'♡';
        if((location.hash||'#').slice(1)==='fav') await loadAndRenderFav();
      });
    })();
  }

  // ===== Favorites (login required) =====
  const favListEl = $('#favList');
  function renderFavList(items){
    favListEl.innerHTML='';
    if(!items.length){ const d=document.createElement('div'); d.className='empty'; d.textContent='お気に入りがありません。'; favListEl.appendChild(d); return; }
    items.forEach(r=>{
      const card=document.createElement('div'); card.className='card';
      card.innerHTML=`<div class="t">${esc(r.title)}</div>
        <div class="meta">${(r.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</div>
        <div class="meta">${r.updated_at ? '更新: '+new Date(r.updated_at).toLocaleString('ja-JP',{hour12:false}) : ''}</div>`;
      card.addEventListener('click',()=>{ show('recipes'); openRecipe(r.id); });
      favListEl.appendChild(card);
    });
  }
  async function isFav(recipe_id){
    if(!identity.uid) return false;
    const { data, error } = await sb.from('favorites').select('id').eq('user_id', identity.uid).eq('recipe_id', recipe_id).limit(1);
    if(error){ console.error(error); return false; }
    return !!(data && data[0]);
  }
  async function setFav(recipe_id, on){
    if(!identity.uid) return false;
    if(on){
      const { error } = await sb.from('favorites').insert({ user_id: identity.uid, recipe_id });
      if(error && error.code!=='23505'){ alert('追加に失敗: '+error.message); return false; }
      return true;
    }else{
      const { error } = await sb.from('favorites').delete().eq('user_id', identity.uid).eq('recipe_id', recipe_id);
      if(error){ alert('削除に失敗: '+error.message); return false; }
      return true;
    }
  }
  async function fetchFavList(){
    if(!identity.uid){
      favListEl.innerHTML = '<div class="empty">お気に入りを見るにはログインしてください。</div>';
      return [];
    }
    const { data, error } = await sb.from('favorites')
      .select('recipe_id, recipes!inner(id,title,tags,updated_at)')
      .eq('user_id', identity.uid).order('created_at',{ascending:false});
    if(error){ console.error(error); return []; }
    return (data||[]).map(x=>x.recipes);
  }

  // ===== Save/Delete =====
  function num(s){ const v=parseFloat(String(s||'').replace(/[, \t]/g,'')); return Number.isFinite(v)?v:null; }
  async function saveCurrent(){
    if(!identity.uid){ alert('保存はログインが必要です'); return; }
    const r=state.current?.recipe || { title:'' }; const id=r.id;
    const payload={ title:$('#fTitle').value.trim(), yield:num($('#fYield').value), yield_unit:$('#fYieldUnit').value.trim()||null,
      tags: $('#fTags').value.split(',').map(s=>s.trim()).filter(Boolean), meta:{ note: $('#fNote').value } };
    if(!payload.title){ alert('タイトルは必須です'); return; }
    let res; if(id) res=await sb.from('recipes').update(payload).eq('id',id).select('*').single();
             else  res=await sb.from('recipes').insert(payload).select('*').single();
    if(res.error){ alert('保存失敗: '+res.error.message); return; }
    const recipe_id=res.data.id;
    const ingRows = $$('#ingList .ingrow').map((row,i)=>{ const get=k=> $('[data-k="'+k+'"]',row)?.value||''; const qty=num(get('quantity'));
      return { recipe_id, position:i+1, item:get('item').trim(), quantity:(qty==null?null:qty), unit:(get('unit').trim()||null) }; }).filter(x=>x.item);
    const stepRows= $$('#stepList .ingrow').map((row,i)=>{ const get=k=> $('[data-k="'+k+'"]',row)?.value||''; const t=parseInt(get('timer_sec')); const temp=num(get('temp_c'));
      return { recipe_id, position:i+1, instruction:get('instruction').trim(), timer_sec:(Number.isFinite(t)?t:null), temp_c:temp }; }).filter(x=>x.instruction);
    await sb.from('recipe_ingredients').delete().eq('recipe_id',recipe_id);
    await sb.from('recipe_steps').delete().eq('recipe_id',recipe_id);
    if(ingRows.length){ const {error:e1}=await sb.from('recipe_ingredients').insert(ingRows); if(e1){ alert('材料の保存に失敗: '+e1.message); return; } }
    if(stepRows.length){ const {error:e2}=await sb.from('recipe_steps').insert(stepRows); if(e2){ alert('手順の保存に失敗: '+e2.message); return; } }
    await loadAndRender(); await openRecipe(recipe_id);
  }
  async function delCurrent(){
    if(!identity.uid){ alert('削除はログインが必要です'); return; }
    if(!state.current?.recipe?.id) return;
    if(!confirm('このレシピを削除しますか？')) return;
    const id=state.current.recipe.id;
    const { error } = await sb.from('recipes').delete().eq('id',id);
    if(error){ alert('削除失敗: '+error.message); return; }
    state.current=null; detailEl.innerHTML=''; await loadAndRender(); await loadAndRenderFav();
  }

  // ===== Loaders & UI =====
  async function loadAndRender(){ state.list = await fetchRecipesLite(); renderList(state.list); }
  async function loadAndRenderFav(){ state.favList = await fetchFavList(); renderFavList(state.favList); }
  $('#search')?.addEventListener('input',e=>{ state.search=e.target.value||''; renderList(state.list); });
  $('#btnNew')?.addEventListener('click',()=>{ state.current={ recipe:{title:''}, ings:[], steps:[] }; show('recipes'); renderDetail(); });

  // Kick
  show((location.hash||'#recipes').slice(1));
  loadAndRender();
})();