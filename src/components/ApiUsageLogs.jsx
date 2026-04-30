import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { userService } from '../services/userService'
import './ApiUsageLogs.css'

const toSafeNumber = (value, fallback = 0) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

const formatCostJpy = (value, digits = 3) => {
    const n = toSafeNumber(value, 0)
    return n.toLocaleString('ja-JP', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })
}

const hasPositiveCost = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0
}

const calcTokenCost = (tokens, ratePer1M) => {
    const safeTokens = Number.isFinite(Number(tokens)) ? Math.max(0, Number(tokens)) : 0
    const safeRate = Number.isFinite(Number(ratePer1M)) ? Math.max(0, Number(ratePer1M)) : 0
    return (safeTokens / 1_000_000) * safeRate
}

const GEMINI_RATES_JPY_PER_1M = {
    'gemini-3.1-flash-lite': { input: 37.5, output: 225 },
    'gemini-3-flash': { input: 75, output: 450 },
    'gemini-1.5-flash': { input: 5, output: 15 },
    'gemini-2.5-flash-lite': { input: 2, output: 6 },
    'gemini-2.0-flash': { input: 10, output: 30 },
    'gemini-2.5-pro': { input: 150, output: 400 },
    'gemini-pro': { input: 75, output: 200 },
}

const GROQ_RATES_JPY_PER_1M = {
    'meta-llama/llama-4-scout-17b-16e-instruct': { input: 16.5, output: 51 },
    'llama-3.3-70b-versatile': { input: 16.5, output: 51 },
    'default': { input: 16.5, output: 51 },
}

const normalizeGeminiModelNameForCost = (modelName) => {
    const normalized = String(modelName || '').trim().toLowerCase()
    if (!normalized) return 'gemini-1.5-flash'
    if (normalized.includes('3.1-flash-lite')) return 'gemini-3.1-flash-lite'
    if (normalized.includes('1.5-flash')) return 'gemini-1.5-flash'
    if (normalized.includes('flash-lite')) return 'gemini-2.5-flash-lite'
    if (normalized.includes('2.5-pro') || normalized.includes('pro')) return 'gemini-2.5-pro'
    if (normalized.includes('2.0-flash')) return 'gemini-2.0-flash'
    if (normalized.includes('1.5-flash') || normalized.includes('flash')) return 'gemini-1.5-flash'
    return 'gemini-1.5-flash'
}

const buildGeminiBillingBreakdown = ({ modelName, inputTokens, outputTokens, estimatedCostJpy = null }) => {
    const inTok = Math.max(0, toSafeNumber(inputTokens, 0))
    const outTok = Math.max(0, toSafeNumber(outputTokens, 0))
    if (inTok === 0 && outTok === 0) return null

    const normalizedModel = normalizeGeminiModelNameForCost(modelName)
    const rate = GEMINI_RATES_JPY_PER_1M[normalizedModel] || GEMINI_RATES_JPY_PER_1M['gemini-2.5-flash-lite']
    const inputCostRaw = (inTok / 1_000_000) * rate.input
    const outputCostRaw = (outTok / 1_000_000) * rate.output
    const totalRaw = inputCostRaw + outputCostRaw
    const totalCost = hasPositiveCost(estimatedCostJpy)
        ? toSafeNumber(estimatedCostJpy, totalRaw)
        : totalRaw

    return {
        model: normalizedModel,
        inputTokens: inTok,
        outputTokens: outTok,
        inputCostJpy: Math.round(inputCostRaw * 10000) / 10000,
        outputCostJpy: Math.round(outputCostRaw * 10000) / 10000,
        totalCostJpy: totalCost,
        inputRatePer1M: rate.input,
        outputRatePer1M: rate.output,
    }
}

const normalizeGroqModelNameForCost = (modelName) => {
    const normalized = String(modelName || '').trim().toLowerCase()
    if (!normalized) return 'default'
    if (normalized.includes('llama-4-scout-17b-16e-instruct')) return 'meta-llama/llama-4-scout-17b-16e-instruct'
    if (normalized.includes('llama-3.3-70b-versatile')) return 'llama-3.3-70b-versatile'
    return 'default'
}

