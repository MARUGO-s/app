
/*! price.plugin.v4.1.js — CSV原価 + 材料プルダウン（安定版・edit時のみ表示） */
(function(){
  'use strict';
  window.__pricePlugin = 'v4.1';

  const PRICE_KEY = 'recipeBox.price.v1';
  const CONV_KEY  = 'recipeBox.conv.v1';

  const save = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} };
  const load = (k,d)=>{ try{ const r=localStorage.getItem(k); return r? JSON.parse(r): d; }catch(_){ return d; } };

  function getDefaultConv(){
    return {
      piece_weights: [ {name:'卵',unit:'個',g:55}, {name:'にんにく',unit:'片',g:5}, {name:'長ねぎ',unit:'本',g:80} ],
      densities:     [ {name:'水',g_per_ml:1.0}, {name:'牛乳',g_per_ml:1.03}, {name:'油',g_per_ml:0.92} ],
      aliases:       [ {from:'パーチバター', to:'よつ葉パーチバター'} ]
    };
  }
  let priceList = load(PRICE_KEY, []);
  let conv = load(CONV_KEY, getDefaultConv());

  function parseCsv(text){
    const rows=[]; let row=[], cur='', q=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(q){
        if(c=='"' && n=='"'){ cur+='"'; i++; continue; }
        if(c=='"'){ q=false; continue; }
        cur+=c; continue;
      }else{
        if(c=='"'){ q=true; continue; }
        if(c==','){ row.push(cur.trim()); cur=''; continue; }
        if(c=='\n'){ row.push(cur.trim()); rows.push(row); row=[]; cur=''; continue; }
        if(c=='\r'){ continue; }
        cur+=c;
      }
    }
    if(cur.length || row.length){ row.push(cur.trim()); rows.push(row); }
    return rows.filter(r=> r.length && r.join('').length);
  }
  function csvToPrices(csvRows){
    if(!csvRows || !csvRows.length) return [];
    const header = csvRows[0].map(h=>String(h||'').toLowerCase());
    const idx = k => header.indexOf(k);
    const out=[];
    for(let i=1;i<csvRows.length;i++){
      const r=csvRows[i];
      const item=(r[idx('item')]||'').trim(); if(!item) continue;
      const unit=(r[idx('unit')]||'g').trim().toLowerCase();
      const packSize=parseFloat(String(r[idx('pack_size')]||'').replace(/,/g,''))||0;
      const packPrice=parseFloat(String(r[idx('pack_price')]||'').replace(/,/g,''))||0;
      let unitPrice=parseFloat(String(r[idx('unit_price')]||'').replace(/,/g,''));
      if(!unitPrice && packSize>0 && packPrice>0) unitPrice=packPrice/packSize;
      out.push({ item, unit, packSize, packPrice, unitPrice,
        brand: (idx('brand')>-1? r[idx('brand')]:''), notes: (idx('notes')>-1? r[idx('notes')]:''),
      });
    }
    return out;
  }

  const UMAP = {
    g:{kind:'mass', toBase:v=>v}, kg:{kind:'mass', toBase:v=>v*1000},
    ml:{kind:'vol',  toBase:v=>v}, l:{kind:'vol',  toBase:v=>v*1000},
    個:{kind:'count',toBase:v=>v}, 本:{kind:'count',toBase:v=>v}, 枚:{kind:'count',toBase:v=>v}, 片:{kind:'count',toBase:v=>v}
  };
  function parseAmount(str){
    if(!str) return {qty:0, unit:'g', factor:1};
    const mm=String(str).trim().match(/@\s*([0-9]*\.?[0-9]+)/);
    const factor = mm? parseFloat(mm[1]) : 1;
    const s = String(str).replace(/@[^]*$/,'');
    const m=s.trim().match(/^\s*([0-9]*\.?[0-9]+)\s*([a-zA-Zぁ-んァ-ヶ一-龯個本枚片gkmlL]*)?\s*$/);
    if(!m) return {qty:0, unit:'g', factor};
    let qty=parseFloat(m[1]);
    let unit=(m[2]||'g').toLowerCase();
    if(unit==='kg') unit='kg'; if(unit==='l') unit='l';
    return {qty, unit, factor};
  }
  function bestPriceFor(name, unit){
    const qn = String(name||'').toLowerCase();
    const cands = priceList.filter(p => (p.item||'').toLowerCase().includes(qn));
    if(!cands.length) return null;
    const same = cands.filter(p => (p.unit||'').toLowerCase()===unit);
    const pool = same.length? same : cands;
    return pool.reduce((a,b)=> (a && a.unitPrice<=b.unitPrice)? a : b);
  }
  function findPieceWeight(name){
    const lc = String(name||'').toLowerCase();
    for(const it of (conv.piece_weights||[])){
      if(lc.includes(String(it.name||'').toLowerCase())) return it;
    }
    return null;
  }
  function findDensity(name){
    const lc = String(name||'').toLowerCase();
    for(const it of (conv.densities||[])){
      if(lc.includes(String(it.name||'').toLowerCase())) return it;
    }
    return null;
  }
  const JPY = x => {
    try{ return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:1}).format(x); }
    catch(_){ return Math.round(x).toString(); }
  };
  const escapeHTML = (s)=> String(s).replace(/[&<>"']/g, function(m){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
  });

  /* === Ingredient dropdown === */
  let itemsHash = '';
  function getItemNames(){
    const s = new Set(); (priceList||[]).forEach(p=>{ if(p && p.item) s.add(String(p.item)); });
    return Array.from(s).sort((a,b)=> a.localeCompare(b,'ja'));
  }
  function ensureGlobalDatalist(){
    let dl = document.getElementById('priceItems');
    const items = getItemNames();
    const hash = items.join('|');
    if(!dl){
      dl = document.createElement('datalist'); dl.id = 'priceItems'; document.body.appendChild(dl);
      dl.innerHTML = items.map(n=> '<option value="'+ escapeHTML(n) +'">').join('');
      itemsHash = hash;
      return;
    }
    if(hash!==itemsHash){
      dl.innerHTML = items.map(n=> '<option value="'+ escapeHTML(n) +'">').join('');
      itemsHash = hash;
    }
  }
  function enhanceIngredientRows(){
    ensureGlobalDatalist();
    const items = getItemNames();
    const hash = items.join('|');
    document.querySelectorAll('#ingList .ingrow').forEach(row=>{
      const nameInput = row.querySelector('.ing-name');
      const amtInput  = row.querySelector('.ing-amount');
      if(!nameInput) return;

      if(!nameInput.getAttribute('list')) nameInput.setAttribute('list','priceItems');

      let wrap = row.querySelector('.ing-namewrap');
      if(!wrap){
        wrap = document.createElement('div');
        wrap.className = 'ing-namewrap';
        nameInput.parentNode.insertBefore(wrap, nameInput);
        wrap.appendChild(nameInput);
        wrap.style.gridColumn = '1';
      }

      let sel = wrap.querySelector('select.ing-select');
      if(!sel){
        sel = document.createElement('select');
        sel.className = 'ing-select';
        wrap.insertBefore(sel, nameInput);
        sel.addEventListener('change', ()=>{
          const v = sel.value;
          if(!v) return;
          nameInput.value = v;
          const hit = (priceList||[]).find(p => (p.item||'')===v);
          if(hit && amtInput){
            const u = (hit.unit||'').toLowerCase();
            const unitLabel = u==='kg'?'kg': (u==='l'?'L': u);
            if(unitLabel) amtInput.placeholder = '例: 100' + unitLabel;
            try{ amtInput.focus(); }catch(_){}
          }
        });
      }
      if(sel.getAttribute('data-items-hash') !== hash){
        const opts = ['<option value="">選択...</option>'].concat(items.map(n=> '<option>'+ escapeHTML(n) +'</option>'));
        sel.innerHTML = opts.join('');
        sel.setAttribute('data-items-hash', hash);
      }
    });
  }

  // minimal styles
  (function(){
    if(document.getElementById('ingSelectStyle')) return;
    const st = document.createElement('style'); st.id='ingSelectStyle';
    st.textContent = [
      '.ing-namewrap{display:grid; grid-template-columns:auto 1fr; gap:6px; align-items:center;}',
      '.ing-select{appearance:auto; padding:6px 8px; border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); min-width:120px;}',
    ].join('');
    document.head.appendChild(st);
  })();

  
  if(!document.getElementById('priceCostStyle')){
    const st2 = document.createElement('style'); st2.id='priceCostStyle';
    st2.textContent = [
      '#costResult table { font-variant-numeric: tabular-nums; }',
      '#costResult td, #costResult th { vertical-align: top; }',
      '#costResult th:nth-child(2), #costResult td:nth-child(2),',
      '#costResult th:nth-child(3), #costResult td:nth-child(3),',
      '#costResult th:nth-child(4), #costResult td:nth-child(4) { text-align: right; }'
    ].join('');
    document.head.appendChild(st2);
  }


  
    if(!document.getElementById('priceCostStyle')){
      const st2 = document.createElement('style'); st2.id='priceCostStyle';
      st2.textContent = [
        '#costResult table { font-variant-numeric: tabular-nums; }',
        '#costResult td, #costResult th { vertical-align: top; }'
      ].join('');
      document.head.appendChild(st2);
    }


  /* === Settings & Cost UIs === */
  function ensureSettingsUI(){
    const cont = document.querySelector('#view-settings .detail');
    if(!cont || document.getElementById('priceBox')) return;
    const box = document.createElement('div');
    box.className='field'; box.id='priceBox';
    box.innerHTML = '<label>原価データ（CSV）</label>\
      <div class="row">\
        <input type="file" id="priceFile" accept=".csv,text/csv">\
        <button class="btn" id="priceImport">読み込む</button>\
        <button class="btn" id="priceClear">クリア</button>\
        <a class="btn ghost" id="priceTemplate" href="#" download="price_template.csv">テンプレDL</a>\
      </div>\
      <div id="priceInfo" class="help"></div>';
    cont.appendChild(box);
    const info = box.querySelector('#priceInfo');
    const refresh=()=> info.textContent = '登録アイテム数: ' + (priceList? priceList.length:0);
    refresh();
    box.querySelector('#priceImport').addEventListener('click', ()=>{
      const f = box.querySelector('#priceFile').files[0];
      if(!f){ alert('CSVファイルを選択してください'); return; }
      const rd = new FileReader();
      rd.onload = ()=>{ try{
        const rows = parseCsv(String(rd.result));
        priceList = csvToPrices(rows); save(PRICE_KEY, priceList); refresh();
        if(window.toast) toast('原価データを読み込みました');
        scheduleUpdate();
      }catch(e){ alert('CSV読み込みエラー: '+e.message); } };
      rd.readAsText(f);
    });
    box.querySelector('#priceClear').addEventListener('click', ()=>{
      if(!confirm('原価データを削除します。よろしいですか？')) return;
      priceList=[]; save(PRICE_KEY, priceList); refresh(); scheduleUpdate();
    });
    box.querySelector('#priceTemplate').addEventListener('click', (e)=>{
      e.preventDefault();
      const csv = 'item,unit,pack_size,pack_price,unit_price,brand,notes\\n'
                + 'リスドォル,g,2500,787,,日清製粉,2.5kgで787円(税別)\\n'
                + 'よつ葉パーチバター,g,450,818,,よつ葉,無塩\\n'
                + '卵,個,10,270,,--,10個パック\\n'
                + '塩,g,1000,120,,--,\\n';
      const blob = new Blob([csv], {type:'text/csv'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='price_template.csv'; a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 400);
    });

    if(!document.getElementById('convBox')){
      const convBox = document.createElement('div');
      convBox.className='field'; convBox.id='convBox';
      convBox.innerHTML = '<label>変換ルール（JSON）</label>\
        <div class="help">個→g（piece_weights）/ 体積→質量（densities）/ 別名（aliases）</div>\
        <textarea id="convJson" style="min-height:180px"></textarea>\
        <div class="row"><button class="btn" id="convSave">保存</button><button class="btn" id="convReset">初期値</button></div>';
      cont.appendChild(convBox);
      const ta = convBox.querySelector('#convJson'); ta.value = JSON.stringify(conv, null, 2);
      convBox.querySelector('#convSave').addEventListener('click', ()=>{
        try{ conv = JSON.parse(ta.value); save(CONV_KEY, conv); if(window.toast) toast('変換ルールを保存しました'); }
        catch(e){ alert('JSONの形式が不正です: '+e.message); }
      });
      convBox.querySelector('#convReset').addEventListener('click', ()=>{
        conv = getDefaultConv(); save(CONV_KEY, conv); ta.value = JSON.stringify(conv, null, 2);
        if(window.toast) toast('初期値に戻しました');
      });
    }
  }

  function ensureCostUI(){
    // 料理編集（#ingList がある時）にだけ表示し、再描画の度に付け直す
    const detail = document.getElementById('detail');
    const ingList = document.getElementById('ingList');
    if(!detail) return;
    const exists = document.getElementById('btnCalcCost');
    if(ingList && !exists){
      const box = document.createElement('section');
      box.className='field';
      box.innerHTML = '<label>原価計算</label>\
        <div class="row"><button class="btn" id="btnCalcCost">原価を計算</button></div>\
        <div id="costResult" class="detail"></div>';
      detail.appendChild(box);
      box.querySelector('#btnCalcCost').addEventListener('click', calcCost);
    }
    if(!ingList && exists){
      // 読み取りモードになったので一旦消す
      exists.closest('section')?.remove();
    }
  }

  function calcCost(){
    if(!priceList || !priceList.length){ alert('設定 > 原価データ からCSVを読み込んでください'); return; }
    const rows = Array.from(document.querySelectorAll('#ingList .ingrow')).map(row=>({
      name: (row.querySelector('.ing-name')?.value || '').trim(),
      amount: (row.querySelector('.ing-amount')?.value || '').trim()
    })).filter(r=> r.name || r.amount);
    const out=[]; let total=0;
    rows.forEach(r=>{
      const pa = parseAmount(r.amount); let qty = pa.qty * (pa.factor||1); let unit = pa.unit;
      let baseQty = qty; let note='';
      const price = bestPriceFor(r.name, unit);
      if(price){
        const pu = (price.unit||'').toLowerCase();
        if(unit && pu && unit!==pu){
          const kindA = UMAP[unit]? UMAP[unit].kind : null;
          const kindB = UMAP[pu]? UMAP[pu].kind : null;
          if(kindA && kindB && kindA===kindB){
            baseQty = UMAP[unit].toBase(qty) / UMAP[pu].toBase(1);
          } else {
            const pw = findPieceWeight(price.item || r.name);
            if(pw){
              if((unit==='個'||unit==='片'||unit===pw.unit) && (pu==='g'||pu==='kg')){
                const grams = qty * (pw.g||0);
                baseQty = grams / (pu==='kg'? 1000:1);
                note = note || ('換算:'+pw.name+' '+(pw.g||0)+'g/'+pw.unit);
              } else if((unit==='g'||unit==='kg') && (pu==='個'||pu==='片'||pu===pw.unit)){
                const grams = (unit==='kg'? qty*1000:qty);
                baseQty = grams / (pw.g||1);
                note = note || ('換算:'+pw.name+' '+(pw.g||0)+'g/'+pw.unit);
              } else {
                const dens = findDensity(price.item || r.name);
                if(dens && ((unit==='ml'||unit==='l') || (pu==='ml'||pu==='l'))){
                  const toG = (v,u)=> u==='l'? v*1000 : v;
                  if((unit==='ml'||unit==='l') && (pu==='g'||pu==='kg')){
                    const grams = toG(qty,unit) * (dens.g_per_ml||1);
                    baseQty = grams / (pu==='kg'?1000:1);
                    note = note || ('密度換算:'+dens.name+' '+(dens.g_per_ml||1)+'g/ml');
                  } else if((unit==='g'||unit==='kg') && (pu==='ml'||pu==='l')){
                    const ml = (unit==='kg'? qty*1000:qty) / (dens.g_per_ml||1);
                    baseQty = ml / (pu==='l'?1000:1);
                    note = note || ('密度換算:'+dens.name+' '+(dens.g_per_ml||1)+'g/ml');
                  } else { note = note || '単位不一致'; }
                } else { note = note || '単位不一致'; }
              }
            } else {
              const dens = findDensity(price.item || r.name);
              if(dens && ((unit==='ml'||unit==='l') || (pu==='ml'||pu==='l'))){
                const toG = (v,u)=> u==='l'? v*1000 : v;
                if((unit==='ml'||unit==='l') && (pu==='g'||pu==='kg')){
                  const grams = toG(qty,unit) * (dens.g_per_ml||1);
                  baseQty = grams / (pu==='kg'?1000:1);
                  note = note || ('密度換算:'+dens.name+' '+(dens.g_per_ml||1)+'g/ml');
                } else if((unit==='g'||unit==='kg') && (pu==='ml'||pu==='l')){
                  const ml = (unit==='kg'? qty*1000:qty) / (dens.g_per_ml||1);
                  baseQty = ml / (pu==='l'?1000:1);
                  note = note || ('密度換算:'+dens.name+' '+(dens.g_per_ml||1)+'g/ml');
                } else { note = note || '単位不一致'; }
              } else { note = note || '単位不一致'; }
            }
          }
        }
        var cost = (price.unitPrice||0) * baseQty;
        total += cost;
        out.push({ name:r.name, amount:r.amount, unit_price: price? price.unitPrice: null, cost, note, matched: price? price.item:'' });
      } else {
        out.push({ name:r.name, amount:r.amount, unit_price: null, cost:0, note:'未登録', matched:'' });
      }
    });
    const el = document.getElementById('costResult');
    if(!el) return;
    el.innerHTML = out.length? ('<div class="help">* 単位が異なる場合は可能な範囲で換算（個↔g、ml↔g等）。@0.9 のように分量末尾で歩留まり係数も指定可。未登録は「未登録」。</div>' +
      '<table style="width:100%; border-collapse:collapse">'+
      '<thead><tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">材料</th>'+
      '<th style="text-align:right;border-bottom:1px solid var(--border);padding:6px">分量</th>'+
      '<th style="text-align:right;border-bottom:1px solid var(--border);padding:6px">単価</th>'+
      '<th style="text-align:right;border-bottom:1px solid var(--border);padding:6px">原価</th>'+
      '<th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">備考</th></tr></thead><tbody>'+
      out.map(r=> '<tr>'+
        '<td style="padding:6px;border-bottom:1px solid var(--border)">'+ (r.name||'-') + (r.matched? ' <span class="tag">'+r.matched+'</span>':'' ) +'</td>'+
        '<td style="padding:6px;border-bottom:1px solid var(--border);text-align:right">'+ (r.amount||'-') +'</td>'+
        '<td style="padding:6px;border-bottom:1px solid var(--border);text-align:right">'+ (r.unit_price!=null? JPY(r.unit_price): '-') +'</td>'+
        '<td style="padding:6px;border-bottom:1px solid var(--border);text-align:right">'+ JPY(r.cost) +'</td>'+
        '<td style="padding:6px;border-bottom:1px solid var(--border)">'+ (r.note||'') +'</td>'+
      '</tr>').join('')+
      '</tbody></table>'+
      '<div style="text-align:right;margin-top:8px;font-weight:800">合計原価: ' + JPY(total) + '</div>'
    ) : '<div class="help">材料が入力されていません</div>';
  }

  /* === Debounced Observer === */
  let updTimer = null;
  function scheduleUpdate(){
    if(updTimer) return;
    updTimer = setTimeout(()=>{
      updTimer = null;
      try{
        ensureSettingsUI();
        ensureCostUI();        // editになった瞬間に付与
        enhanceIngredientRows(); // 材料行のUI更新
      }catch(e){ console.error('price.plugin update error', e); }
    }, 50);
  }
  const obs = new MutationObserver(scheduleUpdate);
  obs.observe(document.body || document.documentElement, {subtree:true, childList:true});
  scheduleUpdate();
})();