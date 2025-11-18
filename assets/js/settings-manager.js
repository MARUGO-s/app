window.Settings = {
    STORAGE_KEY: 'recipe-box-settings',
    defaultSettings: {
        aiApi: 'groq', // 'groq' または 'chatgpt'
        groqModel: 'llama-3.3-70b-versatile', // デフォルトでllama-3.3-70b-versatileを利用（Supabase Edge Functionのデフォルトと一致）
        aiCreativeApi: 'chatgpt' // 'chatgpt' または 'groq'
    },
    
    migrateSettings() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                let needsUpdate = false;
                
                if (parsed.aiApi === 'gemini') {
                    parsed.aiApi = 'groq';
                    needsUpdate = true;
                    console.log('設定をgeminiからgroqに移行しました');
                }
                if (parsed.aiApi === 'chatgpt') {
                    parsed.aiApi = 'groq';
                    needsUpdate = true;
                    console.log('設定をchatgptからgroqに移行しました');
                }
                
                const validModels = ['llama-3.1-8b-instant', 'llama-3.1-70b-8192', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'meta-llama/llama-4-scout-17b-16e-instruct'];
                // 古いデフォルトモデル（llama-3.1-8b-instant）が保存されている場合は新しいデフォルトに更新
                if (parsed.groqModel === 'llama-3.1-8b-instant' && !parsed.groqModelManuallySet) {
                    parsed.groqModel = this.defaultSettings.groqModel;
                    needsUpdate = true;
                    console.log('Groqモデルを古いデフォルト（llama-3.1-8b-instant）から新しいデフォルト（llama-3.3-70b-versatile）に更新しました');
                } else if (!parsed.groqModel || !validModels.includes(parsed.groqModel)) {
                    parsed.groqModel = this.defaultSettings.groqModel;
                    needsUpdate = true;
                    console.log('Groqモデル設定をデフォルト値に設定しました');
                }
                
                if (!parsed.aiCreativeApi) {
                    parsed.aiCreativeApi = this.defaultSettings.aiCreativeApi;
                    needsUpdate = true;
                    console.log('AI創作API設定をデフォルト値に設定しました');
                }
                
                if (needsUpdate) {
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));
                }
            } else {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.defaultSettings));
                console.log('デフォルト設定（groq）を設定しました');
            }
        } catch (error) {
            console.error('設定移行エラー:', error);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.defaultSettings));
            console.log('エラーによりデフォルト設定（groq）を強制適用しました');
        }
    },
    
    get() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            const result = stored ? { ...this.defaultSettings, ...JSON.parse(stored) } : this.defaultSettings;
            console.log('📊 現在の設定を読み込み:', result);
            return result;
        } catch (error) {
            console.error('設定の読み込みエラー:', error);
            return this.defaultSettings;
        }
    },
    
    set(settings) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
            console.log('✅ 設定を保存しました:', settings);
        } catch (error) {
            console.error('❌ 設定の保存エラー:', error);
        }
    },
    
    getCurrentAiApi() {
        return this.get().aiApi;
    }
};