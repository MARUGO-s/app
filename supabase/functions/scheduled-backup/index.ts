import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAuthToken, verifySupabaseJWT } from '../_shared/jwt.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // JWT検証
    const token = getAuthToken(req)
    if (!token) {
        return new Response(JSON.stringify({ ok: false, error: '認証が必要です。再ログインしてください。' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
    let jwtPayload: Record<string, unknown>
    try {
        jwtPayload = await verifySupabaseJWT(token) as Record<string, unknown>
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'トークンが無効または期限切れです。再ログインしてください。' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
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

        // 管理者ロールチェック
        const callerId = String(jwtPayload.sub || '')
        if (!callerId) {
            return new Response(JSON.stringify({ ok: false, error: '認証情報が不正です。' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }
        const { data: callerProfile, error: profileErr } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', callerId)
            .single()
        if (profileErr || callerProfile?.role !== 'admin') {
            return new Response(JSON.stringify({ ok: false, error: '管理者権限が必要です。' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

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

        // バックアップ対象ユーザーを取得
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

        // ユーザーごとにレシピをDBでフィルタして取得する。
        // 以前は全レシピを一括取得してメモリ上でフィルタしていたが、
        // レシピ数が多い場合にEdge Functionのメモリ上限を超える恐れがあるため、
        // ユーザーごとのクエリに変更。
        const results: { userId: string; success: boolean; recipeCount: number; error?: string }[] = []
        const label = targetUserId ? '手動バックアップ' : '自動バックアップ（定期）'

        for (const user of users) {
            try {
                // owner タグのパターン（UUID と displayId の両方）
                const ownerTags: string[] = [`owner:${user.id}`]
                if (user.display_id) ownerTags.push(`owner:${user.display_id}`)

                // DBレベルでこのユーザーのレシピだけを取得（配列の重複チェック）
                const { data: userRecipes, error: recipesError } = await supabase
                    .from('recipes')
                    .select('*')
                    .overlaps('tags', ownerTags)
                    .order('created_at', { ascending: false })

                if (recipesError) {
                    console.error(`[scheduled-backup] recipes fetch error for user ${user.id}:`, recipesError)
                    throw recipesError
                }

                console.log(`[scheduled-backup] user ${user.id} (${user.display_id}): ${userRecipes?.length ?? 0} recipes`)

                // このユーザーのレシピに紐づく recipe_sources を取得
                const recipeIds = (userRecipes || []).map((r: { id: string }) => r.id)
                let sourceMap: Record<string, string[]> = {}

                if (recipeIds.length > 0) {
                    const { data: sources, error: srcError } = await supabase
                        .from('recipe_sources')
                        .select('recipe_id, url')
                        .in('recipe_id', recipeIds)

                    if (srcError) {
                        console.warn(`[scheduled-backup] recipe_sources fetch warning for user ${user.id}:`, srcError)
                    } else if (sources) {
                        for (const s of sources) {
                            if (!sourceMap[s.recipe_id]) sourceMap[s.recipe_id] = []
                            sourceMap[s.recipe_id].push(s.url)
                        }
                    }
                }

                const backupData = (userRecipes || []).map((r: { id: string }) => ({
                    ...r,
                    _sources: sourceMap[r.id] || [],
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
