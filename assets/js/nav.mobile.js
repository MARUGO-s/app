// assets/js/nav.mobile.js
// モバイル用ハンバーガー → ドロワーナビ制御（PCでは横並び）
// 置き場所: /app/assets/js/nav.mobile.js
(function () {
  'use strict';
  const btn   = document.getElementById('btnHamburger');
  const nav   = document.getElementById('navMain');
  const scrim = document.getElementById('navScrim');
  if (!btn || !nav || !scrim) return;

  let lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    nav.classList.add('open');
    scrim.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    // 初回フォーカス（ナビの最初のボタンへ）
    setTimeout(() => (nav.querySelector('.btn') || btn).focus(), 50);
    document.addEventListener('keydown', onKeydown);
  }

  function close() {
    nav.classList.remove('open');
    scrim.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown);
    (lastFocus || btn).focus();
  }

  function onKeydown(e) {
    // Escで閉じる + 簡易フォーカストラップ
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const focusables = nav.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  btn.addEventListener('click', () => (nav.classList.contains('open') ? close() : open()));
  scrim.addEventListener('click', close);

  // ナビ内のボタンクリックで自動的に閉じる
  nav.addEventListener('click', (e) => {
    const el = e.target;
    if (el && el.classList && el.classList.contains('btn')) close();
  });

  // ハッシュ遷移でも閉じる
  window.addEventListener('hashchange', close);
})();
