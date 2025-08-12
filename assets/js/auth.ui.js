// assets/js/auth.ui.js — Hardened: URL token exchange + cooldown + subpath-safe
(function(){
  const sb = window.sb; if(!sb) return;
  const area = document.getElementById('authArea'); if(!area) return;

  // --- 1) When returning from email link, persist the session and clean URL ---
  (async () => {
    try {
      // Hash style: #access_token=...&refresh_token=...
      if (location.hash && /access_token=/.test(location.hash)) {
        const params = new URLSearchParams(location.hash.slice(1));
        const access_token  = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          await sb.auth.setSession({ access_token, refresh_token });
          history.replaceState({}, document.title, location.pathname); // drop hash
        }
      }
      // Query style (OAuth/PKCE or some email links): ?code=...
      const sp = new URLSearchParams(location.search);
      const code = sp.get('code');
      if (code) {
        await sb.auth.exchangeCodeForSession({ code });
        history.replaceState({}, document.title, location.pathname); // drop query
      }
    } catch (e) {
      console.warn('[auth.ui] token exchange skipped:', e?.message || e);
    }
  })();

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

  function remainingSec(){
    const until = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
    return Math.max(0, Math.ceil((until - Date.now())/1000));
  }
  function startCooldown(sec){
    localStorage.setItem(COOLDOWN_KEY, String(Date.now() + sec*1000));
    applyCooldownIfNeeded();
  }
  function applyCooldownIfNeeded(){
    const btn = document.getElementById('btnLogin'); if(!btn) return;
    let left = remainingSec();
    if(left <= 0){ btn.disabled = false; btn.textContent = 'ログイン'; return; }
    btn.disabled = true;
    const tick = () => {
      left = remainingSec();
      if(left <= 0){ btn.disabled = false; btn.textContent = 'ログイン'; return; }
      btn.textContent = `再送信 ${left}秒後`;
      setTimeout(tick, 1000);
    };
    tick();
  }

  async function login(){
    const email = (document.getElementById('authEmail')?.value||'').trim();
    if(!email) return alert('メールアドレスを入力してください');

    const left = remainingSec();
    if(left > 0){ return alert(`メール再送は ${left} 秒後に可能です`); }

    // サブパス（/app/ など）でも戻る
    const redirect = window.location.origin + window.location.pathname;

    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if(error){
      const m = /after\s+(\d+)\s+seconds/i.exec(error.message||'');
      startCooldown(m ? parseInt(m[1],10) : 60);
      return alert(error.message);
    }
    startCooldown(60);
    alert('ログイン用メールを送信しました。届いたリンクから戻ってください。');
  }

  // Initial render
  sb.auth.getSession().then(({data})=> render(data.session));
  sb.auth.onAuthStateChange((ev, session)=> {
    // console.log('[auth]', ev, session);
    render(session);
  });
})();
