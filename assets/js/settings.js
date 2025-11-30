// 設定ページの管理機能
document.addEventListener('DOMContentLoaded', () => {
  
  // 設定管理クラス
  class SettingsManager {
    constructor() {
      this.STORAGE_KEY = 'recipe-box-settings';
      this.defaultSettings = {
        // AI設定
        aiSelectionMode: 'manual', // 'manual' or 'auto'
        defaultAI: 'groq', // 'groq' or 'chatgpt'
        
        // 専門プロンプト設定（基本プロンプトは固定）
        specializedPrompts: {
          cookingScience: null,      // 調理科学アドバイザー
          foodSafety: null,          // 食品安全コンサルタント
          sommelier: null,           // ソムリエ
          aiCreation: null,          // AI創作
          imageAnalysis: null        // 画像分析
        },
        
        // その他設定
        autoSave: true,
        theme: 'dark', // 'dark', 'light', 'auto'
        debugMode: false
      };
      
      this.currentSettings = this.loadSettings();
      this.initializeUI();
      this.applyTheme(); // 初期テーマ適用
      this.watchSystemTheme(); // システム設定監視開始
      this.checkAPIStatus();
      this.setupPasswordAuth(); // パスワード認証設定
      this.loadPasswordList(); // パスワード一覧読み込み
    }
    
    // 設定の読み込み
    loadSettings() {
      try {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        const settings = stored ? { ...this.defaultSettings, ...JSON.parse(stored) } : this.defaultSettings;
        return settings;
      } catch (error) {
        console.error('設定読み込みエラー:', error);
        return this.defaultSettings;
      }
    }
    
    // 設定の保存
    saveSettings() {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentSettings));
        
        // 設定変更イベントを発火
        window.dispatchEvent(new CustomEvent('settingsChanged', {
          detail: this.currentSettings
        }));
        
        return true;
      } catch (error) {
        console.error('設定保存エラー:', error);
        return false;
      }
    }
    
    // UIの初期化
    initializeUI() {
      this.bindEventListeners();
      this.populateSettings();
      this.updateAISelectionMode();
    }
    
    // イベントリスナーの設定
    bindEventListeners() {
      // AI選択モードの変更
      const aiSelectionMode = document.getElementById('ai-selection-mode');
      if (aiSelectionMode) {
      document.getElementById('current-api-service').addEventListener('change', (e) => {
          this.currentSettings.aiSelectionMode = e.target.value;
          this.updateAISelectionMode();
        });
      }
      
      // デフォルトAIの変更
      const defaultAI = document.getElementById('default-ai');
      if (defaultAI) {
        defaultAI.addEventListener('change', (e) => {
          this.currentSettings.defaultAI = e.target.value;
        });
      }
      
      
      // 専門プロンプト編集ボタン（パスワード認証が必要）
      const editButtons = [
        'edit-cooking-science-prompt',
        'edit-food-safety-prompt', 
        'edit-sommelier-prompt',
        'edit-ai-creation-prompt',
        'edit-image-analysis-prompt'
      ];
      
      const promptTypes = {
        'edit-cooking-science-prompt': { type: 'cookingScience', name: '調理科学アドバイザープロンプト' },
        'edit-food-safety-prompt': { type: 'foodSafety', name: '食品安全コンサルタントプロンプト' },
        'edit-sommelier-prompt': { type: 'sommelier', name: 'ソムリエプロンプト' },
        'edit-ai-creation-prompt': { type: 'aiCreation', name: 'AI創作プロンプト' },
        'edit-image-analysis-prompt': { type: 'imageAnalysis', name: '画像分析プロンプト' }
      };
      
      editButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
          button.addEventListener('click', () => {
            const promptInfo = promptTypes[buttonId];
            this.showPasswordModal(() => {
              this.openPromptEditor(promptInfo.type, promptInfo.name);
            });
          });
        }
      });
      
      // 専門プロンプトリセット（パスワード認証が必要）
      const resetSpecializedButton = document.getElementById('reset-specialized-prompts');
      if (resetSpecializedButton) {
        resetSpecializedButton.addEventListener('click', () => {
          this.showPasswordModal(() => {
            this.resetSpecializedPrompts();
          });
        });
      }
      
      // その他設定のトグル
      const autoSave = document.getElementById('auto-save');
      if (autoSave) {
        autoSave.addEventListener('change', (e) => {
          this.currentSettings.autoSave = e.target.checked;
        });
      }
      
      const themeSelector = document.getElementById('theme-selector');
      if (themeSelector) {
        themeSelector.addEventListener('change', (e) => {
          this.currentSettings.theme = e.target.value;
          this.applyTheme();
        });
      }
      
      const debugMode = document.getElementById('debug-mode');
      if (debugMode) {
        debugMode.addEventListener('change', (e) => {
          this.currentSettings.debugMode = e.target.checked;
        });
      }
      
      // アクションボタン（パスワード認証が必要）
      const saveButton = document.getElementById('save-settings');
      if (saveButton) {
        saveButton.addEventListener('click', () => {
          this.showPasswordModal(() => {
            this.saveSettings();
            this.showNotification('設定を保存しました', 'success');
          });
        });
      }
      
      const resetButton = document.getElementById('reset-settings');
      if (resetButton) {
        resetButton.addEventListener('click', () => {
          this.showPasswordModal(() => {
            this.resetAllSettings();
          });
        });
      }
      
      // パスワード管理ボタン
      const addPasswordButton = document.getElementById('add-admin-password');
      if (addPasswordButton) {
        addPasswordButton.addEventListener('click', () => {
          this.showPasswordAddModal();
        });
      }
      
      const changePasswordButton = document.getElementById('change-admin-password');
      if (changePasswordButton) {
        changePasswordButton.addEventListener('click', () => {
          this.showPasswordChangeModal();
        });
      }
      
      const removePasswordButton = document.getElementById('remove-admin-password');
      if (removePasswordButton) {
        removePasswordButton.addEventListener('click', () => {
          this.showPasswordRemoveModal();
        });
      }
      
      // モーダル関連
      const modalClose = document.getElementById('modal-close');
      if (modalClose) {
        modalClose.addEventListener('click', () => {
          this.closePromptModal();
        });
      }
      
      const modalCancel = document.getElementById('modal-cancel');
      if (modalCancel) {
        modalCancel.addEventListener('click', () => {
          this.closePromptModal();
        });
      }
      
      const modalSave = document.getElementById('modal-save');
      if (modalSave) {
        modalSave.addEventListener('click', () => {
          this.savePrompt();
        });
      }
    }
    
    // 設定値のUI反映
    populateSettings() {
      const aiSelectionMode = document.getElementById('ai-selection-mode');
      if (aiSelectionMode) {
        aiSelectionMode.value = this.currentSettings.aiSelectionMode;
      }
      const defaultAI = document.getElementById('default-ai');
      if (defaultAI) {
        defaultAI.value = this.currentSettings.defaultAI;
      }
      
      
      const autoSave = document.getElementById('auto-save');
      if (autoSave) {
        autoSave.checked = this.currentSettings.autoSave;
      }
      
      const themeSelector = document.getElementById('theme-selector');
      if (themeSelector) {
        themeSelector.value = this.currentSettings.theme;
      }
      
      const debugMode = document.getElementById('debug-mode');
      if (debugMode) {
        debugMode.checked = this.currentSettings.debugMode;
      }
    }
    
    // AI選択モードの更新
    updateAISelectionMode() {
      const defaultAISetting = document.getElementById('default-ai-setting');
      if (defaultAISetting) {
        if (this.currentSettings.aiSelectionMode === 'auto') {
          defaultAISetting.style.display = 'flex';
        } else {
          defaultAISetting.style.display = 'none';
        }
      }
    }
    
    // API状態の確認
    async checkAPIStatus() {
      
      // ChatGPT API状態確認
      try {
        const chatgptStatus = await this.checkChatGPTAPI();
        this.updateAPIStatus('chatgpt-status', chatgptStatus);
      } catch (error) {
        this.updateAPIStatus('chatgpt-status', false);
      }
      
      // Groq API状態確認
      try {
        const groqStatus = await this.checkGroqAPI();
        this.updateAPIStatus('groq-status', groqStatus);
      } catch (error) {
        this.updateAPIStatus('groq-status', false);
      }
      
      // Vision API状態確認
      try {
        const visionStatus = await this.checkVisionAPI();
        this.updateAPIStatus('vision-status', visionStatus);
      } catch (error) {
        this.updateAPIStatus('vision-status', false);
      }
    }
    
    // ChatGPT API状態確認
    async checkChatGPTAPI() {
      try {
        // ChatGPT APIキーの存在確認のみを行う
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/get-api-keys`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            keyName: 'OPENAI_API_KEY'
          })
        });
        
        if (!response.ok) {
          return false;
        }
        
        const data = await response.json();
        return data.success && data.hasKey;
      } catch (error) {
        console.error('ChatGPT API確認エラー:', error);
        return false;
      }
    }
    
    // Groq API状態確認
    async checkGroqAPI() {
      try {
        // Groq APIキーの存在確認のみを行う
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/get-api-keys`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            keyName: 'GROQ_API_KEY'
          })
        });
        
        if (!response.ok) {
          return false;
        }
        
        const data = await response.json();
        return data.success && data.hasKey;
      } catch (error) {
        console.error('API確認エラー:', error);
        return false;
      }
    }
    
    // Vision API状態確認
    async checkVisionAPI() {
      try {
        // Vision APIは画像データが必要なので、APIキーの存在確認のみを行う
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/get-api-keys`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            keyName: 'VISION_API_KEY'
          })
        });
        
        if (!response.ok) {
          return false;
        }
        
        const data = await response.json();
        return data.success && data.hasKey;
      } catch (error) {
        console.error('Vision API確認エラー:', error);
        return false;
      }
    }
    
    // API状態表示の更新
    updateAPIStatus(elementId, isActive) {
      const element = document.getElementById(elementId);
      if (element) {
        if (isActive) {
          element.className = 'status-indicator active';
          element.innerHTML = '<i class="fas fa-circle"></i> 利用可能';
        } else {
          element.className = 'status-indicator inactive';
          element.innerHTML = '<i class="fas fa-circle"></i> 利用不可';
        }
      }
    }
    
    // プロンプトエディタを開く
    openPromptEditor(promptType, title) {
      const modal = document.getElementById('prompt-modal');
      const modalTitle = document.getElementById('modal-title');
      const editor = document.getElementById('prompt-editor');
      
      modalTitle.textContent = title;
      
      // 現在のプロンプトを読み込み
      const currentPrompt = this.currentSettings.specializedPrompts[promptType];
      editor.value = currentPrompt || this.getDefaultSpecializedPrompt(promptType);
      
      // モーダルを表示
      modal.style.display = 'flex';
      editor.focus();
      
      // 現在編集中のプロンプトタイプを保存
      this.currentEditingPrompt = promptType;
    }
    
    // デフォルト専門プロンプトの取得
    getDefaultSpecializedPrompt(promptType) {
      const defaultPrompts = {
        cookingScience: `あなたはプロ向けの調理科学アドバイザーです。

# レシピ名
{title}

## 材料
{ingredients}

## 手順
{steps}

## 改善提案（要約版）

### 主要な改善点（5個）

各改善点を簡潔に記述してください：

#### 1. [改善項目名]
- **根拠:** 簡潔な科学的根拠
- **実装:** 具体的な手順（1-2行）
- **注意点:** 重要なリスクや注意事項

#### 2. [改善項目名]
- **根拠:** 簡潔な科学的根拠
- **実装:** 具体的な手順（1-2行）
- **注意点:** 重要なリスクや注意事項

#### 3. [改善項目名]
- **根拠:** 簡潔な科学的根拠
- **実装:** 具体的な手順（1-2行）
- **注意点:** 重要なリスクや注意事項

#### 4. [改善項目名]
- **根拠:** 簡潔な科学的根拠
- **実装:** 具体的な手順（1-2行）
- **注意点:** 重要なリスクや注意事項

#### 5. [改善項目名]
- **根拠:** 簡潔な科学的根拠
- **実装:** 具体的な手順（1-2行）
- **注意点:** 重要なリスクや注意事項

### 調理科学のポイント

重要な調理科学の観点を簡潔に箇条書きで：
- メイラード反応、酵素活性、タンパク質変性など
- パン/生地系の場合はベーカーズ％の妥当性`,

        foodSafety: `あなたはプロの食品安全コンサルタントです。
以下のレシピの重要管理点（CCP）における温度と時間を管理するための表を作成してください。

# レシピ名
{title}

## 材料
{ingredients}

## 手順
{steps}

— 出力仕様 —
- 必ずMarkdownの表形式で出力してください。
- 表には「工程」「温度（表面/中心）」「時間」「備考（食品安全上の根拠等）」の列を含めてください。`,

        sommelier: `あなたはプロのソムリエです。
以下のレシピに最適なペアリングワインを3種類提案してください。

# レシピ名
{title}

## 材料
{ingredients}

## 手順
{steps}

## ペアリングワイン提案

### 1. [ワイン名・産地・年]（[色・タイプ]）
- **選定理由:** 料理の特徴とワインの特性の相性
- **味わい:** ワインの味わいの特徴
- **セパージュ:** 使用されているブドウ品種
- **検証:** なぜこの組み合わせが良いのかの科学的・感覚的根拠

### 2. [ワイン名・産地・年]（[色・タイプ]）
- **選定理由:** 料理の特徴とワインの特性の相性
- **味わい:** ワインの味わいの特徴
- **セパージュ:** 使用されているブドウ品種
- **検証:** なぜこの組み合わせが良いのかの科学的・感覚的根拠

### 3. [ワイン名・産地・年]（[色・タイプ]）
- **選定理由:** 料理の特徴とワインの特性の相性
- **味わい:** ワインの味わいの特徴
- **セパージュ:** 使用されているブドウ品種
- **検証:** なぜこの組み合わせが良いのかの科学的・感覚的根拠

## ペアリングの基本原則

- **相補性:** 料理とワインの味のバランス
- **相乗効果:** 料理とワインが互いを引き立てる効果
- **地域性:** 同じ地域の料理とワインの相性
- **温度:** 適切な飲用温度の提案`,

        aiCreation: `あなたは創造的な料理人です。
以下のレシピを参考に、新しいバリエーションや改善版を提案してください。

# 参考レシピ
{title}

## 材料
{ingredients}

## 手順
{steps}

## 創作提案

### 1. バリエーション提案
- **コンセプト:** 新しいアプローチのアイデア
- **材料の変更:** 代替材料や追加材料
- **調理法の工夫:** 新しい調理技法や手順の改善
- **味の特徴:** 期待される味の変化

### 2. 季節アレンジ
- **春夏版:** 軽やかで爽やかな味わいへの変更
- **秋冬版:** 濃厚で温かみのある味わいへの変更

### 3. 健康志向アレンジ
- **低カロリー版:** カロリーを抑えた材料・調理法
- **アレルギー対応版:** アレルゲンフリーの代替案
- **栄養強化版:** 栄養価を高めた材料の追加`,

        imageAnalysis: `この画像に写っているレシピや料理の情報を抽出してください。

以下の情報を分析してください：
1. 料理名・レシピ名
2. 使用されている材料（可能な限り）
3. 調理法・調理手順
4. 調理時間の推定
5. 難易度の推定
6. カテゴリ分類

分析結果は日本語で説明してください。`
      };
      
      return defaultPrompts[promptType] || '';
    }
    
    // プロンプトの保存
    savePrompt() {
      const editor = document.getElementById('prompt-editor');
      const prompt = editor.value.trim();
      
      if (!prompt) {
        this.showNotification('プロンプトを入力してください', 'error');
        return;
      }
      
      // 専門プロンプトを保存
      this.currentSettings.specializedPrompts[this.currentEditingPrompt] = prompt;
      
      // 設定も保存
      this.saveSettings();
      
      this.closePromptModal();
      this.showNotification('プロンプトを保存しました', 'success');
    }
    
    // プロンプトモーダルを閉じる
    closePromptModal() {
      const modal = document.getElementById('prompt-modal');
      modal.style.display = 'none';
      this.currentEditingPrompt = null;
    }
    
    // 専門プロンプトのリセット
    resetSpecializedPrompts() {
      if (confirm('専門プロンプトをデフォルトに戻しますか？')) {
        this.currentSettings.specializedPrompts = {
          cookingScience: null,      // 調理科学アドバイザー
          foodSafety: null,          // 食品安全コンサルタント
          sommelier: null,           // ソムリエ
          aiCreation: null,          // AI創作
          imageAnalysis: null        // 画像分析
        };
        
        this.showNotification('専門プロンプトをリセットしました', 'success');
      }
    }
    
    // 全設定のリセット
    resetAllSettings() {
      if (confirm('すべての設定をデフォルトに戻しますか？')) {
        this.currentSettings = { ...this.defaultSettings };
        this.populateSettings();
        this.updateAISelectionMode();
        this.applyTheme();
        this.showNotification('設定をリセットしました', 'success');
      }
    }
    
    // テーマの適用
    applyTheme() {
      const theme = this.currentSettings.theme;
      
      // 既存のテーマクラスを削除
      document.body.classList.remove('light-theme', 'dark-theme');
      
      if (theme === 'auto') {
        // システム設定に従う
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
          document.body.classList.add('light-theme');
        } else {
          document.body.classList.add('dark-theme');
        }
      } else if (theme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        // デフォルトはダークテーマ
        document.body.classList.add('dark-theme');
      }
      
    }
    
    // システム設定の変更を監視
    watchSystemTheme() {
      if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        mediaQuery.addEventListener('change', () => {
          if (this.currentSettings.theme === 'auto') {
            this.applyTheme();
          }
        });
      }
    }
    
    // パスワード認証の設定
    setupPasswordAuth() {
      this.pendingAction = null;
      this.passwordList = [];
    }
    
    // パスワード一覧の読み込み
    async loadPasswordList() {
      try {
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/manage-admin-passwords`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({ action: 'list' })
        });
        
        if (response.ok) {
          const data = await response.json();
          this.passwordList = data.passwords || [];
          this.updatePasswordListDisplay();
        }
      } catch (error) {
        console.error('パスワード一覧読み込みエラー:', error);
      }
    }
    
    // パスワード一覧表示の更新
    updatePasswordListDisplay() {
      const passwordListElement = document.getElementById('password-list');
      if (!passwordListElement) return;
      
      if (this.passwordList.length === 0) {
        passwordListElement.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.875rem;">登録されているパスワードがありません</div>';
        return;
      }
      
      const listHTML = this.passwordList.map((password, index) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-light);">
          <div>
            <strong style="color: var(--text-primary);">${password.name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">登録日: ${new Date(password.createdAt).toLocaleDateString('ja-JP')}</div>
          </div>
          <div style="font-family: monospace; color: var(--text-secondary);">${password.password}</div>
        </div>
      `).join('');
      
      passwordListElement.innerHTML = `
        <div style="margin-bottom: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">
          登録数: ${this.passwordList.length}/3
        </div>
        ${listHTML}
      `;
    }
    
    // パスワードモーダルの表示
    showPasswordModal(action) {
      this.pendingAction = action;
      const modal = document.getElementById('password-modal');
      const input = document.getElementById('password-input');
      const error = document.getElementById('password-error');
      
      // モーダルをリセット
      input.value = '';
      error.style.display = 'none';
      error.textContent = '';
      
      // モーダルを表示
      modal.style.display = 'flex';
      modal.classList.add('modal-overlay');
      input.focus();
      
      // イベントリスナーを設定
      document.getElementById('password-confirm').addEventListener('click', () => {
        this.authenticatePassword();
      });
      
      document.getElementById('password-cancel').addEventListener('click', () => {
        this.closePasswordModal();
      });
      
      document.getElementById('password-modal-close').addEventListener('click', () => {
        this.closePasswordModal();
      });
      
      // Enterキーで認証
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.authenticatePassword();
        }
      });
    }
    
    // パスワード認証の実行
    async authenticatePassword() {
      const input = document.getElementById('password-input');
      const error = document.getElementById('password-error');
      const password = input.value.trim();
      const confirmBtn = document.getElementById('password-confirm');
      
      if (!password) {
        error.textContent = 'パスワードを入力してください';
        error.style.display = 'block';
        return;
      }
      
      // ボタンを無効化
      confirmBtn.disabled = true;
      confirmBtn.textContent = '認証中...';
      error.style.display = 'none';
      
      try {
        // Supabase Functionでパスワード認証
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/manage-admin-passwords`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({ 
            action: 'verify',
            passwordData: { password }
          })
        });
        
        if (!response.ok) {
          throw new Error(`認証サーバーエラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.isValid) {
          // 認証成功
          this.closePasswordModal();
          if (this.pendingAction) {
            this.pendingAction();
            this.pendingAction = null;
          }
        } else {
          // 認証失敗
          error.textContent = 'パスワードが正しくありません';
          error.style.display = 'block';
          input.value = '';
          input.focus();
        }
        
      } catch (error) {
        console.error('認証エラー:', error);
        error.textContent = '認証中にエラーが発生しました。再度お試しください。';
        error.style.display = 'block';
      } finally {
        // ボタンを復旧
        confirmBtn.disabled = false;
        confirmBtn.textContent = '認証';
      }
    }
    
    // パスワードモーダルを閉じる
    closePasswordModal() {
      const modal = document.getElementById('password-modal');
      modal.style.display = 'none';
      modal.classList.remove('modal-overlay');
      this.pendingAction = null;
    }
    
    // パスワード変更モーダルの表示
    showPasswordChangeModal() {
      const modal = document.getElementById('password-change-modal');
      const selectElement = document.getElementById('change-password-select');
      const currentPassword = document.getElementById('current-password');
      const newPassword = document.getElementById('new-password');
      const confirmPassword = document.getElementById('confirm-password');
      const error = document.getElementById('password-change-error');
      const success = document.getElementById('password-change-success');
      
      // セレクトボックスを更新
      selectElement.innerHTML = '<option value="">パスワードを選択してください</option>';
      this.passwordList.forEach(password => {
        const option = document.createElement('option');
        option.value = password.id;
        option.textContent = password.name;
        selectElement.appendChild(option);
      });
      
      // モーダルをリセット
      selectElement.value = '';
      currentPassword.value = '';
      newPassword.value = '';
      confirmPassword.value = '';
      error.style.display = 'none';
      success.style.display = 'none';
      error.textContent = '';
      success.textContent = '';
      
      // 入力フィールドを明示的に有効化
      selectElement.disabled = false;
      currentPassword.disabled = false;
      newPassword.disabled = false;
      confirmPassword.disabled = false;
      
      // モーダルを表示
      modal.style.display = 'flex';
      modal.classList.add('modal-overlay');
      
      // 少し遅延してフォーカスを設定（モーダル表示完了後）
      setTimeout(() => {
        selectElement.focus();
      }, 100);
      
      // イベントリスナーを設定（重複を避けるため一度削除してから追加）
      const confirmBtn = document.getElementById('password-change-confirm');
      const cancelBtn = document.getElementById('password-change-cancel');
      const closeBtn = document.getElementById('password-change-modal-close');
      
      // 既存のイベントリスナーを削除
      confirmBtn.replaceWith(confirmBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      closeBtn.replaceWith(closeBtn.cloneNode(true));
      
      // 新しいイベントリスナーを追加
      document.getElementById('password-change-confirm').addEventListener('click', () => {
        this.changeAdminPassword();
      });
      
      document.getElementById('password-change-cancel').addEventListener('click', () => {
        this.closePasswordChangeModal();
      });
      
      document.getElementById('password-change-modal-close').addEventListener('click', () => {
        this.closePasswordChangeModal();
      });
      
      // モーダル背景クリックで閉じる
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closePasswordChangeModal();
        }
      });
      
      // Enterキーで変更実行
      const inputs = [currentPassword, newPassword, confirmPassword];
      inputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.changeAdminPassword();
          }
        });
      });
    }
    
    // 管理者パスワードの変更
    async changeAdminPassword() {
      const selectElement = document.getElementById('change-password-select');
      const currentPassword = document.getElementById('current-password').value.trim();
      const newPassword = document.getElementById('new-password').value.trim();
      const confirmPassword = document.getElementById('confirm-password').value.trim();
      const error = document.getElementById('password-change-error');
      const success = document.getElementById('password-change-success');
      const confirmBtn = document.getElementById('password-change-confirm');
      
      const selectedId = selectElement.value;
      
      // 入力検証
      if (!selectedId || !currentPassword || !newPassword || !confirmPassword) {
        error.textContent = 'すべてのフィールドを入力してください';
        error.style.display = 'block';
        success.style.display = 'none';
        return;
      }
      
      if (newPassword !== confirmPassword) {
        error.textContent = '新しいパスワードが一致しません';
        error.style.display = 'block';
        success.style.display = 'none';
        return;
      }
      
      if (newPassword.length < 3) {
        error.textContent = '新しいパスワードは3文字以上である必要があります';
        error.style.display = 'block';
        success.style.display = 'none';
        return;
      }
      
      // ボタンを無効化
      confirmBtn.disabled = true;
      confirmBtn.textContent = '変更中...';
      error.style.display = 'none';
      success.style.display = 'none';
      
      try {
        // Supabase Functionでパスワード変更
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/manage-admin-passwords`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({ 
            action: 'change',
            passwordData: {
              id: selectedId,
              currentPassword: currentPassword,
              newPassword: newPassword
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`パスワード変更サーバーエラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          // 変更成功
          success.textContent = data.message;
          success.style.display = 'block';
          error.style.display = 'none';
          
          // パスワード一覧を更新
          await this.loadPasswordList();
          
          // 3秒後にモーダルを閉じる
          setTimeout(() => {
            this.closePasswordChangeModal();
            this.showNotification('管理者パスワードが変更されました', 'success');
          }, 3000);
          
        } else {
          // 変更失敗
          error.textContent = data.error || 'パスワード変更に失敗しました';
          error.style.display = 'block';
          success.style.display = 'none';
        }
        
      } catch (error) {
        console.error('パスワード変更エラー:', error);
        error.textContent = 'パスワード変更中にエラーが発生しました。再度お試しください。';
        error.style.display = 'block';
        success.style.display = 'none';
      } finally {
        // ボタンを復旧
        confirmBtn.disabled = false;
        confirmBtn.textContent = '変更';
      }
    }
    
    // パスワード変更モーダルを閉じる
    closePasswordChangeModal() {
      const modal = document.getElementById('password-change-modal');
      modal.style.display = 'none';
      modal.classList.remove('modal-overlay');
    }
    
    // パスワード追加モーダルの表示
    showPasswordAddModal() {
      
      const modal = document.getElementById('password-add-modal');
      const nameInput = document.getElementById('new-password-name');
      const passwordInput = document.getElementById('new-password-value');
      const confirmInput = document.getElementById('confirm-new-password');
      const error = document.getElementById('password-add-error');
      const success = document.getElementById('password-add-success');
      
        modal: modal,
        nameInput: nameInput,
        passwordInput: passwordInput,
        confirmInput: confirmInput
      });
      
      // モーダルをリセット
      if (nameInput) nameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      if (confirmInput) confirmInput.value = '';
      if (error) {
        error.style.display = 'none';
        error.textContent = '';
      }
      if (success) {
        success.style.display = 'none';
        success.textContent = '';
      }
      
      // 入力フィールドを明示的に有効化
      if (nameInput) {
        nameInput.disabled = false;
        nameInput.readOnly = false;
        nameInput.style.pointerEvents = 'auto';
        nameInput.style.opacity = '1';
          disabled: nameInput.disabled,
          readOnly: nameInput.readOnly,
          value: nameInput.value,
          style: nameInput.style.cssText
        });
      }
      
      if (passwordInput) {
        passwordInput.disabled = false;
        passwordInput.readOnly = false;
        passwordInput.style.pointerEvents = 'auto';
        passwordInput.style.opacity = '1';
      }
      
      if (confirmInput) {
        confirmInput.disabled = false;
        confirmInput.readOnly = false;
        confirmInput.style.pointerEvents = 'auto';
        confirmInput.style.opacity = '1';
      }
      
      // モーダルを表示
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-overlay');
        
        // 少し遅延してフォーカスを設定（モーダル表示完了後）
        setTimeout(() => {
          if (nameInput) {
            nameInput.focus();
            
            // 入力フィールドのクリックイベントをテスト
            nameInput.addEventListener('click', () => {
            });
            
            nameInput.addEventListener('input', (e) => {
            });
            
            nameInput.addEventListener('keydown', (e) => {
            });
          }
        }, 100);
      }
      
      // イベントリスナーを設定（重複を避けるため一度削除してから追加）
      const confirmBtn = document.getElementById('password-add-confirm');
      const cancelBtn = document.getElementById('password-add-cancel');
      const closeBtn = document.getElementById('password-add-modal-close');
      
      // 既存のイベントリスナーを削除
      confirmBtn.replaceWith(confirmBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      closeBtn.replaceWith(closeBtn.cloneNode(true));
      
      // 新しいイベントリスナーを追加
      document.getElementById('password-add-confirm').addEventListener('click', () => {
        this.addAdminPassword();
      });
      
      document.getElementById('password-add-cancel').addEventListener('click', () => {
        this.closePasswordAddModal();
      });
      
      document.getElementById('password-add-modal-close').addEventListener('click', () => {
        this.closePasswordAddModal();
      });
      
      // モーダル背景クリックで閉じる
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closePasswordAddModal();
        }
      });
    }
    
    // 管理者パスワードの追加
    async addAdminPassword() {
      const nameInput = document.getElementById('new-password-name');
      const passwordInput = document.getElementById('new-password-value');
      const confirmInput = document.getElementById('confirm-new-password');
      const error = document.getElementById('password-add-error');
      const success = document.getElementById('password-add-success');
      const confirmBtn = document.getElementById('password-add-confirm');
      
      const name = nameInput.value.trim();
      const password = passwordInput.value.trim();
      const confirmPassword = confirmInput.value.trim();
      
      // 入力検証
      if (!name || !password || !confirmPassword) {
        error.textContent = 'すべてのフィールドを入力してください';
        error.style.display = 'block';
        success.style.display = 'none';
        return;
      }
      
      if (password !== confirmPassword) {
        error.textContent = '新しいパスワードが一致しません';
        error.style.display = 'block';
        success.style.display = 'none';
        return;
      }
      
      if (password.length < 3) {
        error.textContent = '新しいパスワードは3文字以上である必要があります';
        error.style.display = 'block';
        success.style.display = 'none';
        return;
      }
      
      // ボタンを無効化
      confirmBtn.disabled = true;
      confirmBtn.textContent = '追加中...';
      error.style.display = 'none';
      success.style.display = 'none';
      
      try {
        // Supabase Functionでパスワード追加
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/manage-admin-passwords`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({ 
            action: 'add',
            passwordData: { name, password }
          })
        });
        
        if (!response.ok) {
          throw new Error(`パスワード追加サーバーエラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          // 追加成功
          success.textContent = data.message;
          success.style.display = 'block';
          error.style.display = 'none';
          
          // パスワード一覧を更新
          await this.loadPasswordList();
          
          // 3秒後にモーダルを閉じる
          setTimeout(() => {
            this.closePasswordAddModal();
            this.showNotification('管理者パスワードが追加されました', 'success');
          }, 3000);
          
        } else {
          // 追加失敗
          error.textContent = data.error || 'パスワード追加に失敗しました';
          error.style.display = 'block';
          success.style.display = 'none';
        }
        
      } catch (error) {
        console.error('パスワード追加エラー:', error);
        error.textContent = 'パスワード追加中にエラーが発生しました。再度お試しください。';
        error.style.display = 'block';
        success.style.display = 'none';
      } finally {
        // ボタンを復旧
        confirmBtn.disabled = false;
        confirmBtn.textContent = '追加';
      }
    }
    
    // パスワード追加モーダルを閉じる
    closePasswordAddModal() {
      const modal = document.getElementById('password-add-modal');
      modal.style.display = 'none';
      modal.classList.remove('modal-overlay');
    }
    
    // パスワード削除モーダルの表示
    showPasswordRemoveModal() {
      const modal = document.getElementById('password-remove-modal');
      const selectElement = document.getElementById('remove-password-select');
      const confirmInput = document.getElementById('remove-current-password');
      const error = document.getElementById('password-remove-error');
      const success = document.getElementById('password-remove-success');
      
      // セレクトボックスを更新
      selectElement.innerHTML = '<option value="">パスワードを選択してください</option>';
      this.passwordList.forEach(password => {
        const option = document.createElement('option');
        option.value = password.id;
        option.textContent = password.name;
        selectElement.appendChild(option);
      });
      
      // モーダルをリセット
      selectElement.value = '';
      confirmInput.value = '';
      error.style.display = 'none';
      success.style.display = 'none';
      error.textContent = '';
      success.textContent = '';
      
      // 入力フィールドを明示的に有効化
      selectElement.disabled = false;
      confirmInput.disabled = false;
      
      // モーダルを表示
      modal.style.display = 'flex';
      modal.classList.add('modal-overlay');
      
      // 少し遅延してフォーカスを設定（モーダル表示完了後）
      setTimeout(() => {
        selectElement.focus();
      }, 100);
      
      // イベントリスナーを設定（重複を避けるため一度削除してから追加）
      const confirmBtn = document.getElementById('password-remove-confirm');
      const cancelBtn = document.getElementById('password-remove-cancel');
      const closeBtn = document.getElementById('password-remove-modal-close');
      
      // 既存のイベントリスナーを削除
      confirmBtn.replaceWith(confirmBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      closeBtn.replaceWith(closeBtn.cloneNode(true));
      
      // 新しいイベントリスナーを追加
      document.getElementById('password-remove-confirm').addEventListener('click', () => {
        this.removeAdminPassword();
      });
      
      document.getElementById('password-remove-cancel').addEventListener('click', () => {
        this.closePasswordRemoveModal();
      });
      
      document.getElementById('password-remove-modal-close').addEventListener('click', () => {
        this.closePasswordRemoveModal();
      });
      
      // モーダル背景クリックで閉じる
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closePasswordRemoveModal();
        }
      });
    }
    
    // 管理者パスワードの削除
    async removeAdminPassword() {
      const selectElement = document.getElementById('remove-password-select');
      const confirmInput = document.getElementById('remove-current-password');
      const error = document.getElementById('password-remove-error');
      const success = document.getElementById('password-remove-success');
      const confirmBtn = document.getElementById('password-remove-confirm');
      
      const selectedId = selectElement.value;
      const confirmPassword = confirmInput.value.trim();
      
      // 入力検証
      if (!selectedId || !confirmPassword) {
        error.textContent = 'パスワードを選択し、確認パスワードを入力してください';
        error.style.display = 'block';
        success.style.display = 'none';
        return;
      }
      
      // ボタンを無効化
      confirmBtn.disabled = true;
      confirmBtn.textContent = '削除中...';
      error.style.display = 'none';
      success.style.display = 'none';
      
      try {
        // Supabase Functionでパスワード削除
        const response = await fetch(`${getConfig('SUPABASE_URL')}/functions/v1/manage-admin-passwords`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getConfig('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({ 
            action: 'remove',
            passwordData: {
              id: selectedId,
              confirmPassword: confirmPassword
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`パスワード削除サーバーエラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          // 削除成功
          success.textContent = data.message;
          success.style.display = 'block';
          error.style.display = 'none';
          
          // パスワード一覧を更新
          await this.loadPasswordList();
          
          // 3秒後にモーダルを閉じる
          setTimeout(() => {
            this.closePasswordRemoveModal();
            this.showNotification('管理者パスワードが削除されました', 'success');
          }, 3000);
          
        } else {
          // 削除失敗
          error.textContent = data.error || 'パスワード削除に失敗しました';
          error.style.display = 'block';
          success.style.display = 'none';
        }
        
      } catch (error) {
        console.error('パスワード削除エラー:', error);
        error.textContent = 'パスワード削除中にエラーが発生しました。再度お試しください。';
        error.style.display = 'block';
        success.style.display = 'none';
      } finally {
        // ボタンを復旧
        confirmBtn.disabled = false;
        confirmBtn.textContent = '削除';
      }
    }
    
    // パスワード削除モーダルを閉じる
    closePasswordRemoveModal() {
      const modal = document.getElementById('password-remove-modal');
      modal.style.display = 'none';
      modal.classList.remove('modal-overlay');
    }
    
    // プロンプトモーダルを閉じる
    closePromptModal() {
      const modal = document.getElementById('prompt-modal');
      modal.style.display = 'none';
      modal.classList.remove('modal-overlay');
    }
    
    // 通知の表示
    showNotification(message, type = 'info') {
      // 既存の通知を削除
      const existingNotification = document.querySelector('.notification');
      if (existingNotification) {
        existingNotification.remove();
      }
      
      // 新しい通知を作成
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
      `;
      
      // スタイルを適用
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 500;
        animation: slideIn 0.3s ease;
      `;
      
      document.body.appendChild(notification);
      
      // 3秒後に自動削除
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }
  }
  
  // 設定マネージャーの初期化
  window.settingsManager = new SettingsManager();
  
});

// グローバル関数：設定の取得
function getAppSettings() {
  return window.settingsManager ? window.settingsManager.currentSettings : null;
}

// グローバル関数：AI選択の判定
function shouldShowAISelection() {
  const settings = getAppSettings();
  return settings && settings.aiSelectionMode === 'manual';
}

// グローバル関数：デフォルトAIの取得
function getDefaultAI() {
  const settings = getAppSettings();
  return settings ? settings.defaultAI : 'groq';
}


// グローバル関数：専門プロンプトの取得
function getSpecializedPrompt(promptType) {
  const settings = getAppSettings();
  return settings && settings.specializedPrompts[promptType] ? settings.specializedPrompts[promptType] : null;
}

// グローバル関数：設定の取得（config.jsから）
function getConfig(key) {
  return window.APP_CONFIG ? window.APP_CONFIG[key] : null;
}
