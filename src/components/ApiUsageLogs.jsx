import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { userService } from '../services/userService'
import './ApiUsageLogs.css'

const toSafeNumber = (value, fallback = 0) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
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
    if (!metadata || typeof metadata !== 'object') return null
    const breakdown = metadata.billing_breakdown
    if (!breakdown || typeof breakdown !== 'object') return null

    return {
        model: String(breakdown.model || log?.model_name || ''),
        inputTokens: toSafeNumber(breakdown.input_tokens, toSafeNumber(log?.input_tokens, 0)),
        outputTokens: toSafeNumber(breakdown.output_tokens, toSafeNumber(log?.output_tokens, 0)),
        inputCostJpy: toSafeNumber(breakdown.input_cost_jpy, 0),
        outputCostJpy: toSafeNumber(breakdown.output_cost_jpy, 0),
        totalCostJpy: toSafeNumber(
            breakdown.total_cost_jpy,
            toSafeNumber(log?.estimated_cost_jpy, 0)
        ),
        inputRatePer1M: toSafeNumber(breakdown.rate_per_1m_jpy?.input, 0),
        outputRatePer1M: toSafeNumber(breakdown.rate_per_1m_jpy?.output, 0),
    }
}

const formatBillingBreakdownText = (log) => {
    const b = getBillingBreakdown(log)
    if (!b) return '-'
    return `入力${b.inputTokens.toLocaleString()}tok × ¥${b.inputRatePer1M}/100万 + 出力${b.outputTokens.toLocaleString()}tok × ¥${b.outputRatePer1M}/100万 = ¥${b.totalCostJpy}`
}

export default function ApiUsageLogs() {
    const [logs, setLogs] = useState([])
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
    const displayedLogs = useMemo(() => {
        return logs.filter(log => {
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
    }, [logs, activeTab])

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

            if (filter.status !== 'all') {
                query = query.eq('status', filter.status)
            }
            if (filter.dateFrom) {
                query = query.gte('created_at', filter.dateFrom)
            }
            if (filter.dateTo) {
                query = query.lte('created_at', filter.dateTo + 'T23:59:59')
            }

            const { data, error } = await query

            if (error) throw error

            setLogs(data || [])
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
        const totalCost = logsData.reduce((sum, log) => sum + toSafeNumber(log.estimated_cost_jpy, 0), 0)

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
            totalCost: totalCost.toFixed(2),
            totalAudioSec: totalAudioSec.toFixed(1),
            totalInputTokens,
            totalOutputTokens,
            totalInputCost: Number(totalInputCost.toFixed(4)),
            totalOutputCost: Number(totalOutputCost.toFixed(4)),
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
                log.estimated_cost_jpy || '',
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
                            <div className="stat-value">¥{parseFloat(stats.totalCost).toLocaleString()}</div>
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
                            <div className="stat-value">¥{toSafeNumber(stats.totalCost, 0).toLocaleString()}</div>
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
                            <div className="stat-value">¥{toSafeNumber(stats.totalCost, 0).toLocaleString()}</div>
                            <div className="secondary-stat">入力 ¥{toSafeNumber(stats.totalInputCost, 0).toLocaleString()} / 出力 ¥{toSafeNumber(stats.totalOutputCost, 0).toLocaleString()}</div>
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
                            <div className="stat-value">¥{toSafeNumber(stats.totalCost, 0).toLocaleString()}</div>
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
                                        {(log.estimated_cost_jpy != null && log.estimated_cost_jpy !== '') ? (
                                            <span className="cost">¥{Number(log.estimated_cost_jpy)}</span>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        {(() => {
                                            const billing = getBillingBreakdown(log)
                                            if (!billing) return '-'
                                            return (
                                                <div className="cost-breakdown" title={formatBillingBreakdownText(log)}>
                                                    <div>入力: {billing.inputTokens.toLocaleString()}tok × ¥{billing.inputRatePer1M}/100万 = ¥{billing.inputCostJpy}</div>
                                                    <div>出力: {billing.outputTokens.toLocaleString()}tok × ¥{billing.outputRatePer1M}/100万 = ¥{billing.outputCostJpy}</div>
                                                    <div className="cost-breakdown-total">合計: ¥{billing.totalCostJpy}</div>
                                                </div>
                                            )
                                        })()}
                                    </td>
                                    <td className="error-cell">
                                        {log.error_message ? (
                                            <span className="error-msg" title={log.error_message}>
                                                {log.error_message.substring(0, 50)}...
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
