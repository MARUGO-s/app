/* app-index.js (wired)
   目的: トップページの一覧から recipe_view.html へ “確実に” レシピ情報を渡す。
   - クリック時に localStorage.selected_recipe を保存
   - URL は ?id=<uuid>（idが無い場合は slug を使用、どちらも無ければクエリ無しで遷移）
   - 既存DOMにも後付けで適用できるよう、委譲/明示バインドの両対応
*/

(function(){
  const $ = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));

  // ===== Supabase 初期化（存在すれば使う。無ければ localStorage のみで動作） =====
  if (window.supabase && !window.sb) {
    window.sb = window.supabase.createClient(
      "https://ctxyawinblwcbkovfsyj.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q"
    );
  }

  // ===== 遷移ヘルパ =====
  function navigateToRecipe(recipe){
    try { localStorage.setItem('selected_recipe', JSON.stringify(recipe||{})); } catch {}
    const id = recipe?.id || recipe?.recipe_id || '';
    const slug = recipe?.slug || '';
    const qs = id ? `?id=${encodeURIComponent(id)}` : (slug ? `?slug=${encodeURIComponent(slug)}` : '');
    location.href = `recipe_view.html${qs}`;
  }

  // ===== クリック配線（既存マークアップに後付け可能） =====
  function wireRecipeLinks(root=document){
    // data-recipe もしくは data-recipe-id を持つ要素を対象
    $$('[data-recipe], [data-recipe-id]', root).forEach(el=>{
      // aタグ以外でもOK
      if (!el.dataset.wired) {
        el.addEventListener('click', (e)=>{
          // 修飾キー時はブラウザ標準の挙動を尊重
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          let payload = null;
          if (el.hasAttribute('data-recipe')) {
            try { payload = JSON.parse(el.getAttribute('data-recipe')); } catch {}
          }
          if (!payload) payload = { id: el.getAttribute('data-recipe-id') || '', slug: el.getAttribute('data-recipe-slug') || '' };
          navigateToRecipe(payload);
        }, { capture:true });
        el.dataset.wired = '1';
      }
      // href を補完
      const id = el.getAttribute('data-recipe-id');
      const slug = el.getAttribute('data-recipe-slug');
      if (el.tagName === 'A' && !el.getAttribute('href')) {
        if (id) el.setAttribute('href', `recipe_view.html?id=${encodeURIComponent(id)}`);
        else if (slug) el.setAttribute('href', `recipe_view.html?slug=${encodeURIComponent(slug)}`);
        else el.setAttribute('href', 'recipe_view.html');
      }
    });
  }

  // ===== 一覧取得と描画（必要な場合のみ。既にサーバ描画済みならスキップ可） =====
  async function fetchAndRenderList(){
    const listRoot = $('#recipe-list');
    if (!listRoot) return; // サーバサイドで描画済みのケース

    // Supabase から取れるなら取る
    let rows = [];
    if (window.sb) {
      try {
        const { data, error } = await sb
          .from('recipes')
          .select('id, title, category, tags, ingredients, steps, slug, updated_at')
          .order('updated_at', { ascending:false })
          .limit(200);
        if (error) throw error; rows = data||[];
      } catch (e) { console.warn('fetch list failed:', e.message); }
    }

    // 何も取れなければ localStorage の最後のレシピだけでも出す
    if (!rows.length) {
      try{
        const last = localStorage.getItem('last_opened_recipe');
        if (last) rows = [JSON.parse(last)];
      }catch{}
    }

    // それでも無ければ UI だけ安全に
    if (!rows.length) {
      listRoot.innerHTML = '<div class="muted">レシピがありません</div>';
      return;
    }

    // シンプルなカード描画
    const frag = document.createDocumentFragment();
    rows.forEach(r=>{
      const a = document.createElement('a');
      a.className = 'card recipe-card';
      a.setAttribute('data-recipe-id', r.id || '');
      a.setAttribute('data-recipe-slug', r.slug || '');
      try { a.setAttribute('data-recipe', JSON.stringify(r)); } catch {}
      a.innerHTML = `
        <div class="card-body">
          <div class="card-title">${escapeHtml(r.title||'無題')}</div>
          <div class="card-meta">${escapeHtml(r.category||'')}・更新 ${fmtDate(r.updated_at)}</div>
          <div class="card-tags">${(r.tags||[]).map(t=>`<span class="badge">${escapeHtml(t)}</span>`).join('')}</div>
        </div>`;
      frag.appendChild(a);
    });
    listRoot.innerHTML = '';
    listRoot.appendChild(frag);
    wireRecipeLinks(listRoot);
  }

  function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m])); }
  function fmtDate(d){ if(!d) return '-'; const x=new Date(d); return isNaN(x)?'-': x.toLocaleDateString(); }

  // ===== 起動 =====
  document.addEventListener('DOMContentLoaded', ()=>{
    // 既存マークアップに data- 属性があるだけで動く
    wireRecipeLinks(document);
    // コンテナがあるときだけ一覧を自前描画
    fetchAndRenderList();
  });
})();
