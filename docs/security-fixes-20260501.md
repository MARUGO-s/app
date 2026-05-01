# セキュリティ・信頼性の修正記録

**日付:** 2026-05-01  
**PR:** [#2 fix/security-and-reliability](https://github.com/MARUGO-s/app/pull/2)

---

## #1 Edge Functions への JWT 認証追加

### 問題
以下の Edge Function は認証なしで誰でも呼び出せる状態だった。

- `call-chatgpt-api`
- `call-groq-api`
- `call-openai-api`
- `call-document-intelligence`
- `fetch-url-content`
- `fetch-image`
- `screenshot-recipe`
- `db_tester`
- `scheduled-backup`

### 修正内容
全 Function に `_shared/jwt.ts` の共通パターンを追加。

```ts
import { getAuthToken, verifySupabaseJWT } from '../_shared/jwt.ts'

const token = getAuthToken(req)
if (!token) {
    return new Response(JSON.stringify({ error: '認証が必要です。再ログインしてください。' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
try {
    await verifySupabaseJWT(token)
} catch {
    return new Response(JSON.stringify({ error: 'トークンが無効または期限切れです。再ログインしてください。' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
```

`scheduled-backup` は全ユーザーのデータにアクセスするため、JWT 検証に加えて **管理者ロールチェック** も追加。

```ts
const callerId = String(jwtPayload.sub || '')
const { data: callerProfile, error: profileErr } = await supabase
    .from('profiles').select('role').eq('id', callerId).single()
if (profileErr || callerProfile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: '管理者権限が必要です。' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
```

---

## #2 ハードコードされたメールアドレスの除去

### 問題
`pingus0428@gmail.com` というメールアドレスがソースコードに直接書かれており、特定ユーザーに特権が与えられていた。

- `src/contexts/AuthContext.jsx` — `show_master_recipes` の判定にメールアドレスを使用
- `src/components/UserManagement.jsx` — 管理者の降格禁止ロジックにメールアドレスを使用

### 修正内容

**AuthContext.jsx**
```js
// 修正前
const isSuperAdmin = email === 'pingus0428@gmail.com';
const showMasterRecipes = isSuperAdmin ? true : (p.show_master_recipes === true);

// 修正後（DB の値のみを参照）
const showMasterRecipes = p.show_master_recipes === true;
```

**UserManagement.jsx**
```js
// 修正前
const isSuperAdmin = (u) => u?.email === 'pingus0428@gmail.com';

// 修正後（特権なし。管理者は他の管理者も管理可能）
const isSuperAdmin = (_u) => false;
```

---

## #3 レートリミッターの TOCTOU 競合修正

### 問題
`supabase/functions/_shared/rate-limiter.ts` の `check()` メソッドが「SELECT してカウント確認 → UPDATE でインクリメント」という二段階操作を行っていた。

同時リクエストが両方とも SELECT を通過した後、両方 UPDATE するため、制限を超えたリクエストが通過できる TOCTOU（Time-of-Check/Time-of-Use）競合が発生していた。

### 修正内容

**新規マイグレーション:** `supabase/migrations/20260501000000_add_atomic_rate_limit_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
    p_user_id TEXT, p_endpoint TEXT, p_max_requests INTEGER, p_window_minutes INTEGER
) RETURNS TABLE (allowed BOOLEAN, request_count INTEGER, window_start TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    -- 固定グリッドのウィンドウ開始時刻（ON CONFLICT を確実に動作させるため）
    v_window_start := to_timestamp(
        floor(extract(epoch from now()) / (p_window_minutes * 60))
        * (p_window_minutes * 60)
    );

    -- アトミックなアップサート（行ロック下でチェックとインクリメントを同時実行）
    INSERT INTO api_rate_limits (user_id, endpoint, request_count, window_start, updated_at)
    VALUES (p_user_id, p_endpoint, 1, v_window_start, now())
    ON CONFLICT (user_id, endpoint, window_start)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1, updated_at = now()
    RETURNING api_rate_limits.request_count INTO v_count;

    RETURN QUERY SELECT v_count <= p_max_requests, v_count, v_window_start;
END;
$$;
```

**rate-limiter.ts の変更:**
```ts
// 修正前（二段階: SELECT → UPDATE）
const { data: records } = await supabase.from('api_rate_limits').select('*')...
if (currentRecord.request_count >= this.config.maxRequests) { throw ... }
await supabase.from('api_rate_limits').update({ request_count: currentRecord.request_count + 1 })...

// 修正後（アトミックな RPC 一回）
const { data, error } = await this.supabase.rpc('check_and_increment_rate_limit', {
    p_user_id: this.userId,
    p_endpoint: this.endpoint,
    p_max_requests: this.config.maxRequests,
    p_window_minutes: this.config.windowMinutes,
})
if (!result?.allowed) { throw new Error(`レート制限を超えました...`) }
```

---

## #5 scheduled-backup の全件フェッチ修正

### 問題
`supabase/functions/scheduled-backup/index.ts` が全ユーザーの全レシピを一括取得してメモリでフィルタしていた。レシピ数が多い場合に Edge Function のメモリ上限（512MB）を超えるリスクがあった。

```ts
// 修正前（全件取得 → メモリでフィルタ）
const { data: allRecipes } = await supabase.from('recipes').select('*')
// ...ループ内でメモリ上フィルタ
const userRecipes = allRecipes.filter(r => tags.includes(`owner:${user.id}`))
```

### 修正内容
ユーザーごとに DB クエリでフィルタするよう変更。

```ts
// 修正後（ユーザーごとに DB フィルタ）
const ownerTags = [`owner:${user.id}`]
if (user.display_id) ownerTags.push(`owner:${user.display_id}`)

const { data: userRecipes } = await supabase
    .from('recipes')
    .select('*')
    .overlaps('tags', ownerTags)  // PostgreSQL の && 演算子
    .order('created_at', { ascending: false })
```

---

## #6 plannerService のサイレントフォールバック修正

### 問題
`src/services/plannerService.js` の書き込み操作が DB エラーを内部でキャッチし、呼び出し元にエラーを伝えずにサイレントで localStorage にフォールバックしていた。

- 呼び出し元の `catch` ブロックが一切発火しない
- `updateMeal` でDB失敗 → localstorage更新 → 次の `getAll()` でDBの古いデータが上書き → **更新内容が永久消滅**

### 修正内容

| 操作 | 修正前 | 修正後 |
|------|--------|--------|
| `addMeal` | DB失敗→警告キュー→成功扱い | DB失敗→localStorage ロールバック→**throw** |
| `removeMeal` | DB失敗→localStorage から削除 | DB成功後のみ localStorage から削除、失敗は **throw** |
| `updateMeal` | DB失敗→localStorage を更新（データ消失） | DB成功後のみ localStorage を更新、失敗は **throw** |
| `clearPeriod` | DB失敗→localStorage をクリア | DB成功後のみ localStorage をクリア、失敗は **throw** |

`Planner.jsx` の未処理呼び出し箇所にもエラートーストを追加。

```jsx
// ドラッグ&ドロップ移動
try {
    await plannerService.addMeal(...)
    await plannerService.removeMeal(...)
    loadData()
} catch (moveError) {
    toast.error('移動に失敗しました')
    loadData()
}

// 確認モーダルからの追加
try {
    await plannerService.addMeal(...)
} catch (addError) {
    toast.error('追加に失敗しました')
}
```

---

## #7 supabase.js のハードコードされた認証情報を除去

### 問題
本番の Supabase URL と anon key がソースコードにフォールバック値として直接埋め込まれていた。

```js
// 修正前
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://hjhkccbktkscwtgzxjfq.supabase.co';
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || 'sb_publishable_TY46n8sbGaESoL7RAzoYbg_i-d8Cwqr';
```

### 修正内容

```js
// 修正後（環境変数必須・未設定なら起動時エラー）
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Supabase環境変数が設定されていません。' +
        '.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。'
    )
}
```

`.env.example` を新規作成し、`.env.local`（gitignore 済み）に実際の認証情報を移動。

---

## #8 AuthContext の二重プロフィールフェッチ修正

### 問題
ログイン済みユーザーがページを開くたびに、プロフィールの DB フェッチが **2回** 実行されていた。

```
onAuthStateChange → INITIAL_SESSION → loadProfileAndSetUser（1回目）
init() → getSession() → loadProfileAndSetUser（2回目）← 無駄
```

コード内のコメントも「though safe to call twice（2回呼んでも大丈夫）」と認識はしていたが未修正だった。

### 修正内容
Supabase JS v2 はマウント時に `onAuthStateChange` 経由で `INITIAL_SESSION` を発火するため、`getSession()` の呼び出しは不要。`init()` 関数を削除し、`INITIAL_SESSION` で `loading` を解除するよう変更。

```js
// 修正後
const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (_event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
    try {
        await loadProfileAndSetUser(session?.user || null)
    } catch (e) {
        console.error('Auth state change handler failed:', e)
    } finally {
        if (_event === 'INITIAL_SESSION') clearLoading()  // ← ここで loading=false
    }
})

// 万が一 INITIAL_SESSION が来なかった場合の安全タイマー
const fallbackTimer = setTimeout(clearLoading, 10000)
```
