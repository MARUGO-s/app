// assets/js/auth.ui.js — Magic Link UI with cooldown handling
(function(){
  const sb = window.sb; if(!sb) return;
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

  function getRemaining(){
    const until = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
    return Math.max(0, Math.ceil((until - Date.now())/1000));
  }
  function startCooldown(sec){
    const until = Date.now() + (sec*1000);
    localStorage.setItem(COOLDOWN_KEY, String(until));
    applyCooldownIfNeeded();
  }
  function applyCooldownIfNeeded(){
    const btn = document.getElementById('btnLogin'); if(!btn) return;
    let remain = getRemaining();
    if(remain <= 0){
      btn.disabled = false;
      btn.textContent = 'ログイン';
      return;
    }
    btn.disabled = true;
    const tick = ()=>{
      remain = getRemaining();
      if(remain <= 0){
        btn.disabled = false;
        btn.textContent = 'ログイン';
        return;
      }
      btn.textContent = `再送信 ${remain}秒後`;
      setTimeout(tick, 1000);
    };
    tick();
  }

  async function login(){
    const email = (document.getElementById('authEmail')?.value||'').trim();
    if(!email) return alert('メールアドレスを入力してください');

    // サブパス（/app/ 等）でも戻る
    const redirect = window.location.origin + window.location.pathname;

    // すでにクールダウン中ならキャンセル
    const remain = getRemaining();
    if(remain > 0){
      return alert(`メール再送は ${remain} 秒後に可能です`);
    }

    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if(error){
      // 「For security purposes... after XX seconds.」をパースしてクールダウン
      const m = /after\s+(\d+)\s+seconds/i.exec(error.message||'');
      const sec = m ? parseInt(m[1],10) : 60;
      startCooldown(sec);
      return alert(error.message);
    }
    // 成功時も二重送信防止でクールダウン（多くの環境で30〜60秒）
    startCooldown(60);
    alert('ログイン用メールを送信しました。メールのリンクを開いて戻ってください。');
  }

  sb.auth.getSession().then(({data})=> render(data.session));
  sb.auth.onAuthStateChange((_e, s)=> render(s));
})();