// assets/js/auth.ui.js — GitHub Pages fixed redirect
(function(){ 
  const sb = window.sb; if(!sb) return;
  const AUTH_REDIRECT = 'https://marugo-s.github.io/app/'; // <-- 固定（常に GitHub Pages に戻す）

  // --- token exchange & URL cleanup ---
  (async () => {
    try {
      if (location.hash && /access_token=/.test(location.hash)) {
        const p = new URLSearchParams(location.hash.slice(1));
        const at  = p.get('access_token');
        const rt  = p.get('refresh_token');
        if (at && rt) { await sb.auth.setSession({ access_token: at, refresh_token: rt }); history.replaceState({}, document.title, location.pathname); }
      }
      const sp = new URLSearchParams(location.search);
      const code = sp.get('code');
      if (code) { await sb.auth.exchangeCodeForSession({ code }); history.replaceState({}, document.title, location.pathname); }
    } catch(e){ console.warn('[auth.ui] exchange skipped', e?.message||e); }
  })();

  const area = document.getElementById('authArea'); if(!area) return;
  const COOLDOWN_KEY = 'auth_email_cooldown_until';

  function render(session){
    const email = session?.user?.email;
    area.innerHTML = email
      ? `<span class="hint">ログイン中: ${email}</span> <button id="btnLogout" class="btn">ログアウト</button>`
      : `<input id="authEmail" type="email" placeholder="you@example.com" class="w-lg" />
         <button id="btnLogin" class="btn">ログイン</button>`;
    document.getElementById('btnLogin')?.addEventListener('click', login);
    document.getElementById('btnLogout')?.addEventListener('click', async ()=>{ await sb.auth.signOut(); location.reload(); });
    applyCooldownIfNeeded();
  }
  function remain(){ const u=parseInt(localStorage.getItem(COOLDOWN_KEY)||'0',10); return Math.max(0, Math.ceil((u-Date.now())/1000)); }
  function startCD(sec){ localStorage.setItem(COOLDOWN_KEY, String(Date.now()+sec*1000)); applyCooldownIfNeeded(); }
  function applyCooldownIfNeeded(){
    const btn=document.getElementById('btnLogin'); if(!btn) return;
    let r=remain();
    if(r<=0){ btn.disabled=false; btn.textContent='ログイン'; return; }
    btn.disabled=true;
    const tick=()=>{ r=remain(); if(r<=0){ btn.disabled=false; btn.textContent='ログイン'; return; } btn.textContent=`再送信 ${r}秒後`; setTimeout(tick,1000); };
    tick();
  }
  async function login(){
    const email=(document.getElementById('authEmail')?.value||'').trim();
    if(!email) return alert('メールアドレスを入力してください');
    const left=remain(); if(left>0) return alert(`メール再送は ${left} 秒後に可能です`);
    const {{ error }} = await sb.auth.signInWithOtp({{ email, options: {{ emailRedirectTo: AUTH_REDIRECT }} }});
    if(error){{ const m=/after\s+(\d+)\s+seconds/i.exec(error.message||''); startCD(m?parseInt(m[1],10):60); return alert(error.message); }}
    startCD(60); alert('ログイン用メールを送信しました。GitHub Pages に戻るリンクから入ってください。');
  }
  sb.auth.getSession().then(({data})=> render(data.session));
  sb.auth.onAuthStateChange((_e, s)=> render(s));
})();