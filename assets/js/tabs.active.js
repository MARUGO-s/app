/*! tabs.active.js — set .active / aria-current on header nav tabs without touching app.js */
(function(){
  'use strict';

  const VIEW_TO_BTN = {
    'view-home':     'btnNavHome',
    'view-recipes':  'btnNavRecipes',
    'view-fav':      'btnNavFav',
    'view-settings': 'btnNavSettings',
  };
  const BTN_IDS = Object.values(VIEW_TO_BTN);

  const $ = (id) => document.getElementById(id);

  function isVisible(el){
    if(!el) return false;
    const cs = getComputedStyle(el);
    return !(cs.display === 'none' || cs.visibility === 'hidden');
  }
  function currentViewId(){
    for(const vid of Object.keys(VIEW_TO_BTN)){
      const el = $(vid);
      if(el && isVisible(el)) return vid;
    }
    return 'view-recipes'; // fallback
  }
  function setActive(btnId, on){
    const b = $(btnId); if(!b) return;
    b.classList.toggle('active', !!on);
    if(on) b.setAttribute('aria-current','page');
    else   b.removeAttribute('aria-current');
  }
  function updateTabs(){
    const v = currentViewId();
    const activeBtn = VIEW_TO_BTN[v];
    BTN_IDS.forEach(id => setActive(id, id === activeBtn));
  }

  // immediate feedback on header tab click
  document.addEventListener('click', (ev)=>{
    const t = ev.target;
    if(!(t instanceof Element)) return;
    const id = t.id;
    if(BTN_IDS.includes(id)){
      BTN_IDS.forEach(bid => setActive(bid, bid === id));
      setTimeout(updateTabs, 60); // re-sync after view switch
    }
  }, true);

  // observe view visibility changes
  function observeViews(){
    const obs = new MutationObserver(()=> updateTabs());
    Object.keys(VIEW_TO_BTN).forEach(vid=>{
      const el = $(vid);
      if(el) obs.observe(el, { attributes:true, attributeFilter:['style','class'] });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ updateTabs(); observeViews(); });
  }else{
    updateTabs(); observeViews();
  }
})();
// JavaScript Document