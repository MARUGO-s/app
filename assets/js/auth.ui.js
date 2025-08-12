// assets/js/auth.ui.js — FINAL: token exchange always + optional UI with cooldown
(function(){
  const sb = window.sb; if(!sb) return;

  // --- A) Token exchange (always run) ---
  (async () => {
    try {
      if (location.hash && /access_token=/.test(location.hash)) {
        const p = new URLSearchParams(location.hash.slice(1));
        const access_token  = p.get('access_token');
        const refresh_token = p.get('refresh_token');
        if (access_token && refresh_token) {
          await sb.auth.setSession({ access_token, refresh_token });
          history.replaceState({}, document.title, location.pathname);
          console.log('[auth] setSession from hash');
        }
      }
      const sp = new URLSearchParams(location.search);
      const code = sp.get('code');
      if (code) {
        await sb.auth.exchangeCodeForSession({ code });
        history.replaceState({}, document.title, location.pathname);
        console.log('[auth] exchangeCodeForSession from query');
      }
    } catch (e) {
      console.warn('[auth] token exchange skipped:', e?.message || e);
    }
  })();

  // --- B) Optional UI (only if #authArea exists) ---
  const area = document.getElementById('authArea');
  if(!area){
    // Even without UI, keep session listeners for app.js
    sb.auth.onAuthStateChange(()=>{});
    return;
  }

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
    const redirect = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if(error){ const m=/after\s+(\d+)\s+seconds/i.exec(error.message||''); startCD(m?parseInt(m[1],10):60); return alert(error.message); }
    startCD(60); alert('ログイン用メールを送信しました。リンクから戻ってください。');
  }

  sb.auth.getSession().then(({data})=> render(data.session));
  sb.auth.onAuthStateChange((_e, session)=> render(session));
})();