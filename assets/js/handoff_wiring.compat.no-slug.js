// JavaScript Document/* handoff_wiring.compat.no-slug.js — 競合ゼロ & slug非依存 受け渡し配線 */
(function(){
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  // index: 配線のみ（APIは呼ばない）
  function wireIndexLinks(){
    $$('a.recipe-link,[data-recipe-id],[data-recipe-json]').forEach(el=>{
      if(el.hasAttribute('data-handoff-wired')) return; el.setAttribute('data-handoff-wired','1');
      if(el.tagName==='A'&&!el.getAttribute('href')){ const id=el.getAttribute('data-recipe-id'); if(id) el.setAttribute('href',`recipe_view.html?id=${encodeURIComponent(id)}`); }
      el.addEventListener('click',e=>{ if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||el.target==='_blank') return; const raw=el.getAttribute('data-recipe-json'); if(raw){ try{localStorage.setItem('selected_recipe',raw);}catch{} } },{capture:true,passive:true});
    });
  }
  function setupIndex(){ wireIndexLinks(); const list=document.getElementById('cardList')||document.body; new MutationObserver(()=>wireIndexLinks()).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['data-recipe-json','data-recipe-id','href']}); }
  // view: ?id→Supabase(既存window.sb前提) / 無ければlocalStorage
  async function fetchByIdIfClientExists(id){ if(!window.sb) return null; try{ const {data,error}=await sb.from('recipes').select('*').eq('id',id).single(); if(error) return null; return data; }catch{ return null; } }
  function parseLocal(){ try{ const s=localStorage.getItem('selected_recipe'); return s?JSON.parse(s):null;}catch{ return null; } }
  function renderBadges(tags){ const w=$('#tags'); if(!w) return; w.innerHTML=''; (tags||[]).forEach(t=>{ const b=document.createElement('span'); b.className='badge'; b.textContent=t; w.appendChild(b); }); }
  function renderIngredients(ings){ const box=$('#ingredients'); if(!box) return; box.innerHTML=''; if(!ings||!ings.length){ box.innerHTML='<div class="muted">未登録</div>'; return;} const tbl=document.createElement('table'); tbl.className='table'; tbl.innerHTML='<thead><tr><th>材料</th><th style="text-align:right">数量</th><th>単位</th></tr></thead><tbody></tbody>'; const tb=tbl.querySelector('tbody'); ings.forEach(it=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${esc(it.item||'')}</td><td class="num" style="text-align:right">${esc(String(it.quantity??''))}</td><td>${esc(String(it.unit??''))}</td>`; tb.appendChild(tr); }); box.appendChild(tbl); }
  function renderSteps(steps){ const ol=$('#steps'); if(!ol) return; ol.innerHTML=''; if(!steps||!steps.length){ ol.innerHTML='<li class="muted">未登録</li>'; return;} steps.forEach(s=>{ const li=document.createElement('li'); li.textContent=s; ol.appendChild(li); }); }
  function renderMeta(c,u){ const m=$('#meta'); if(!m) return; const fmt=d=>d?new Date(d).toLocaleDateString():'—'; m.textContent=`作成日 ${fmt(c)} / 更新日 ${fmt(u)}`; }
  function renderView(r){ const t=$('#recipeTitle'); if(t) t.textContent=r.title||'無題のレシピ'; const i=$('#recipeIntro'); if(i) i.textContent=r.intro||r.description||''; const n=$('#notes'); if(n) n.textContent=r.notes||''; renderBadges(r.tags||r.tag_list||[]); renderIngredients(r.ingredients||[]); renderSteps(r.steps||[]); renderMeta(r.created_at,r.updated_at); }
  async function setupView(){ if(!$('#recipeTitle')||!$('#steps')) return; const p=new URLSearchParams(location.search); const id=p.get('id'); let r=null; if(id) r=await fetchByIdIfClientExists(id); if(!r) r=parseLocal(); if(!r){ renderView({ title:'レシピが見つかりません', intro:'トップからレシピを選び直してください。', ingredients:[], steps:[] }); return;} renderView(r); try{ localStorage.setItem('last_opened_recipe', JSON.stringify(r)); }catch{} }
  document.addEventListener('DOMContentLoaded',()=>{ setupIndex(); setupView(); });
})();