const buildGroqBillingBreakdown = ({ modelName, inputTokens, outputTokens, estimatedCostJpy = null }) => {
    const inTok = Math.max(0, toSafeNumber(inputTokens, 0))
    const outTok = Math.max(0, toSafeNumber(outputTokens, 0))
    if (inTok === 0 && outTok === 0) return null

    const normalizedModel = normalizeGroqModelNameForCost(modelName)
    const rate = GROQ_RATES_JPY_PER_1M[normalizedModel] || GROQ_RATES_JPY_PER_1M.default
    const inputCostRaw = (inTok / 1_000_000) * rate.input
    const outputCostRaw = (outTok / 1_000_000) * rate.output
    const totalRaw = inputCostRaw + outputCostRaw
    const totalCost = hasPositiveCost(estimatedCostJpy)
        ? toSafeNumber(estimatedCostJpy, totalRaw)
        : totalRaw

    return {
        model: normalizedModel,
        inputTokens: inTok,
        outputTokens: outTok,
        inputCostJpy: Math.round(inputCostRaw * 10000) / 10000,
        outputCostJpy: Math.round(outputCostRaw * 10000) / 10000,
        totalCostJpy: totalCost,
        inputRatePer1M: rate.input,
        outputRatePer1M: rate.output,
    }
}

const buildGroqVoiceBillingBreakdown = ({ modelName, audioDurationSec, estimatedCostJpy = null }) => {
    const sec = Math.max(0, toSafeNumber(audioDurationSec, 0))
    if (sec === 0) return null
    const ratePerSecondJpy = 0.0046
    const rawCost = sec * ratePerSecondJpy
    const totalCost = hasPositiveCost(estimatedCostJpy)
        ? toSafeNumber(estimatedCostJpy, rawCost)
        : rawCost
    return {
        model: String(modelName || 'whisper-large-v3-turbo'),
        billingUnit: 'audio_second',
        audioDurationSec: sec,
        ratePerSecondJpy,
        totalCostJpy: totalCost,
    }
}

const isVoiceLog = (log) => {
    const modelName = String(log?.model_name || '').toLowerCase()
    const endpoint = String(log?.endpoint || '').toLowerCase()
    const hasAudioMeta = log?.metadata && log.metadata.audio_duration_sec !== undefined
    const isWhisper = modelName.includes('whisper')
    const isVoiceEndpoint = endpoint.includes('voice')
    return isWhisper || isVoiceEndpoint || hasAudioMeta
}

const isVisionLog = (log) => {
    const endpoint = String(log?.endpoint || '').toLowerCase()
    return endpoint.includes('analyze-image')
}

const isOperationQaLog = (log) => {
    const endpoint = String(log?.endpoint || '').toLowerCase()
    const feature = String(log?.metadata?.feature || '').toLowerCase()
    const source = String(log?.metadata?.source || '').toLowerCase()
    return endpoint === 'call-gemini-api'
        && (feature === 'operation_qa' || source === 'operation_assistant')
}

