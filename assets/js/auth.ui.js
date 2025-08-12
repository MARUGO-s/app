
// assets/js/auth.ui.js — Magic Link 最小UI（/app/等のサブパスにも対応）
(function(){
  const sb = window.sb; if(!sb) return;
  const area = document.getElementById('authArea'); if(!area) return;

  function render(session){
    const email = session?.user?.email;
    area.innerHTML = email
      ? `<span class="hint">ログイン中: ${email}</span> <button id="btnLogout" class="btn">ログアウト</button>`
      : `<input id="authEmail" type="email" placeholder="you@example.com" class="w-lg" />
         <button id="btnLogin" class="btn">ログイン</button>`;
    document.getElementById('btnLogin')?.addEventListener('click', login);
    document.getElementById('btnLogout')?.addEventListener('click', async ()=>{ await sb.auth.signOut(); });
  }

  async function login(){
    const email = (document.getElementById('authEmail')?.value||'').trim();
    if(!email) return alert('メールアドレスを入力してください');
    const redirect = window.location.origin + window.location.pathname; // GH Pagesの/app/に戻す
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect }});
    if(error) alert(error.message);
    else alert('ログイン用メールを送信しました。メールのリンクを開いてこの画面に戻ってください。');
  }

  sb.auth.getSession().then(({data})=> render(data.session));
  sb.auth.onAuthStateChange((_e, s)=> render(s));
})();
