/**
 * 設定データベース管理
 * Supabaseを使用してユーザー設定を管理
 */

class SettingsDatabase {
  constructor() {
    this.supabaseUrl = window.APP_CONFIG?.SUPABASE_URL
    this.supabaseKey = window.APP_CONFIG?.SUPABASE_ANON_KEY
    this.userId = 'default_user'
    this.cache = new Map()
    this.cacheExpiry = 5 * 60 * 1000 // 5分
  }

  /**
   * 設定を取得（キャッシュ付き）
   */
  async getSetting(key, defaultValue = null) {
    try {

      // 設定チェック
      if (!this.supabaseUrl || !this.supabaseKey) {
        console.error('❌ Supabase設定が不正:', { url: this.supabaseUrl, key: this.supabaseKey ? '設定済み' : '未設定' })
        return defaultValue
      }

      // キャッシュをチェック
      const cached = this.getFromCache(key)
      if (cached !== null) {
        return cached
      }

      const response = await fetch(`${this.supabaseUrl}/functions/v1/manage-user-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          action: 'get',
          userId: this.userId,
          settingKey: key
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`HTTP ${response.status} エラー詳細:`, errorText)
        throw new Error(`HTTP ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      const value = result.success ? result.value : defaultValue

      // キャッシュに保存
      this.setCache(key, value)
      return value

    } catch (error) {
      console.error(`設定取得エラー (${key}):`, error)

      // フォールバック: localStorageから設定を取得
      const localStorageKey = `recipe-box-${key.replace(/_/g, '-')}`
      const fallbackValue = localStorage.getItem(localStorageKey)

      if (fallbackValue) {
        // キャッシュに保存
        this.setCache(key, fallbackValue)
        return fallbackValue
      }

      return defaultValue
    }
  }

  /**
   * すべての設定を取得
   */
  async getAllSettings() {
    try {

      // 設定チェック
      if (!this.supabaseUrl || !this.supabaseKey) {
        console.error('❌ Supabase設定が不正:', { url: this.supabaseUrl, key: this.supabaseKey ? '設定済み' : '未設定' })
        return {}
      }

      const response = await fetch(`${this.supabaseUrl}/functions/v1/manage-user-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          action: 'get_all',
          userId: this.userId
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`HTTP ${response.status} エラー詳細:`, errorText)
        throw new Error(`HTTP ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      if (result.success) {
        // キャッシュを更新
        Object.entries(result.settings).forEach(([key, value]) => {
          this.setCache(key, value)
        })
        return result.settings
      }

      return {}

    } catch (error) {
      console.error('全設定取得エラー:', error)

      // フォールバック: localStorageから設定を取得
      const fallbackSettings = {}
      const keys = [
        'selection_mode',
        'auto_selection_basis',
        'recipe_extraction_api',
        'text_generation_api',
        'image_analysis_api',
        'chat_api',
        'theme'
      ]

      keys.forEach(key => {
        const localStorageKey = `recipe-box-${key.replace(/_/g, '-')}`
        const value = localStorage.getItem(localStorageKey)
        if (value) {
          fallbackSettings[key] = value
        }
      })

      if (Object.keys(fallbackSettings).length > 0) {
        // キャッシュに保存
        Object.entries(fallbackSettings).forEach(([key, value]) => {
          this.setCache(key, value)
        })
        return fallbackSettings
      }

      return {}
    }
  }

  /**
   * 設定を保存
   */
  async setSetting(key, value) {
    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/manage-user-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          action: 'set',
          userId: this.userId,
          settingKey: key,
          settingValue: value
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`HTTP ${response.status} エラー詳細:`, errorText)
        throw new Error(`HTTP ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      if (result.success) {
        // キャッシュを更新
        this.setCache(key, value)
        return true
      }

      return false

    } catch (error) {
      console.error(`設定保存エラー (${key}):`, error)

      // フォールバック: localStorageに設定を保存
      try {
        const localStorageKey = `recipe-box-${key.replace(/_/g, '-')}`
        localStorage.setItem(localStorageKey, String(value))

        // キャッシュを更新
        this.setCache(key, value)
        return true
      } catch (fallbackError) {
        console.error(`localStorageフォールバック保存エラー (${key}):`, fallbackError)
        return false
      }
    }
  }

  /**
   * 複数設定を一括保存
   */
  async setMultipleSettings(settings) {
    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/manage-user-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          action: 'set_multiple',
          userId: this.userId,
          settings: settings
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`HTTP ${response.status} エラー詳細:`, errorText)
        throw new Error(`HTTP ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      if (result.success) {
        // キャッシュを更新
        Object.entries(settings).forEach(([key, value]) => {
          this.setCache(key, value)
        })
        return true
      }

      return false

    } catch (error) {
      console.error('複数設定保存エラー:', error)
      return false
    }
  }

  /**
   * 設定を削除
   */
  async deleteSetting(key) {
    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/manage-user-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          action: 'delete',
          userId: this.userId,
          settingKey: key
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`HTTP ${response.status} エラー詳細:`, errorText)
        throw new Error(`HTTP ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      if (result.success) {
        // キャッシュから削除
        this.cache.delete(key)
        return true
      }

      return false

    } catch (error) {
      console.error(`設定削除エラー (${key}):`, error)
      return false
    }
  }

  /**
   * 設定をリセット
   */
  async resetSettings() {
    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/manage-user-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          action: 'reset',
          userId: this.userId
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`HTTP ${response.status} エラー詳細:`, errorText)
        throw new Error(`HTTP ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      if (result.success) {
        // キャッシュをクリア
        this.cache.clear()
        return result.settings
      }

      return {}

    } catch (error) {
      console.error('設定リセットエラー:', error)
      return {}
    }
  }

  /**
   * キャッシュから取得
   */
  getFromCache(key) {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.value
    }
    return null
  }

  /**
   * キャッシュに保存
   */
  setCache(key, value) {
    this.cache.set(key, {
      value: value,
      timestamp: Date.now()
    })
  }

  /**
   * キャッシュをクリア
   */
  clearCache() {
    this.cache.clear()
  }

  /**
   * 設定の同期（localStorageからデータベースへ）
   */
  async syncFromLocalStorage() {
    try {
      const settings = {}
      const keys = [
        'recipe-box-selection-mode',
        'recipe-box-auto-selection-basis',
        'recipe-box-recipe-extraction-api',
        'recipe-box-text-generation-api',
        'recipe-box-image-analysis-api',
        'recipe-box-chat-api'
      ]

      keys.forEach(key => {
        const value = localStorage.getItem(key)
        if (value) {
          const dbKey = key.replace('recipe-box-', '').replace(/-/g, '_')
          settings[dbKey] = value
        }
      })

      if (Object.keys(settings).length > 0) {
        await this.setMultipleSettings(settings)
        return true
      }

      return false

    } catch (error) {
      console.error('設定同期エラー:', error)
      return false
    }
  }

  /**
   * 設定の同期（データベースからlocalStorageへ）
   */
  async syncToLocalStorage() {
    try {
      const settings = await this.getAllSettings()
      
      Object.entries(settings).forEach(([key, value]) => {
        const localStorageKey = `recipe-box-${key.replace(/_/g, '-')}`
        localStorage.setItem(localStorageKey, value)
      })

      return true

    } catch (error) {
      console.error('設定同期エラー:', error)
      return false
    }
  }
}

// グローバルインスタンスを作成
window.settingsDB = new SettingsDatabase()
