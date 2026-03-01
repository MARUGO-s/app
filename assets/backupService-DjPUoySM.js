const n=`import { supabase, SUPABASE_URL } from '../supabase'
import JSZip from 'jszip'

// Edge Function の URL を確実に取得
const getEdgeFunctionUrl = (name) => {
    return \`\${SUPABASE_URL}/functions/v1/\${name}\`
}

export const backupService = {
    /**
     * 自分のバックアップ一覧を取得（一般ユーザー向け）
     */
    async fetchMyBackups() {
        const { data, error } = await supabase
            .from('account_backups')
            .select('id, generation, recipe_count, label, created_at')
            .order('generation', { ascending: true })

        if (error) throw error
        return data || []
    },

    /**
     * 管理者: 全ユーザーのバックアップ一覧を取得
     */
    async adminFetchAllBackups() {
        const { data, error } = await supabase.rpc('admin_list_all_backups')
        if (error) throw error
        return data || []
    },

    /**
     * 管理者: 全ユーザーのバックアップを今すぐ実行（Edge Function呼び出し）
     */
    async adminTriggerBackupAll() {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) throw new Error('ログインが必要です')

        const url = getEdgeFunctionUrl('scheduled-backup')
        console.log('[backupService] Calling Edge Function:', url)

        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${token}\`,
            },
            body: JSON.stringify({}),
        })

        const text = await resp.text()
        console.log('[backupService] Response status:', resp.status, text)

        if (!resp.ok) {
            throw new Error(\`バックアップ実行失敗 (\${resp.status}): \${text}\`)
        }

        try {
            return JSON.parse(text)
        } catch {
            return { ok: true, message: text }
        }
    },

    /**
     * 管理者: 特定ユーザーのバックアップを今すぐ実行
     */
    async adminTriggerBackupForUser(userId) {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) throw new Error('ログインが必要です')

        const url = getEdgeFunctionUrl('scheduled-backup')
        console.log('[backupService] Calling Edge Function for user:', userId, url)

        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${token}\`,
            },
            body: JSON.stringify({ user_id: userId }),
        })

        const text = await resp.text()
        console.log('[backupService] Response status:', resp.status, text)

        if (!resp.ok) {
            throw new Error(\`バックアップ実行失敗 (\${resp.status}): \${text}\`)
        }

        try {
            return JSON.parse(text)
        } catch {
            return { ok: true, message: text }
        }
    },

    /**
     * 管理者: 指定したバックアップのデータ本体（レシピJSON）を取得
     */
    async adminFetchBackupData(backupId) {
        const { data, error } = await supabase
            .from('account_backups')
            .select('id, generation, recipe_count, label, created_at, backup_data, user_id')
            .eq('id', backupId)
            .single()

        if (error) throw error
        return data
    },

    /**
     * バックアップデータをJSONファイルとしてダウンロード
     */
    downloadBackupAsJson(backupData, label, userId) {
        const safeName = String(userId || 'unknown').replace(/[^\\w]/g, '_')
        const safeLabel = String(label || 'data').replace(/[^\\w\\-]/g, '_')
        const date = new Date().toISOString().slice(0, 10)
        const fileName = \`backup_\${safeName}_\${safeLabel}_\${date}.json\`

        const blob = new Blob(
            [JSON.stringify(backupData, null, 2)],
            { type: 'application/json' }
        )
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    },

    /**
     * 各ユーザーのバックアップデータを ZIP ファイル（個別のJSON）としてダウンロード
     * @param {Object} usersDataMap - { 'admin': [...recipes], 'user_id': [...recipes] }
     */
    async downloadAllBackupsAsZip(usersDataMap) {
        if (!usersDataMap || Object.keys(usersDataMap).length === 0) return

        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = \`all_users_backup_\${dateStr}.zip\`

        const zip = new JSZip()

        Object.entries(usersDataMap).forEach(([userName, backupData]) => {
            // ファイル名に使えない文字（/ \\ : * ? " < > |）を置換
            const safeName = userName.replace(/[\\\\/:*?"<>|]/g, '_')
            zip.file(\`backup_\${safeName}.json\`, JSON.stringify(backupData, null, 2))
        })

        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    },
}
`;export{n as default};
