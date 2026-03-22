import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
        }

        // サービスロールキーでクライアントを作成（RLSをバイパス）
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // リクエストボディ: { user_id?: string } が指定されれば特定ユーザーのみ、なければ全ユーザー
        let targetUserId: string | null = null
        if (req.method === 'POST') {
            try {
                const body = await req.json()
                targetUserId = body?.user_id || null
            } catch {
                // body が空の場合は全ユーザー対象
            }
        }

        console.log('[scheduled-backup] targetUserId:', targetUserId)

        // バックアップ対象ユーザーを取得 (id だけではなく display_id も取得する)
        let users: { id: string; display_id: string | null }[] = []

        if (targetUserId) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, display_id')
                .eq('id', targetUserId)
                .single()
            if (profile) {
                users = [profile]
            } else {
                users = [{ id: targetUserId, display_id: null }]
            }
        } else {
            // 全プロフィールのユーザーIDとdisplayIdを取得
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, display_id')

            if (profilesError) {
                console.error('[scheduled-backup] profiles fetch error:', profilesError)
                throw profilesError
            }
            users = profiles || []
            console.log('[scheduled-backup] total users:', users.length)
        }

        if (users.length === 0) {
            return new Response(
                JSON.stringify({ ok: true, message: 'バックアップ対象ユーザーなし', results: [] }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        }

        // 全レシピを1回だけ取得（service_roleなのでRLSバイパス）
        const { data: allRecipes, error: recipesError } = await supabase
            .from('recipes')
            .select('*')
            .order('created_at', { ascending: false })

        if (recipesError) {
            console.error('[scheduled-backup] recipes fetch error:', recipesError)
            throw recipesError
        }
        console.log('[scheduled-backup] total recipes fetched:', allRecipes?.length ?? 0)

        // recipe_sources も一括取得
        const allRecipeIds = (allRecipes || []).map((r: { id: string }) => r.id)
        let globalSourceMap: Record<string, string[]> = {}

        if (allRecipeIds.length > 0) {
            const { data: sources, error: srcError } = await supabase
                .from('recipe_sources')
                .select('recipe_id, url')
                .in('recipe_id', allRecipeIds)

            if (srcError) {
                console.warn('[scheduled-backup] recipe_sources fetch warning:', srcError)
            } else if (sources) {
                for (const s of sources) {
                    if (!globalSourceMap[s.recipe_id]) globalSourceMap[s.recipe_id] = []
                    globalSourceMap[s.recipe_id].push(s.url)
                }
            }
        }

        // 各ユーザーのレシピをフィルタしてバックアップ
        const results: { userId: string; success: boolean; recipeCount: number; error?: string }[] = []
        const label = targetUserId ? '手動バックアップ' : '自動バックアップ（定期）'

        for (const user of users) {
            try {
                // このユーザーが owner のレシピをフィルタ
                // フロントエンドの実装に合わせて UUID と displayId の両方をチェックする
                const ownerTagId = `owner:${user.id}`
                const ownerTagDisplay = user.display_id ? `owner:${user.display_id}` : null

                const userRecipes = (allRecipes || []).filter((r: { tags: unknown }) => {
                    let tags: string[] = []
                    if (Array.isArray(r.tags)) {
                        tags = r.tags.map(String)
                    } else if (typeof r.tags === 'string') {
                        // Postgres text[] 形式 "{tag1,tag2}" のパース
                        const raw = String(r.tags).trim()
                        if (raw.startsWith('{') && raw.endsWith('}')) {
                            tags = raw.slice(1, -1).split(',').map(t => t.trim().replace(/^"(.*)"$/, '$1'))
                        }
                    }
                    return tags.includes(ownerTagId) || (ownerTagDisplay && tags.includes(ownerTagDisplay))
                })

                console.log(`[scheduled-backup] user ${user.id} (${user.display_id}): ${userRecipes.length} recipes`)

                const backupData = userRecipes.map((r: { id: string }) => ({
                    ...r,
                    _sources: globalSourceMap[r.id] || [],
                }))

                // バックアップ保存（RPC呼び出し）
                const { error: saveError } = await supabase.rpc('admin_save_backup', {
                    p_user_id: user.id,
                    p_backup_data: backupData,
                    p_recipe_count: backupData.length,
                    p_label: label,
                })

                if (saveError) {
                    console.error(`[scheduled-backup] save error for user ${user.id}:`, saveError)
                    throw saveError
                }

                results.push({ userId: user.id, success: true, recipeCount: backupData.length })
            } catch (err) {
                console.error(`[scheduled-backup] Backup failed for user ${user.id}:`, err)
                results.push({ userId: user.id, success: false, recipeCount: 0, error: String(err) })
            }
        }

        const successCount = results.filter(r => r.success).length
        const failCount = results.filter(r => !r.success).length

        console.log(`[scheduled-backup] Done: ${successCount} success, ${failCount} fail`)

        return new Response(
            JSON.stringify({
                ok: true,
                message: `バックアップ完了: ${successCount}件成功, ${failCount}件失敗`,
                results,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (err) {
        console.error('[scheduled-backup] Fatal error:', err)
        return new Response(
            JSON.stringify({ ok: false, error: String(err) }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            }
        )
    }
})
