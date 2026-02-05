# レシピ管理アプリ 技術ドキュメント

**Version**: 2.0
**Last Updated**: 2026-02-03
**Status**: Production

---

## 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [システムアーキテクチャ](#システムアーキテクチャ)
3. [プロジェクト構造](#プロジェクト構造)
4. [主要な技術スタック](#主要な技術スタック)
5. [バックエンド（Supabase / PostgreSQL）](#バックエンドsupabase--postgresql)
6. [フロントエンド](#フロントエンド)
7. [サービス層（ビジネスロジック）](#サービス層ビジネスロジック)
8. [認証とセキュリティ](#認証とセキュリティ)
9. [パフォーマンス最適化](#パフォーマンス最適化)
10. [デプロイメント](#デプロイメント)
11. [トラブルシューティング](#トラブルシューティング)

---

## プロジェクト概要

### アプリケーションの目的

このレシピ管理アプリは、飲食業務における以下を統合的に管理するWebアプリケーションです：

- **レシピ管理**: 料理レシピの作成・編集・共有
- **原価管理**: 材料の単価管理と原価計算
- **在庫管理**: 材料の棚卸しと在庫推移の記録
- **仕込みカレンダー**: 制作予定の管理と発注リスト生成
- **発注管理**: 材料の発注量自動計算（2割ルール）
- **多言語対応**: レシピの自動翻訳（日本語・英語・フランス語・イタリア語など）

### ユーザータイプ

1. **一般スタッフ**: レシピの作成・編集・閲覧、仕込み履歴参照
2. **管理者**: ユーザー管理、全体データの監視、権限設定
3. **シェフ**: レシピの作成・共有、オリジナルレシピの保護

---

## システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                  │
├─────────────────────────────────────────────────────────────┤
│ Components                 Services              Contexts    │
│ ├─ RecipeForm             ├─ recipeService      ├─ AuthCtx   │
│ ├─ RecipeDetail           ├─ ingredientSearch   ├─ ToastCtx  │
│ ├─ InventoryManagement    ├─ inventoryService   │            │
│ ├─ Planner                ├─ unitConversion     │            │
│ ├─ OrderList              └─ purchasePriceService│           │
│ └─ DataManagement         └─ ...                │            │
└─────────────────────────────────────────────────────────────┘
                             ↓ REST API
┌─────────────────────────────────────────────────────────────┐
│              Supabase (Backend-as-a-Service)                 │
├─────────────────────────────────────────────────────────────┤
│ Authentication (Supabase Auth)                               │
│                                                               │
│ PostgreSQL Database with RLS (Row-Level Security)            │
│ ├─ recipes                    ├─ inventory_items             │
│ ├─ recipe_contents            ├─ inventory_snapshots         │
│ ├─ recipe_steps               ├─ unit_conversions            │
│ ├─ recent_views               ├─ csv_unit_overrides          │
│ ├─ profiles                   └─ ...                         │
│ └─ recipe_sources                                            │
│                                                               │
│ Storage (for CSV uploads)                                    │
│ ├─ app-data (CSV files)                                      │
│ └─ recipe-images                                             │
│                                                               │
│ RPC Functions (Server-side search & operations)              │
│ ├─ search_ingredients()                                      │
│ └─ ...                                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## プロジェクト構造

```
app-main-22/
├── src/
│   ├── components/          # React コンポーネント
│   │   ├── App.jsx
│   │   ├── RecipeForm.jsx          # レシピ作成・編集画面
│   │   ├── RecipeDetail.jsx        # レシピ詳細表示
│   │   ├── RecipeFormIngredients.jsx # 材料入力（ドラッグ&ドロップ対応）
│   │   ├── AutocompleteInput.jsx   # 材料名オートコンプリート
│   │   ├── InventoryManagement.jsx # 在庫管理画面
│   │   ├── Planner.jsx             # 仕込みカレンダー
│   │   ├── OrderList.jsx           # 発注リスト
│   │   ├── DataManagement.jsx      # CSV管理
│   │   ├── IngredientMaster.jsx    # 材料マスター管理
│   │   ├── ImportModal.jsx         # Web・画像取り込み
│   │   ├── CookingMode.jsx         # 調理モード
│   │   └── ...其他コンポーネント
│   │
│   ├── services/            # ビジネスロジック層
│   │   ├── recipeService.js
│   │   ├── ingredientSearchService.js  # 材料検索（DB RPC + CSV検索）
│   │   ├── inventoryService.js
│   │   ├── unitConversionService.js    # 単位換算ロジック
│   │   ├── purchasePriceService.js
│   │   ├── plannerService.js
│   │   ├── csvUnitOverrideService.js
│   │   ├── translationService.js
│   │   └── userService.js
│   │
│   ├── contexts/            # React Context（グローバル状態管理）
│   │   ├── AuthContext.jsx           # 認証状態・ユーザー情報
│   │   └── ToastContext.jsx          # トースト通知
│   │
│   ├── App.jsx              # メインアプリケーションロジック
│   ├── App.css
│   ├── index.css
│   ├── main.jsx
│   ├── constants.js
│   ├── supabase.js          # Supabase接続設定
│   └── mockData.js
│
├── supabase/
│   └── migrations/          # データベース マイグレーション
│       ├── 20260203100000_create_ingredient_search_rpc.sql
│       ├── 20260204000000_add_performance_indexes.sql
│       ├── 20260202160000_create_csv_unit_overrides.sql
│       └── ...
│
├── public/                  # 静的アセット
├── dist/                    # ビルド出力（GitHub Pages に デプロイ）
├── package.json
├── vite.config.js           # Vite 設定
├── USER_GUIDE.md            # ユーザーガイド
├── OPERATION_MANUAL.md      # 運用マニュアル
└── TECHNICAL_DOCUMENTATION.md (このファイル)
```

---

## 主要な技術スタック

### フロントエンド
- **React 18**: UIライブラリ
- **Vite**: ビルドツール（高速な開発・本番ビルド）
- **CSS Grid & Flexbox**: レスポンシブレイアウト
- **Supabase JS Client**: API通信・認証

### バックエンド
- **Supabase (PostgreSQL)**: データベース & 認証サービス
- **RLS (Row-Level Security)**: 行レベルセキュリティ
- **RPC Functions**: サーバーサイドの検索・計算処理
- **PostgreSQL GIN Index**: 高速なJSONB配列検索

### UI/UX
- **React DnD Kit**: ドラッグ&ドロップ（材料の並び替え）
- **HTML5 Canvas / Chart.js**: グラフ表示（オプション）
- **モーダル・トースト通知**: 不具合報告

### デプロイメント
- **GitHub Pages**: 本番環境
- **GitHub Actions**: 自動デプロイ（main ブランチへの push で自動実行）
- **gh-pages パッケージ**: デプロイ自動化

---

## バックエンド（Supabase / PostgreSQL）

### データベーススキーマ（主要テーブル）

#### 1. `profiles` - ユーザープロフィール
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE,
  full_name TEXT,
  role ENUM('admin', 'user'),
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);
```

#### 2. `recipes` - レシピマスター
```sql
CREATE TABLE recipes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  baker_percentage BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_hidden BOOLEAN DEFAULT FALSE,
  is_shared BOOLEAN DEFAULT FALSE
);
```

#### 3. `recipe_contents` - 材料行
```sql
CREATE TABLE recipe_contents (
  id UUID PRIMARY KEY,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  group_name TEXT,
  ingredient_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  purchase_cost NUMERIC,  -- kg/L単位での単価
  cost NUMERIC,           -- 計算後の原価
  is_alcohol BOOLEAN DEFAULT FALSE,
  sort_order INT
);
```

#### 4. `unit_conversions` - 材料マスター（内容量・仕入れ値）
```sql
CREATE TABLE unit_conversions (
  id UUID PRIMARY KEY,
  ingredient_name TEXT UNIQUE NOT NULL,
  packet_size NUMERIC,              -- 1袋の量（例: 25000g）
  packet_unit TEXT,                 -- 単位（例: 'g'）
  last_price NUMERIC,               -- 1袋の合計価格（例: 10900円）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 5. `inventory_items` - 在庫
```sql
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY,
  ingredient_name TEXT NOT NULL,
  quantity NUMERIC,                 -- 在庫数
  unit TEXT,                        -- 単位
  price NUMERIC,                    -- 単位あたり単価
  vendor TEXT,
  location TEXT,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 6. `inventory_snapshots` - 棚卸し履歴
```sql
CREATE TABLE inventory_snapshots (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  inventory_date TIMESTAMP,
  items JSONB,  -- 当時の在庫データ
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 7. `csv_unit_overrides` - CSV単位上書き
```sql
CREATE TABLE csv_unit_overrides (
  id UUID PRIMARY KEY,
  ingredient_name TEXT UNIQUE NOT NULL,
  override_unit TEXT,  -- 「袋」「本」「箱」など
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 8. `recent_views` - 最近表示したレシピ
```sql
CREATE TABLE recent_views (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP DEFAULT NOW()
);
```

### RLS (Row-Level Security) ポリシー

#### `recipes` テーブルの RLS
```sql
-- 自分のレシピは読み取り可能
CREATE POLICY "users_can_view_own_recipes"
ON recipes FOR SELECT
USING (user_id = auth.uid() OR is_shared = TRUE OR auth.jwt() ->> 'role' = 'admin');

-- 自分のレシピのみ編集可能
CREATE POLICY "users_can_update_own_recipes"
ON recipes FOR UPDATE
USING (user_id = auth.uid());

-- 管理者は全て編集可能
CREATE POLICY "admin_can_update_any_recipe"
ON recipes FOR UPDATE
USING (auth.jwt() ->> 'role' = 'admin');
```

### RPC 関数（サーバーサイド処理）

#### `search_ingredients(search_query TEXT, max_results INT = 15)`
材料データベースから高速に検索する関数

```sql
CREATE OR REPLACE FUNCTION search_ingredients(
  search_query TEXT,
  max_results INT DEFAULT 15
)
RETURNS TABLE(
  ingredient_name TEXT,
  packet_size NUMERIC,
  packet_unit TEXT,
  last_price NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    uc.ingredient_name,
    uc.packet_size,
    uc.packet_unit,
    uc.last_price
  FROM unit_conversions uc
  WHERE uc.ingredient_name ILIKE search_query || '%'
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### インデックス（パフォーマンス最適化）

```sql
-- タグ検索の高速化（GIN インデックス）
CREATE INDEX idx_recipes_tags ON recipes USING GIN (tags);

-- レシピコンテンツのレシピID検索
CREATE INDEX idx_recipe_contents_recipe_id ON recipe_contents(recipe_id);

-- 最近表示したレシピの時系列検索
CREATE INDEX idx_recent_views_user_id_viewed_at
  ON recent_views(user_id, viewed_at DESC);

-- 在庫の材料名検索
CREATE INDEX idx_inventory_items_ingredient_name
  ON inventory_items(ingredient_name);
```

---

## フロントエンド

### 主要コンポーネント

#### 1. **RecipeForm.jsx** - レシピ作成・編集画面

**役割**: レシピの新規作成・既存レシピの編集

**状態管理**:
```javascript
const [formData, setFormData] = useState({
  name: '',
  description: '',
  tags: [],
  baker_percentage: false,
  ingredientSections: [
    { id: '...', name: '材料', items: [...] }
  ],
  steps: [...],
  notes: '',
  is_shared: false
});
```

**key 機能**:
- ドラッグ&ドロップで材料の順序変更（React DnD Kit）
- 材料名のオートコンプリート（DB + CSV）
- 原価の自動計算（単位に応じた計算ロジック）
- Web/画像の取り込み
- 編集時に「他人のレシピ」なら自動コピー作成

#### 2. **RecipeDetail.jsx** - レシピ詳細表示・閲覧

**役割**: レシピの表示と計算

**key 機能**:
- 仕込み倍率の変更（×0.5, ×1.0, ×2.0など）
- Baker's % の自動計算（パンレシピ用）
- 多言語翻訳（AIによる自動翻訳）
- 調理モードの起動
- 原価表示

#### 3. **RecipeFormIngredients.jsx** - 材料入力フォーム

**役割**: 材料の追加・編集・並び替え

**key 技術**:
- **React DnD Kit**: ドラッグ&ドロップ対応
- **AutocompleteInput**: オートコンプリート入力
- **原価計算ロジック**:
  ```javascript
  if (unit === 'g' || unit === 'ml') {
    cost = (quantity / 1000) * purchaseCost;  // kg/Lあたり単価
  } else {
    cost = quantity * purchaseCost;           // 個数単位
  }
  ```

#### 4. **AutocompleteInput.jsx** - 材料名入力フォーム

**役割**: 材料名の入力補完

**検索戦略**:
1. **Database Search** (優先): `search_ingredients()` RPC 関数で高速検索
2. **CSV Fallback**: DB検索が遅い場合に CSV メモリ検索へ fallback
3. **キャッシング**: 同じ検索クエリは結果をキャッシュ

**コード例**:
```javascript
const _searchFromDatabase = async (query) => {
  const { data, error } = await supabase
    .rpc('search_ingredients', {
      search_query: query,
      max_results: 15
    });
  // キャッシュに保存
  searchResultsCache.set(cacheKey, data);
  return data;
};
```

#### 5. **InventoryManagement.jsx** - 在庫管理

**役割**: 材料の在庫管理・棚卸し

**特記事項**:
- 材料マスター優先ロジック: 在庫の単価は `lastPrice / packetSize` で正規化
- 本/袋 → g/ml への自動単位変換
- 棚卸し履歴の保存（CSV ダウンロード可）

#### 6. **OrderList.jsx** - 発注リスト

**役割**: 発注対象の材料を自動抽出

**計算ロジック**:
```javascript
// 残在庫が 1発注単位の2割を切ったら発注対象
const thresholdQty = packetSize * 0.2;  // 20%ルール
const shouldOrder = currentInventory < thresholdQty;

// 発注量は元の単位（袋/本）で表示
const orderQuantity = Math.ceil(
  (neededQuantity - currentInventory) / packetSize
);
```

### レスポンシブデザイン

**CSS Grid Breakpoints**:
```css
/* モバイル (< 600px) */
.form-ingredient-row {
  grid-template-columns: 20px 2fr 1fr 1fr 60px 60px 20px 24px;
  font-size: 0.8rem;
}

/* タブレット (600px - 1200px) */
@media (min-width: 600px) {
  .form-ingredient-row {
    grid-template-columns: 24px minmax(70px, 3fr) minmax(50px, 1fr) ...;
    font-size: 0.85rem;
  }
}

/* デスクトップ (1200px+) */
@media (min-width: 1200px) {
  .form-ingredient-row {
    grid-template-columns: 30px 1fr 80px 70px 90px 90px 30px 40px;
    font-size: 0.9rem;
  }
}
```

---

## サービス層（ビジネスロジック）

### 1. **recipeService.js** - レシピ操作

```javascript
// レシピを取得（優先順位: ユーザー's recipes → 共有レシピ）
export const recipeService = {
  async getRecipes(limit = 50) { ... },

  async getRecipeDetail(id) { ... },

  // レシピ保存時：他人のレシピなら自動コピー
  async saveRecipe(recipe) {
    if (recipe.user_id !== auth.currentUser.id) {
      // 他人のレシピ → コピー作成
      const copiedRecipe = { ...recipe, id: uuid(), user_id: currentUser.id };
      return save(copiedRecipe);
    }
    return save(recipe);
  },

  async deleteRecipe(id) { ... },

  async searchRecipes(query) { ... }
};
```

**Query Pattern Caching** (パフォーマンス最適化):
- 初回ロード時: 複数のクエリパターン (V1→V2→V3→V4) を試す
- 成功したパターンをキャッシュ
- 次回以降: キャッシュされたパターンを直接使用
- 結果: クエリ時間が大幅短縮

### 2. **ingredientSearchService.js** - 材料検索

**検索戦略**:
```javascript
export const ingredientSearchService = {
  // キャッシュ
  searchResultsCache: new Map(),

  async search(query) {
    // 1. キャッシュチェック
    if (this.searchResultsCache.has(query)) {
      return this.searchResultsCache.get(query);
    }

    // 2. Database search (RPC)
    const dbResults = await this._searchFromDatabase(query);
    if (dbResults && dbResults.length > 0) {
      this.searchResultsCache.set(query, dbResults);
      return dbResults;
    }

    // 3. Fallback to CSV search
    const csvResults = await this._searchFromCSV(query);
    this.searchResultsCache.set(query, csvResults);
    return csvResults;
  },

  invalidateCache() {
    this.searchResultsCache.clear();
  }
};
```

### 3. **unitConversionService.js** - 単位換算

```javascript
export const unitConversionService = {
  // 材料マスターを取得
  async getAllConversions() {
    const { data } = await supabase
      .from('unit_conversions')
      .select('*');
    return new Map(data.map(d => [d.ingredient_name, d]));
  },

  // 正規化単価を計算（kg/L単位）
  normalizePricePerUnit(lastPrice, packetSize) {
    return lastPrice / packetSize;  // 例: 10900円 / 25000g = 0.436円/g
  },

  // 単位変換（本→ml など）
  convertUnit(value, fromUnit, toUnit) { ... }
};
```

### 4. **inventoryService.js** - 在庫管理

```javascript
export const inventoryService = {
  // 材料マスター優先ロジック
  async getInventoryWithMaster(ingredients) {
    const masters = await unitConversionService.getAllConversions();

    return ingredients.map(item => {
      const master = masters.get(item.ingredient_name);
      if (master) {
        // マスターがある場合: 単価を正規化
        return {
          ...item,
          price: master.lastPrice / master.packetSize,
          unit: master.packetUnit,
          contentAmount: master.packetSize
        };
      }
      return item;
    });
  },

  // 棚卸し完了時の履歴保存
  async completeInventory(items) {
    await supabase
      .from('inventory_snapshots')
      .insert([{ user_id: auth.uid(), items }]);
  }
};
```

### 5. **purchasePriceService.js** - 発注価格計算

```javascript
export const purchasePriceService = {
  // 発注量の計算（2割ルール）
  calculateOrderQuantity(needed, current, packetSize) {
    const threshold = packetSize * 0.2;  // 20% threshold

    if (current >= threshold) {
      return 0;  // 在庫十分
    }

    // 不足分を袋単位で切り上げ
    const shortfall = needed - current;
    return Math.ceil(shortfall / packetSize);
  }
};
```

---

## 認証とセキュリティ

### AuthContext.jsx - 認証管理

```javascript
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. ユーザー情報を取得
    const { data } = await supabase.auth.getUser();

    // 2. プロフィール情報を取得（with/without email列の並列実行）
    const profileData = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id),
      supabase.from('profiles').select('id, full_name, role').eq('id', user.id)
    ]);

    setUser(data.user);
    setProfile(profileData[0] || profileData[1]);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
```

**セキュリティポイント**:
1. **RLS (Row-Level Security)**: すべてのテーブルに RLS ポリシーを適用
2. **認証トークン検証**: すべての API リクエストに Supabase JWT を含める
3. **他人のデータアクセス防止**: SELECT時に `user_id = auth.uid()` チェック
4. **管理者専用機能**: `auth.jwt() ->> 'role' = 'admin'` で確認

### パスワードリセット

Supabase Authentication の標準機能を使用：
- ユーザーは email + パスワードでログイン
- パスワード忘れ時: 「秘密の質問」またはメールで再設定
- 管理者は特定ユーザーのパスワード再設定リンクを送信可能

---

## パフォーマンス最適化

### 1. 実装済みの最適化

#### Promise.all() による並列データ読み込み
```javascript
// Before: 順序実行（遅い）
await loadRecipes();
await loadTrashCount();
await loadRecentHistory();

// After: 並列実行（高速）
await Promise.all([
  loadRecipes(),
  loadTrashCount(),
  loadRecentHistory()
]);
```
**期待効果**: 15-43秒 → 5-8秒（75-85%高速化）

#### Query Pattern Caching
```javascript
// 初回: V1→V2→V3→V4 を試す
// 成功したパターンをキャッシュ
// 次回以降: キャッシュから直接実行
```
**期待効果**: 同じクエリの実行時間が大幅短縮

#### Database Indexes
```sql
-- GIN Index (JSONB配列検索)
CREATE INDEX idx_recipes_tags ON recipes USING GIN (tags);

-- B-tree Indexes (単純な範囲検索・結合)
CREATE INDEX idx_recipe_contents_recipe_id ON recipe_contents(recipe_id);
CREATE INDEX idx_recent_views_user_id_viewed_at
  ON recent_views(user_id, viewed_at DESC);
```

#### Debounce Optimization
```javascript
// AutocompleteInput の検索入力
const [debouncedSearch] = useDebouncedValue(searchQuery, 150);  // 300ms → 150ms

// 効果: ユーザー入力中の不要な検索リクエスト削減
```

#### RPC 関数による高速検索
- CSV全体をクライアントに読み込むのではなく、DB側で検索
- ネットワーク転送量削減
- サーバー側での効率的な検索（インデックス利用）

### 2. 測定方法

**Chrome DevTools**:
1. F12 → Network タブ
2. 初回ロード時の総時間を測定
3. ログイン後 5秒以内にレシピが表示されるか確認

**パフォーマンスプロファイル**:
```javascript
console.time('loadRecipes');
await loadRecipes();
console.timeEnd('loadRecipes');
```

### 3. キャッシング戦略

| レイヤー | キャッシュ対象 | TTL | クリア条件 |
|--------|--------------|-----|---------|
| メモリ | 検索結果 (ingredientSearch) | ∞ | 新規 CSV 取り込み時 |
| メモリ | クエリパターン (recipeService) | ∞ | 手動リセット |
| ブラウザ | 静的ファイル (CSS/JS) | 1年 | デプロイ時 |
| ブラウザ | API レスポンス | 1時間 | 手動リセット |

---

## デプロイメント

### 開発環境セットアップ

```bash
# 1. 依存関係をインストール
npm install

# 2. 環境変数を設定
# .env.local に Supabase URL とキーを追加
echo "VITE_SUPABASE_URL=https://xxx.supabase.co" > .env.local
echo "VITE_SUPABASE_ANON_KEY=xxx" >> .env.local

# 3. 開発サーバーを起動
npm run dev

# ブラウザで http://localhost:5173 を開く
```

### 本番デプロイメント

```bash
# 1. ビルド
npm run build

# 2. GitHub Pages へデプロイ
npm run deploy

# GitHub Actions が自動実行（main ブランチへの push 時）
```

**デプロイメントパイプライン**:
```
git push origin main
  ↓
GitHub Actions (Deploy to GitHub Pages) が起動
  ↓
npm run build（Vite でバンドル）
  ↓
gh-pages が dist/ を gh-pages ブランチに push
  ↓
GitHub Pages が自動公開
  ↓
https://yoshito.github.io/app-main-22/ で利用可能
```

### 環境変数

**Supabase**:
```javascript
// src/supabase.js
export const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);
```

**必要な環境変数**:
```
VITE_SUPABASE_URL=https://xxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...（長いキー）
```

---

## トラブルシューティング

### よくある問題と解決方法

#### 1. 「ログイン後、レシピが表示されない」

**原因**:
- プロフィール情報の読み込みが遅い
- RLS ポリシーがない
- ネットワークの遅延

**解決方法**:
```javascript
// AuthContext で並列読み込みを確認
console.log('Profile fetch started:', new Date());

// 4秒タイムアウトで次のクエリパターンに進む
```

#### 2. 「材料入力時にオートコンプリートが反応しない」

**原因**:
- DB RPC 関数が存在しない
- CSV が読み込まれていない
- ネットワーク遅延（debounce設定確認）

**解決方法**:
```bash
# 1. RPC 関数が存在するか確認
supabase sql query: SELECT * FROM pg_proc WHERE proname = 'search_ingredients';

# 2. 開発者ツールでネットワークリクエストを確認
# Chrome DevTools → Network → XHR タブ

# 3. ブラウザコンソールでキャッシュ状態を確認
console.log(ingredientSearchService.searchResultsCache);
```

#### 3. 「レシピ編集後、保存できない」

**原因**:
- 他人のレシピで RLS ポリシーによるブロック
- ネットワークエラー
- バリデーション失敗

**解決方法**:
```javascript
// 他人のレシピなら自動コピーが作成される
// コンソールで確認:
console.log('Original recipe ID:', recipe.id);
console.log('Copied recipe ID:', copiedRecipe.id);
```

#### 4. 「在庫管理で単価が計算されていない」

**原因**:
- 材料マスターの `lastPrice` / `packetSize` が計算されていない
- 単位の正規化に失敗

**解決方法**:
```javascript
// 正規化単価の計算を確認
const normalizedPrice = lastPrice / packetSize;  // 例: 10900 / 25000 = 0.436
console.log('Normalized price:', normalizedPrice);

// 在庫金額の計算
const inventoryValue = normalizedPrice * currentQuantity;
console.log('Inventory value:', inventoryValue);
```

#### 5. 「ブラウザのコンソールに赤いエラーが出ている」

**解決方法**:
1. F12 → Console タブを確認
2. エラーメッセージをコピー
3. Supabase ダッシュボード → Logs を確認
4. RLS ポリシーをチェック

#### 6. 「GitHub Actions のデプロイが失敗した」

**原因**:
- `gh-pages` パッケージのトークンが無効
- ビルドエラー

**解決方法**:
```bash
# ローカルでビルド確認
npm run build

# エラーがあれば修正
# その後 push
git add .
git commit -m "Fix build error"
git push origin main
```

### デバッグ Tips

#### React DevTools
```bash
# ブラウザ拡張をインストール
# https://chrome.google.com/webstore/detail/.../

# 使い方:
# F12 → Components タブで React コンポーネントツリーを確認
# Props と State の値を確認可能
```

#### Network Request ログ
```javascript
// src/supabase.js に以下を追加
supabase
  .from('recipes')
  .on('*', payload => {
    console.log('Database change:', payload);
  })
  .subscribe();
```

#### Local Storage の確認
```javascript
// ブラウザコンソール
localStorage.getItem('supabase.auth.token');
// キャッシュをクリア
localStorage.clear();
```

---

## まとめと推奨事項

### ✅ 現在の実装状況

- ✓ レシピ管理（作成・編集・共有）
- ✓ 原価計算（自動化）
- ✓ 在庫管理（棚卸し履歴保存）
- ✓ 発注リスト（2割ルール自動化）
- ✓ 多言語翻訳（AI自動翻訳）
- ✓ パフォーマンス最適化（並列読み込み・キャッシング）
- ✓ モバイル対応（レスポンシブデザイン）

### 📋 今後の改善提案

1. **オフライン対応**: Service Worker による キャッシング
2. **リアルタイム同期**: Supabase Realtime の活用
3. **バッチ処理**: 大量の材料インポート時の最適化
4. **監査ログ**: すべての変更を記録
5. **レポート機能**: 原価分析・売上分析

---

**Last Updated**: 2026-02-03
**Maintained By**: development team
