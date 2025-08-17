// app-index.js — 回復用（slug無し・受け渡し安定版）
// 目的：
//  - recipes.slug を一切参照しない（400回避）
//  - 一覧を Supabase から取得して表示
//  - クリック時に localStorage.selected_recipe にJSON保存
//  - recipe_view.html へ ?id=... で遷移（view側は id で取得）
//  - window.sb を共有（view側がそのまま利用可）

(function(){
  'use strict';

  const $  = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const esc = (s)=> String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));

  // === Supabase ===
  const PROJECT_URL = 'https://ctxyawinblwcbkovfsyj.supabase.co';
  const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q';
  if (window.supabase && !window.sb){ window.sb = window.supabase.createClient(PROJECT_URL, ANON_KEY); }
  const sb = window.sb;

  // === カード生成 ===
  function buildCard(row){
    const a = document.createElement('a');
    a.className = 'card recipe-link';
    a.href = `recipe_view.html?id=${encodeURIComponent(row.id)}`;
    a.dataset.recipeId = row.id;
    try{ a.setAttribute('data-recipe-json', JSON.stringify({ id: row.id, title: row.title, tags: row.tags || [], updated_at: row.updated_at })); }catch{}

    a.innerHTML = `
      <div class="card-body">
        <div class="card-title">${esc(row.title || '無題')}</div>
        <div class="card-meta">更新 ${fmtDate(row.updated_at)}</div>
        ${Array.isArray(row.tags) && row.tags.length ? `<div class="card-tags">${row.tags.map(t=>`<span class="badge">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`;

    // クリックで localStorage へ保存（新規タブ等は素通し）
    a.addEventListener('click', (e)=>{
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target==='_blank') return;
      const raw = a.getAttribute('data-recipe-json');
      if (raw){ try{ localStorage.setItem('selected_recipe', raw); }catch{} }
    }, { capture:true, passive:true });

    return a;
  }

  function fmtDate(d){ if(!d) return '-'; const x=new Date(d); return isNaN(x)?'-': x.toLocaleDateString('ja-JP'); }

  // === 一覧取得 ===
  async function loadList(){
    const list  = $('#cardList');
    const empty = $('#empty-message');
    if (!list) return;

    try{
      const { data, error } = await sb
        .from('recipes')
        .select('id,title,updated_at,tags')  // ← slug を一切参照しない
        .order('updated_at', { ascending:false })
        .limit(200);
      if (error) throw error;

      list.innerHTML = '';
      if (!data || data.length === 0){
        if (empty) empty.style.display = '';
        return;
      }
      if (empty) empty.style.display = 'none';

      const frag = document.createDocumentFragment();
      data.forEach(row => frag.appendChild(buildCard(row)));
      list.appendChild(frag);
    }catch(e){
      console.error('[index] fetch error:', e);
      if (empty){
        empty.style.display = '';
        empty.innerHTML = `<h2>読み込みに失敗しました</h2><p>${esc(e.message || e)}</p>`;
      }
    }
  }

  // === イベント ===
  function wireHeader(){
    const newBtn = document.querySelector('.js-new');
    if (newBtn) newBtn.addEventListener('click', ()=> location.href='recipe_edit.html');
  }

  document.addEventListener('DOMContentLoaded', ()=>{ wireHeader(); loadList(); });
})();
