
/*! header.dropdown.js — Mobile header buttons -> dropdown (no HTML edits required) */
(function(){
  'use strict';

  // ===== Inject minimal CSS so you don't need to edit style.css =====
  (function injectCSS(){
    if (document.getElementById('hdrSelectCSS')) return;
    const st = document.createElement('style');
    st.id = 'hdrSelectCSS';
    st.textContent = `
      .hdr-select-wrap{ display:none; }
      .hdr-select{ appearance:auto; background: var(--panel); color: var(--text);
        border: 1px solid var(--border-strong); border-radius: 10px; padding: 10px 12px;
        min-width: 180px; font-size: 0.95em; }
      .hdr-select:focus{ outline: none; box-shadow: 0 0 0 4px rgba(34,197,94,.30); border-color: var(--accent); }
      @media (max-width: 900px){
        header .row{ display:none; }          /* hide original header buttons */
        .hdr-select-wrap{ display:block; }   /* show dropdown instead */
      }
    `;
    document.head.appendChild(st);
  })();

  // ===== Build dropdown =====
  function makeDropdown(){
    if (document.getElementById('hdrSelectWrap')) return;

    const header = document.querySelector('header');
    if (!header) return;

    const wrap = document.createElement('div');
    wrap.id = 'hdrSelectWrap';
    wrap.className = 'hdr-select-wrap';

    const sel = document.createElement('select');
    sel.id = 'hdrSelect';
    sel.className = 'hdr-select';
    sel.setAttribute('aria-label','モバイルメニュー');

    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = 'メニュー…';
    sel.appendChild(opt0);

    const groups = [
      { label:'ナビ', items:[
        {text:'ホーム', id:'btnNavHome'},
        {text:'レシピ', id:'btnNavRecipes'},
        {text:'お気に入り', id:'btnNavFav'},
        {text:'設定', id:'btnNavSettings'},
      ]},
      { label:'操作', items:[
        {text:'エクスポート', id:'btnExport'},
        {text:'インポート', id:'btnImport'},
        {text:'＋ 新規レシピ', id:'btnNew'},
        {text:'A−（文字小）', id:'btnSmaller'},
        {text:'A＋（文字大）', id:'btnLarger'},
        {text:'調理モード切替', id:'btnToggleMode'},
        {text:'テーマ切替', id:'btnTheme'},
        {text:'ダミー20件', id:'btnDummy20'},
      ]}
    ];

    groups.forEach(g=>{
      const og = document.createElement('optgroup');
      og.label = g.label;
      g.items.forEach(it=>{
        const o = document.createElement('option');
        o.value = it.id; o.textContent = it.text;
        // disable if the button doesn't exist yet
        if(!document.getElementById(it.id)) o.disabled = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });

    sel.addEventListener('change', function(){
      const id = this.value;
      if(!id) return;
      const btn = document.getElementById(id);
      if(btn){
        // Dispatch a click. For import等、元のボタンのハンドラを呼び出す
        btn.click();
      }
      // reset to placeholder
      setTimeout(()=> { this.value = ''; }, 0);
    });

    wrap.appendChild(sel);
    header.appendChild(wrap);
  }

  // Ensure dropdown exists after DOM ready
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', makeDropdown);
  } else {
    makeDropdown();
  }

  // If header buttons get added later, refresh disabled state
  const obs = new MutationObserver(()=>{
    const sel = document.getElementById('hdrSelect');
    if(!sel) return;
    Array.from(sel.options).forEach(op=>{
      if(!op.value) return;
      const exists = !!document.getElementById(op.value);
      op.disabled = !exists;
    });
  });
  obs.observe(document.body || document.documentElement, {subtree:true, childList:true});
})();
