/**
 * Supabase直接クライアント
 * Function呼び出しの代わりに直接データベースアクセス
 */

class SupabaseDirectClient {
  constructor() {
    this.supabaseUrl = window.APP_CONFIG?.SUPABASE_URL
    this.supabaseKey = window.APP_CONFIG?.SUPABASE_ANON_KEY
    this.cache = new Map()
    this.cacheExpiry = 5 * 60 * 1000 // 5分

    // Supabase JSクライアントを初期化（CDNから読み込み）
    this.initSupabaseClient()
  }

  async initSupabaseClient() {
    try {
      // Supabase JSクライアントが利用可能かチェック
      if (typeof supabase !== 'undefined') {
        this.client = supabase.createClient(this.supabaseUrl, this.supabaseKey)
        return true
      } else {
        return false
      }
    } catch (error) {
      console.error('❌ Supabaseクライアント初期化エラー:', error)
      return false
    }
  }

  /**
   * 設定を取得（直接データベースアクセス）
   */
  async getSetting(key, defaultValue = null) {
    try {

      // キャッシュをチェック
      const cached = this.getFromCache(key)
      if (cached !== null) {
        return cached
      }

      if (!this.client) {
        throw new Error('Supabaseクライアントが初期化されていません')
      }

      const { data, error } = await this.client
        .from('user_settings')
        .select('setting_value')
        .eq('user_id', 'default_user')
        .eq('setting_key', key)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw new Error(`DB取得エラー: ${error.message}`)
      }

      const value = data?.setting_value || defaultValue

      // キャッシュに保存
      this.setCache(key, value)
      return value

    } catch (error) {
      console.error(`❌ 直接DB取得エラー (${key}):`, error)

      // フォールバック: localStorageから取得
      const localStorageKey = `recipe-box-${key.replace(/_/g, '-')}`
      const fallbackValue = localStorage.getItem(localStorageKey)

      if (fallbackValue) {
        this.setCache(key, fallbackValue)
        return fallbackValue
      }

      return defaultValue
    }
  }

  /**
   * すべての設定を取得（直接データベースアクセス）
   */
  async getAllSettings() {
    try {

      if (!this.client) {
        throw new Error('Supabaseクライアントが初期化されていません')
      }

      const { data, error } = await this.client
        .from('user_settings')
        .select('setting_key, setting_value')
        .eq('user_id', 'default_user')

      if (error) {
        throw new Error(`DB取得エラー: ${error.message}`)
      }

      const settings = {}
      if (data) {
        data.forEach(row => {
          settings[row.setting_key] = row.setting_value
          this.setCache(row.setting_key, row.setting_value)
        })
      }

      return settings

    } catch (error) {
      console.error('❌ 全設定直接DB取得エラー:', error)

      // フォールバック: localStorageから取得
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
          this.setCache(key, value)
        }
      })

      if (Object.keys(fallbackSettings).length > 0) {
        return fallbackSettings
      }

      return {}
    }
  }

  /**
   * 設定を保存（直接データベースアクセス）
   */
  async setSetting(key, value) {
    try {

      if (!this.client) {
        throw new Error('Supabaseクライアントが初期化されていません')
      }

      const { error } = await this.client
        .from('user_settings')
        .upsert({
          user_id: 'default_user',
          setting_key: key,
          setting_value: String(value)
        })

      if (error) {
        throw new Error(`DB保存エラー: ${error.message}`)
      }

      // キャッシュを更新
      this.setCache(key, value)

      // localStorageにもバックアップ保存
      const localStorageKey = `recipe-box-${key.replace(/_/g, '-')}`
      localStorage.setItem(localStorageKey, String(value))

      return true

    } catch (error) {
      console.error(`❌ 直接DB保存エラー (${key}):`, error)

      // フォールバック: localStorageに保存
      try {
        const localStorageKey = `recipe-box-${key.replace(/_/g, '-')}`
        localStorage.setItem(localStorageKey, String(value))
        this.setCache(key, value)
        return true
      } catch (fallbackError) {
        console.error(`❌ フォールバック保存エラー (${key}):`, fallbackError)
        return false
      }
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
}

// グローバルインスタンスを作成（フォールバック）
window.supabaseDirectClient = new SupabaseDirectClient()

// 既存のsettingsDBを直接クライアントで置き換え
window.settingsDB = window.supabaseDirectClient