const getBillingBreakdown = (log) => {
    const metadata = log?.metadata
    if (metadata && typeof metadata === 'object') {
        const breakdown = metadata.billing_breakdown
        if (breakdown && typeof breakdown === 'object') {
            const billingUnit = String(breakdown.billing_unit || '').toLowerCase()
            if (billingUnit === 'audio_second') {
                const audioDurationSec = toSafeNumber(
                    breakdown.audio_duration_sec,
                    toSafeNumber(log?.metadata?.audio_duration_sec, 0),
                )
                const ratePerSecondJpy = toSafeNumber(breakdown.rate_per_second_jpy, 0.0046)
                const totalCostRaw = audioDurationSec * ratePerSecondJpy
                const totalCost = hasPositiveCost(breakdown.total_cost_jpy)
                    ? toSafeNumber(breakdown.total_cost_jpy, totalCostRaw)
                    : (hasPositiveCost(log?.estimated_cost_jpy)
                        ? toSafeNumber(log?.estimated_cost_jpy, totalCostRaw)
                        : totalCostRaw)
                return {
                    model: String(breakdown.model || log?.model_name || 'whisper-large-v3-turbo'),
                    billingUnit: 'audio_second',
                    audioDurationSec,
                    ratePerSecondJpy,
                    totalCostJpy: totalCost,
                }
            }

            const model = String(breakdown.model || log?.model_name || '')
            const isGroq = String(log?.api_name || '').toLowerCase() === 'groq'
            const fallbackRate = isGroq
                ? (GROQ_RATES_JPY_PER_1M[normalizeGroqModelNameForCost(model)] || GROQ_RATES_JPY_PER_1M.default)
                : (GEMINI_RATES_JPY_PER_1M[normalizeGeminiModelNameForCost(model)] || GEMINI_RATES_JPY_PER_1M['gemini-2.5-flash-lite'])
            const inputTokens = toSafeNumber(breakdown.input_tokens, toSafeNumber(log?.input_tokens, 0))
            const outputTokens = toSafeNumber(breakdown.output_tokens, toSafeNumber(log?.output_tokens, 0))
            const inputRatePer1M = toSafeNumber(breakdown.rate_per_1m_jpy?.input, fallbackRate.input)
            const outputRatePer1M = toSafeNumber(breakdown.rate_per_1m_jpy?.output, fallbackRate.output)
            const recomputedInputCost = calcTokenCost(inputTokens, inputRatePer1M)
            const recomputedOutputCost = calcTokenCost(outputTokens, outputRatePer1M)
            const inputCost = hasPositiveCost(breakdown.input_cost_jpy)
                ? toSafeNumber(breakdown.input_cost_jpy, recomputedInputCost)
                : recomputedInputCost
            const outputCost = hasPositiveCost(breakdown.output_cost_jpy)
                ? toSafeNumber(breakdown.output_cost_jpy, recomputedOutputCost)
                : recomputedOutputCost
            const recomputedTotalCost = inputCost + outputCost
            const totalCost = hasPositiveCost(breakdown.total_cost_jpy)
                ? toSafeNumber(breakdown.total_cost_jpy, recomputedTotalCost)
                : (hasPositiveCost(log?.estimated_cost_jpy)
                    ? toSafeNumber(log?.estimated_cost_jpy, recomputedTotalCost)
                    : recomputedTotalCost)
            return {
                model,
                inputTokens,
                outputTokens,
                inputCostJpy: inputCost,
                outputCostJpy: outputCost,
                totalCostJpy: totalCost,
                inputRatePer1M,
                outputRatePer1M,
            }
        }
    }

    if (String(log?.api_name || '').toLowerCase() === 'gemini') {
        return buildGeminiBillingBreakdown({
            modelName: log?.model_name,
            inputTokens: log?.input_tokens,
            outputTokens: log?.output_tokens,
            estimatedCostJpy: log?.estimated_cost_jpy,
        })
    }
    if (String(log?.api_name || '').toLowerCase() === 'groq') {
        const isVoice = isVoiceLog(log) || String(log?.endpoint || '').toLowerCase().includes('voice')
        if (isVoice) {
            return buildGroqVoiceBillingBreakdown({
                modelName: log?.model_name,
                audioDurationSec: log?.metadata?.audio_duration_sec,
                estimatedCostJpy: log?.estimated_cost_jpy,
            })
        }
        return buildGroqBillingBreakdown({
            modelName: log?.model_name,
            inputTokens: log?.input_tokens,
            outputTokens: log?.output_tokens,
            estimatedCostJpy: log?.estimated_cost_jpy,
        })
    }
    return null
}

const formatBillingBreakdownText = (log) => {
    const b = getBillingBreakdown(log)
    if (!b) return '-'
    if (b.billingUnit === 'audio_second') {
        return `音声${Number(b.audioDurationSec || 0).toFixed(2)}秒 × ¥${formatCostJpy(b.ratePerSecondJpy, 4)}/秒 = ¥${formatCostJpy(b.totalCostJpy)}`
    }
    return `入力${b.inputTokens.toLocaleString()}tok × ¥${b.inputRatePer1M}/100万 + 出力${b.outputTokens.toLocaleString()}tok × ¥${b.outputRatePer1M}/100万 = ¥${formatCostJpy(b.totalCostJpy)}`
}

const resolveEstimatedCostJpy = (log, precomputedBilling = null) => {
    if (hasPositiveCost(log?.estimated_cost_jpy)) {
        return toSafeNumber(log?.estimated_cost_jpy, 0)
    }
    const billing = precomputedBilling || getBillingBreakdown(log)
    if (billing && Number.isFinite(Number(billing.totalCostJpy))) {
        return Math.max(0, Number(billing.totalCostJpy))
    }
    return 0
}

export default function ApiUsageLogs() {
    const [logs, setLogs] = useState([])
    const [operationQaLogs, setOperationQaLogs] = useState([])
    const [userMap, setUserMap] = useState({})
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('all') // 'all', 'voice', 'vision', 'operation'

    // API名フィルタは使わず、全件取得後にクライアントサイドでタブフィルタを行う
    const [filter, setFilter] = useState({
        // apiName: 'all', // Removed
        status: 'all',
        dateFrom: '',
        dateTo: ''
    })

    const [stats, setStats] = useState({
        totalCalls: 0,
        successRate: 0,
        totalCost: 0,
        totalAudioSec: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalInputCost: 0,
        totalOutputCost: 0,
        byApi: {}
    })

    const tabs = [
        { id: 'all', label: 'すべて' },
        { id: 'voice', label: '音声入力' },
        { id: 'vision', label: '画像解析' },
        { id: 'operation', label: '操作質問AI' },
    ]

    // ログ取得処理
    useEffect(() => {
        fetchLogs()
    }, [filter]) // activeTabが変わってもfetchし直さない（クライアントフィルタするから）

    // クライアントサイドフィルタリング
    const mergedLogs = useMemo(() => {
        const apiLogs = Array.isArray(logs) ? logs : []
        const opqaRows = Array.isArray(operationQaLogs) ? operationQaLogs : []
        if (opqaRows.length === 0) return apiLogs

        const operationApiFingerprints = new Set(
            apiLogs
                .filter((log) => isOperationQaLog(log))
                .map((log) => {
                    const bucket = Math.floor(new Date(log.created_at || 0).getTime() / 10000)
                    const model = normalizeGeminiModelNameForCost(log.model_name)
                    return [
                        log.user_id || '',
                        model,
                        toSafeNumber(log.input_tokens, 0),
                        toSafeNumber(log.output_tokens, 0),
                        bucket,
                    ].join('|')
                })
        )

        const opqaAsApiLogs = opqaRows
            .filter((row) => row?.ai_attempted === true)
            .map((row) => {
                const aiError = String(row?.metadata?.ai_error || '')
                const aiStatus = String(row?.ai_status || '').toLowerCase()
                let status = 'success'
                if (aiStatus.includes('error_fallback')) {
                    status = aiError.includes('429') ? 'rate_limited' : 'error'
                } else if (!row?.ai_used && aiError) {
                    status = aiError.includes('429') ? 'rate_limited' : 'error'
                }
                const billing = buildGeminiBillingBreakdown({
                    modelName: row?.ai_model || 'gemini-2.5-flash-lite',
                    inputTokens: row?.input_tokens,
                    outputTokens: row?.output_tokens,
                    estimatedCostJpy: row?.estimated_cost_jpy,
                })
                const resolvedEstimatedCost = hasPositiveCost(row?.estimated_cost_jpy)
                    ? toSafeNumber(row?.estimated_cost_jpy, 0)
                    : (billing ? Math.max(0, Number(billing.totalCostJpy)) : null)
                return {
                    id: `opqa_${row.id}`,
                    created_at: row.created_at,
                    api_name: 'gemini',
                    endpoint: 'call-gemini-api',
                    model_name: row.ai_model || 'gemini-2.5-flash-lite',
                    user_id: row.user_id || null,
                    user_email: row.user_email || null,
                    status,
                    error_message: status === 'success'
                        ? ''
                        : (aiError || 'AI呼び出し後にローカル回答へフォールバック'),
                    duration_ms: null,
                    input_tokens: row.input_tokens ?? null,
                    output_tokens: row.output_tokens ?? null,
                    estimated_cost_jpy: resolvedEstimatedCost,
                    metadata: {
                        ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
                        source: 'operation_assistant',
                        feature: 'operation_qa',
                        source_table: 'operation_qa_logs',
                        billing_breakdown: billing
                            ? {
                                model: billing.model,
                                rate_per_1m_jpy: {
                                    input: billing.inputRatePer1M,
                                    output: billing.outputRatePer1M,
                                },
                                input_tokens: billing.inputTokens,
                                output_tokens: billing.outputTokens,
                                input_cost_jpy: billing.inputCostJpy,
                                output_cost_jpy: billing.outputCostJpy,
                                total_cost_jpy: billing.totalCostJpy,
                            }
                            : null,
                    },
                }
            })
            .filter((log) => {
                const bucket = Math.floor(new Date(log.created_at || 0).getTime() / 10000)
                const model = normalizeGeminiModelNameForCost(log.model_name)
                const fingerprint = [
                    log.user_id || '',
                    model,
                    toSafeNumber(log.input_tokens, 0),
                    toSafeNumber(log.output_tokens, 0),
                    bucket,
                ].join('|')
                return !operationApiFingerprints.has(fingerprint)
            })

        return [...opqaAsApiLogs, ...apiLogs].sort(
            (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        )
    }, [logs, operationQaLogs])

    const displayedLogs = useMemo(() => {
        const tabFiltered = mergedLogs.filter(log => {
            if (activeTab === 'all') return true

            if (activeTab === 'voice') {
                return isVoiceLog(log)
            }

            if (activeTab === 'vision') {
                return isVisionLog(log)
            }

            if (activeTab === 'operation') {
                return isOperationQaLog(log)
            }

            return true
        })
        if (filter.status === 'all') return tabFiltered
        return tabFiltered.filter((log) => String(log?.status || '') === String(filter.status))
    }, [mergedLogs, activeTab, filter.status])

    // 統計再計算
    useEffect(() => {
        calculateStats(displayedLogs)
    }, [displayedLogs])


    async function fetchLogs() {
        setLoading(true)
        try {
            let query = supabase
                .from('api_usage_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500)

            // API名フィルタは除外（タブフィルタに任せるため）
            if (filter.dateFrom) {
                query = query.gte('created_at', filter.dateFrom)
            }
            if (filter.dateTo) {
                query = query.lte('created_at', filter.dateTo + 'T23:59:59')
            }

            const { data, error } = await query

            if (error) throw error

            setLogs(data || [])

            let opQuery = supabase
                .from('operation_qa_logs')
                .select('id, created_at, user_id, user_email, ai_used, ai_attempted, ai_model, ai_status, input_tokens, output_tokens, estimated_cost_jpy, metadata')
                .eq('ai_attempted', true)
                .order('created_at', { ascending: false })
                .limit(500)

            if (filter.dateFrom) {
                opQuery = opQuery.gte('created_at', filter.dateFrom)
            }
            if (filter.dateTo) {
                opQuery = opQuery.lte('created_at', filter.dateTo + 'T23:59:59')
            }

            const { data: opData, error: opError } = await opQuery
            if (opError) {
                console.warn('operation_qa_logs 取得エラー（APIログ表示には継続）:', opError)
                setOperationQaLogs([])
            } else {
                setOperationQaLogs(opData || [])
            }
            fetchUserInfos()
        } catch (error) {
            console.error('ログ取得エラー:', error)
            alert('ログの取得に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    async function fetchUserInfos() {
        try {
            const profiles = await userService.fetchAllProfiles()
            const map = {}
            if (Array.isArray(profiles)) {
                profiles.forEach(p => {
                    if (p.id) map[p.id] = p
                })
            }
            setUserMap(map)
        } catch (e) {
            console.error('Failed to fetch user profiles for logs', e)
        }
    }

    function calculateStats(logsData) {
        const totalCalls = logsData.length
        const successCalls = logsData.filter(log => log.status === 'success').length
        const totalCost = logsData.reduce((sum, log) => sum + resolveEstimatedCostJpy(log), 0)

        // 音声秒数は、表示されているログの中の音声ログのみ集計
        // (Visionタブを選択中に音声秒数が出るのはおかしいので、logsDataから計算)
        const totalAudioSec = logsData
            .filter(l => l.metadata?.audio_duration_sec)
            .reduce((sum, log) => sum + toSafeNumber(log.metadata.audio_duration_sec, 0), 0)

        const totalInputTokens = logsData.reduce((sum, log) => sum + toSafeNumber(log.input_tokens, 0), 0)
        const totalOutputTokens = logsData.reduce((sum, log) => sum + toSafeNumber(log.output_tokens, 0), 0)
        const totalInputCost = logsData.reduce((sum, log) => {
            const breakdown = getBillingBreakdown(log)
            return sum + (breakdown ? toSafeNumber(breakdown.inputCostJpy, 0) : 0)
        }, 0)
        const totalOutputCost = logsData.reduce((sum, log) => {
            const breakdown = getBillingBreakdown(log)
            return sum + (breakdown ? toSafeNumber(breakdown.outputCostJpy, 0) : 0)
        }, 0)

        setStats({
            totalCalls,
            successRate: totalCalls > 0 ? (successCalls / totalCalls * 100).toFixed(1) : 0,
            totalCost: Number(totalCost.toFixed(6)),
            totalAudioSec: totalAudioSec.toFixed(1),
            totalInputTokens,
            totalOutputTokens,
            totalInputCost: Number(totalInputCost.toFixed(6)),
            totalOutputCost: Number(totalOutputCost.toFixed(6)),
            byApi: {}
        })
    }

    function formatDate(dateString) {
        const date = new Date(dateString)
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    }

    function getStatusBadge(status) {
        const badges = {
            success: '✅ 成功',
            error: '❌ エラー',
            rate_limited: '⚠️ 制限'
        }
        return badges[status] || status
    }

    async function exportToCsv() {
        const csvRows = [
            ['作成日時', 'API名', 'エンドポイント', 'モデル', 'ユーザーID', 'ステータス', '処理時間(ms)', '詳細(秒数/トークン)', '入力トークン', '出力トークン', '推定コスト(円)', '従量課金内訳', 'エラーメッセージ'].join(',')
        ]

        // CSVエクスポートは「現在表示されているログ」を対象にするのが自然
        displayedLogs.forEach(log => {
            let details = ''
            if (log.metadata?.audio_duration_sec) {
                details = `${log.metadata.audio_duration_sec}s`
            } else if (log.input_tokens || log.output_tokens) {
                details = `${log.input_tokens}↓ ${log.output_tokens}↑`
            }
            const breakdownText = formatBillingBreakdownText(log)

            csvRows.push([
                formatDate(log.created_at),
                log.api_name,
                log.endpoint,
                log.model_name || '',
                log.user_id || '',
                log.status,
                log.duration_ms || '',
                details,
                log.input_tokens || '',
                log.output_tokens || '',
                resolveEstimatedCostJpy(log),
                breakdownText.replace(/,/g, '、'),
                (log.error_message || '').replace(/,/g, '、')
            ].join(','))
        })

        const csvContent = csvRows.join('\n')
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `api_usage_logs_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`
        link.click()
    }

    return (
        <div className="api-usage-logs">
            <div className="logs-header">
                <h1>📊 API使用ログ</h1>
                <button onClick={exportToCsv} className="export-btn">
                    📥 CSVエクスポート
                </button>
            </div>

            {/* API Tabs */}
            <div className="logs-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`log-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 統計情報 (Dynamic based on Tab) */}
            <div className="stats-grid">
                {activeTab === 'voice' ? (
                    <>
                        <div className="stat-card">
                            <div className="stat-label">総音声入力時間</div>
                            <div className="stat-value">{stats.totalAudioSec}秒</div>
                            <div className="secondary-stat">{(stats.totalAudioSec / 60).toFixed(1)}分</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">推定コスト</div>
                            <div className="stat-value">¥{formatCostJpy(stats.totalCost)}</div>
                            <div className="secondary-stat">Whisper large-v3 turbo</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">成功率</div>
                            <div className="stat-value">{stats.successRate}%</div>
                            <div className="secondary-stat">{stats.totalCalls}回中</div>
                        </div>
                    </>
                ) : activeTab === 'vision' ? (
                    <>
                        <div className="stat-card">
                            <div className="stat-label">総解析回数</div>
                            <div className="stat-value">{stats.totalCalls}回</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">推定コスト</div>
                            <div className="stat-value">¥{formatCostJpy(stats.totalCost)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">成功率</div>
                            <div className="stat-value">{stats.successRate}%</div>
                        </div>
                    </>
                ) : activeTab === 'operation' ? (
                    <>
                        <div className="stat-card">
                            <div className="stat-label">操作質問APIコール</div>
                            <div className="stat-value">{stats.totalCalls.toLocaleString()}回</div>
                            <div className="secondary-stat">{stats.successRate}% 成功</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">総トークン量</div>
                            <div className="stat-value">↓{stats.totalInputTokens.toLocaleString()} / ↑{stats.totalOutputTokens.toLocaleString()}</div>
                            <div className="secondary-stat">入力 / 出力</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">推定コスト（従量）</div>
                            <div className="stat-value">¥{formatCostJpy(stats.totalCost)}</div>
                            <div className="secondary-stat">入力 ¥{formatCostJpy(stats.totalInputCost)} / 出力 ¥{formatCostJpy(stats.totalOutputCost)}</div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* All */}
                        <div className="stat-card">
                            <div className="stat-label">総コール数</div>
                            <div className="stat-value">{stats.totalCalls.toLocaleString()}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">成功率</div>
                            <div className="stat-value">{stats.successRate}%</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">推定総コスト</div>
                            <div className="stat-value">¥{formatCostJpy(stats.totalCost)}</div>
                        </div>
                    </>
                )}
            </div>

            {/* フィルター */}
            <div className="filters">
                <select
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                >
                    <option value="all">すべてのステータス</option>
                    <option value="success">成功</option>
                    <option value="error">エラー</option>
                    <option value="rate_limited">レート制限</option>
                </select>

                <input
                    type="date"
                    value={filter.dateFrom}
                    onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
                    placeholder="開始日"
                />

                <input
                    type="date"
                    value={filter.dateTo}
                    onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
                    placeholder="終了日"
                />

                <button onClick={fetchLogs} className="refresh-btn">
                    🔄 更新
                </button>
            </div>

            {/* ログテーブル */}
            {loading ? (
                <div className="loading">読み込み中...</div>
            ) : (
                <div className="logs-table-container">
                    <table className="logs-table">
                        <thead>
                            <tr>
                                <th>日時</th>
                                <th>API</th>
                                <th>エンドポイント</th>
                                <th>モデル</th>
                                <th>ユーザー</th>
                                <th>ステータス</th>
                                <th>処理時間</th>
                                <th>詳細 (秒数/トークン)</th>
                                <th>推定コスト</th>
                                <th>従量課金内訳</th>
                                <th>エラー</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedLogs.map((log) => (
                                <tr key={log.id} className={`status-${log.status}`}>
                                    <td>{formatDate(log.created_at)}</td>
                                    <td><span className={`api-badge api-${log.api_name}`}>{log.api_name}</span></td>
                                    <td>{log.endpoint}</td>
                                    <td><code>{log.model_name || '-'}</code></td>
                                    <td>
                                        {log.user_email ||
                                            (userMap[log.user_id]?.email) ||
                                            (userMap[log.user_id]?.display_id) ||
                                            (log.user_id ? log.user_id.substring(0, 8) : '-')}
                                    </td>
                                    <td>{getStatusBadge(log.status)}</td>
                                    <td>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</td>
                                    <td>
                                        {/* 詳細カラム：音声なら秒数、テキストならトークン */}
                                        {log.metadata && log.metadata.audio_duration_sec ? (
                                            <span className="audio-sec">
                                                🎤 {Number(log.metadata.audio_duration_sec).toFixed(2)}s
                                            </span>
                                        ) : (
                                            log.input_tokens || log.output_tokens ? (
                                                <span className="tokens">
                                                    {log.input_tokens ? `↓${log.input_tokens}` : ''}
                                                    {log.output_tokens ? ` ↑${log.output_tokens}` : ''}
                                                </span>
                                            ) : '-'
                                        )}
                                    </td>
                                    <td>
                                        <span className="cost">¥{formatCostJpy(resolveEstimatedCostJpy(log))}</span>
                                    </td>
                                    <td>
                                        {(() => {
                                            const billing = getBillingBreakdown(log)
                                            if (!billing) return '-'
                                            if (billing.billingUnit === 'audio_second') {
                                                return (
                                                    <div className="cost-breakdown" title={formatBillingBreakdownText(log)}>
                                                        <div>音声: {Number(billing.audioDurationSec || 0).toFixed(2)}秒 × ¥{formatCostJpy(billing.ratePerSecondJpy, 4)}/秒</div>
                                                        <div className="cost-breakdown-total">合計: ¥{formatCostJpy(billing.totalCostJpy)}</div>
                                                    </div>
                                                )
                                            }
                                            return (
                                                <div className="cost-breakdown" title={formatBillingBreakdownText(log)}>
                                                    <div>入力: {billing.inputTokens.toLocaleString()}tok × ¥{billing.inputRatePer1M}/100万 = ¥{formatCostJpy(billing.inputCostJpy)}</div>
                                                    <div>出力: {billing.outputTokens.toLocaleString()}tok × ¥{billing.outputRatePer1M}/100万 = ¥{formatCostJpy(billing.outputCostJpy)}</div>
                                                    <div className="cost-breakdown-total">合計: ¥{formatCostJpy(billing.totalCostJpy)}</div>
                                                </div>
                                            )
                                        })()}
                                    </td>
                                    <td className="error-cell">
                                        {log.error_message ? (
                                            <span className="error-msg" title={log.error_message}>
                                                {log.error_message}
                                            </span>
                                        ) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {displayedLogs.length === 0 && (
                        <div className="no-logs">ログがありません</div>
                    )}
                </div>
            )}
        </div>
    )
}
