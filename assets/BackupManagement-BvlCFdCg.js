const e=`import React, { useState, useEffect, useCallback } from 'react';
import { backupService } from '../services/backupService';
import { recipeService } from '../services/recipeService';
import { Button } from './Button';
import { Modal } from './Modal';
import { useAuth } from '../contexts/useAuth';
import { formatDisplayId } from '../utils/formatUtils';
import './BackupManagement.css';

export const BackupManagement = () => {
    const { user } = useAuth();
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState({ type: '', message: '' });

    // 全体バックアップ実行
    const [isRunningAll, setIsRunningAll] = useState(false);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);

    // 個別バックアップ実行
    const [runningUserIds, setRunningUserIds] = useState(new Set());

    // 復元確認モーダル
    const [restoreTarget, setRestoreTarget] = useState(null); // { backupId, displayId, generation, label }
    const [isLoadingBackupData, setIsLoadingBackupData] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreStatus, setRestoreStatus] = useState({ type: '', message: '' });

    // バックアップデータプレビュー
    const [previewBackup, setPreviewBackup] = useState(null); // { id, backup_data, ... }
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    const loadBackups = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await backupService.adminFetchAllBackups();
            setBackups(data || []);
        } catch (err) {
            console.error(err);
            setError('バックアップ一覧の取得に失敗しました: ' + (err?.message || String(err)));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBackups();
    }, [loadBackups]);

    // 全ユーザーのバックアップを今すぐ実行
    const handleBackupAll = async () => {
        if (isRunningAll) return;
        setIsRunningAll(true);
        setStatus({ type: 'info', message: '全ユーザーのバックアップを実行中...' });
        try {
            const result = await backupService.adminTriggerBackupAll();
            setStatus({
                type: 'success',
                message: result?.message || 'バックアップが完了しました',
            });
            await loadBackups();
        } catch (err) {
            console.error(err);
            setStatus({ type: 'error', message: 'バックアップ実行に失敗しました: ' + (err?.message || String(err)) });
        } finally {
            setIsRunningAll(false);
        }
    };

    // 特定ユーザーのバックアップを今すぐ実行
    const handleBackupUser = async (userId, displayId) => {
        if (runningUserIds.has(userId)) return;
        setRunningUserIds(prev => new Set([...prev, userId]));
        setStatus({ type: 'info', message: \`\${displayId || userId} のバックアップを実行中...\` });
        try {
            const result = await backupService.adminTriggerBackupForUser(userId);
            setStatus({
                type: 'success',
                message: result?.message || \`\${displayId || userId} のバックアップが完了しました\`,
            });
            await loadBackups();
        } catch (err) {
            console.error(err);
            setStatus({ type: 'error', message: \`バックアップ実行に失敗しました: \${err?.message || String(err)}\` });
        } finally {
            setRunningUserIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    // バックアップデータをJSONとしてダウンロード
    const handleDownload = async (backup) => {
        try {
            setStatus({ type: 'info', message: 'バックアップデータを取得中...' });
            const data = await backupService.adminFetchBackupData(backup.id || backup.backup_id);
            backupService.downloadBackupAsJson(data.backup_data, backup.label, backup.display_id || backup.user_id);
            setStatus({ type: 'success', message: 'JSONファイルをダウンロードしました' });
        } catch (err) {
            console.error(err);
            setStatus({ type: 'error', message: 'ダウンロードに失敗しました: ' + (err?.message || String(err)) });
        }
    };

    // 全ユーザーの最新バックアップを一括でダウンロードする機能
    const handleDownloadAll = async () => {
        if (isDownloadingAll || backups.length === 0) return;
        setIsDownloadingAll(true);
        setStatus({ type: 'info', message: '全ユーザーの最新データを集計中...' });

        try {
            // 各ユーザーの最新バックアップを特定する
            const latestBackupsMap = new Map();
            for (const b of backups) {
                const existing = latestBackupsMap.get(b.user_id);
                // created_at が新しいものを残す、または generation より確実な created_at で比較
                if (!existing || new Date(b.created_at) > new Date(existing.created_at)) {
                    latestBackupsMap.set(b.user_id, b);
                }
            }

            const latestBackups = Array.from(latestBackupsMap.values());
            if (latestBackups.length === 0) {
                setStatus({ type: 'info', message: 'ダウンロード可能なデータがありません' });
                return;
            }

            const usersDataMap = {};

            let successCount = 0;
            let failCount = 0;

            // 各バックアップの詳細データを取得
            for (let i = 0; i < latestBackups.length; i++) {
                const b = latestBackups[i];
                const displayName = formatDisplayId(b.display_id) || b.user_id;
                setStatus({ type: 'info', message: \`一括取得中... \${i + 1}/\${latestBackups.length}件 (\${displayName})\` });

                try {
                    const data = await backupService.adminFetchBackupData(b.id || b.backup_id);
                    // ユーザー名をキーにしてレシピデータをセット
                    usersDataMap[displayName] = {
                        user_id: b.user_id,
                        display_id: formatDisplayId(b.display_id) || null,
                        email: b.email || null,
                        generation: b.generation,
                        created_at: b.created_at,
                        label: b.label,
                        data: data.backup_data || []
                    };
                    successCount++;
                } catch (fetchErr) {
                    console.error(\`Failed to fetch data for user \${b.user_id}:\`, fetchErr);
                    failCount++;
                }
            }

            if (successCount === 0) {
                throw new Error('データの取得に全て失敗しました');
            }

            await backupService.downloadAllBackupsAsZip(usersDataMap);

            setStatus({
                type: 'success',
                message: \`一括ダウンロード完了: \${successCount}件成功\${failCount > 0 ? \`、\${failCount}件失敗\` : ''}\`
            });

        } catch (err) {
            console.error(err);
            setStatus({ type: 'error', message: '一括ダウンロードに失敗しました: ' + (err?.message || String(err)) });
        } finally {
            setIsDownloadingAll(false);
        }
    };

    // バックアップからの復元
    const handleRestoreClick = async (backup) => {
        setRestoreTarget({
            backupId: backup.id || backup.backup_id,
            displayId: formatDisplayId(backup.display_id) || backup.user_id,
            generation: backup.generation,
            label: backup.label,
            recipeCount: backup.recipe_count,
        });
        setRestoreStatus({ type: '', message: '' });
    };

    const handleRestoreConfirm = async () => {
        if (!restoreTarget || isRestoring) return;
        setIsRestoring(true);
        setRestoreStatus({ type: 'info', message: 'バックアップデータを取得中...' });
        try {
            const data = await backupService.adminFetchBackupData(restoreTarget.backupId);
            const recipes = data?.backup_data;
            if (!Array.isArray(recipes)) throw new Error('バックアップデータが不正です');

            setRestoreStatus({ type: 'info', message: \`\${recipes.length}件のレシピを復元中...\` });
            const result = await recipeService.importRecipes(recipes);
            setRestoreStatus({
                type: 'success',
                message: \`復元完了: \${result.count}件成功\${result.errors?.length > 0 ? \`、\${result.errors.length}件失敗\` : ''}\`,
            });
        } catch (err) {
            console.error(err);
            setRestoreStatus({ type: 'error', message: '復元に失敗しました: ' + (err?.message || String(err)) });
        } finally {
            setIsRestoring(false);
        }
    };

    // バックアップの内容プレビュー
    const handlePreview = async (backup) => {
        setIsLoadingPreview(true);
        try {
            const data = await backupService.adminFetchBackupData(backup.id || backup.backup_id);
            setPreviewBackup({ ...backup, backup_data: data.backup_data });
        } catch (err) {
            setStatus({ type: 'error', message: 'プレビューの取得に失敗しました' });
        } finally {
            setIsLoadingPreview(false);
        }
    };

    // ユーザーごとにグループ化
    const groupedByUser = backups.reduce((acc, b) => {
        const key = b.user_id;
        if (!acc[key]) acc[key] = { displayId: b.display_id, email: b.email, userId: key, gens: [] };
        acc[key].gens.push(b);
        return acc;
    }, {});

    const userGroups = Object.values(groupedByUser).sort((a, b) =>
        String(a.displayId || '').localeCompare(String(b.displayId || ''))
    );

    if (user?.role !== 'admin') {
        return (
            <div className="backup-management-empty">
                <p>⚠️ この機能は管理者のみ使用できます。</p>
            </div>
        );
    }

    return (
        <div className="backup-management">
            {/* ヘッダー */}
            <div className="backup-header">
                <div className="backup-header-info">
                    <h3 className="backup-title">🗄️ バックアップ管理</h3>
                    <p className="backup-desc">
                        各アカウントのレシピデータを自動・手動でバックアップします。最大3世代まで保存されます。
                    </p>
                </div>
                <div className="backup-header-actions">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={loadBackups}
                        disabled={loading || isDownloadingAll}
                    >
                        ↻ 更新
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleDownloadAll}
                        disabled={loading || isDownloadingAll || backups.length === 0}
                        title="すべてのユーザーの最新データをZIP形式でまとめてダウンロードします"
                    >
                        {isDownloadingAll ? '取得中...' : '📥 すべて一括DL (ZIP)'}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleBackupAll}
                        disabled={isRunningAll || isDownloadingAll}
                    >
                        {isRunningAll ? '実行中...' : '⚡ 全ユーザーを今すぐバックアップ'}
                    </Button>
                </div>
            </div>

            {/* ステータスメッセージ */}
            {status.message && (
                <div className={\`backup-status backup-status--\${status.type}\`}>
                    {status.message}
                </div>
            )}

            {/* エラー */}
            {error && (
                <div className="backup-status backup-status--error">{error}</div>
            )}

            {/* コンテンツ */}
            {loading ? (
                <div className="backup-loading">読み込み中...</div>
            ) : userGroups.length === 0 ? (
                <div className="backup-empty">
                    <p>バックアップがまだありません。</p>
                    <p>「全ユーザーを今すぐバックアップ」ボタンで初回バックアップを実行してください。</p>
                </div>
            ) : (
                <div className="backup-user-list">
                    {userGroups.map(group => (
                        <div key={group.userId} className="backup-user-card">
                            <div className="backup-user-header">
                                <div className="backup-user-info">
                                    <span className="backup-user-id">
                                        👤 {formatDisplayId(group.displayId) || group.userId}
                                    </span>
                                    {group.email && (
                                        <span className="backup-user-email">{group.email}</span>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleBackupUser(group.userId, formatDisplayId(group.displayId))}
                                    disabled={runningUserIds.has(group.userId) || isRunningAll}
                                >
                                    {runningUserIds.has(group.userId) ? '...' : '今すぐバックアップ'}
                                </Button>
                            </div>

                            <div className="backup-gen-list">
                                {[1, 2, 3].map(gen => {
                                    const backup = group.gens.find(g => g.generation === gen);
                                    return (
                                        <div
                                            key={gen}
                                            className={\`backup-gen-item \${backup ? 'backup-gen-item--exists' : 'backup-gen-item--empty'}\`}
                                        >
                                            <div className="backup-gen-number">
                                                <span className="backup-gen-badge">第{gen}世代</span>
                                            </div>
                                            {backup ? (
                                                <>
                                                    <div className="backup-gen-meta">
                                                        <div className="backup-gen-label">{backup.label}</div>
                                                        <div className="backup-gen-date">
                                                            {new Date(backup.created_at).toLocaleString('ja-JP', {
                                                                year: 'numeric', month: '2-digit', day: '2-digit',
                                                                hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </div>
                                                        <div className="backup-gen-count">
                                                            レシピ: <strong>{backup.recipe_count}</strong>件
                                                        </div>
                                                    </div>
                                                    <div className="backup-gen-actions">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handlePreview(backup)}
                                                            disabled={isLoadingPreview}
                                                            title="バックアップ内容を確認"
                                                        >
                                                            👁 確認
                                                        </Button>
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleDownload(backup)}
                                                            title="JSONファイルとしてダウンロード"
                                                        >
                                                            📥 DL
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRestoreClick(backup)}
                                                            title="このバックアップからレシピを復元"
                                                        >
                                                            ♻️ 復元
                                                        </Button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="backup-gen-empty-text">データなし</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 自動バックアップの説明 */}
            <div className="backup-cron-info">
                <div className="backup-cron-title">⏰ 自動バックアップについて</div>
                <ul className="backup-cron-list">
                    <li>自動バックアップは毎日 <strong>0:00 JST</strong>（UTC 15:00）に実行されます。</li>
                    <li>スケジュール実行には Supabase ダッシュボードの <strong>Database → Cron Jobs</strong> で設定が必要です。</li>
                    <li>最大3世代まで保存され、古いものから順に上書きされます。</li>
                </ul>
                <div className="backup-cron-sql">
                    <div className="backup-cron-sql-label">本番環境でのcronジョブ設定（Supabase SQL Editor）:</div>
                    <code className="backup-cron-code">
                        {'SELECT cron.schedule(\\'daily-account-backup\\', \\'0 15 * * *\\', $$SELECT net.http_post(url:=\\'<SUPABASE_URL>/functions/v1/scheduled-backup\\', headers:=\\'{\\"Content-Type\\":\\"application/json\\",\\"Authorization\\":\\"Bearer <ANON_KEY>\\"}\\', body:=\\'{}\\'::jsonb) AS request_id;$$);'}
                    </code>
                </div>
            </div>

            {/* 復元確認モーダル */}
            <Modal
                isOpen={!!restoreTarget}
                onClose={() => { if (!isRestoring) setRestoreTarget(null); }}
                title="バックアップから復元"
                size="medium"
                showCloseButton={!isRestoring}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
                        以下のバックアップからレシピを復元します。<br />
                        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                            ※ 既存レシピは維持されます。バックアップ内のレシピが新規追加されます。
                        </span>
                    </div>

                    <div className="restore-info-box">
                        <div><strong>対象アカウント:</strong> {restoreTarget?.displayId}</div>
                        <div><strong>世代:</strong> 第{restoreTarget?.generation}世代</div>
                        <div><strong>ラベル:</strong> {restoreTarget?.label}</div>
                        <div><strong>レシピ数:</strong> {restoreTarget?.recipeCount}件</div>
                    </div>

                    {restoreStatus.message && (
                        <div className={\`backup-status backup-status--\${restoreStatus.type}\`}>
                            {restoreStatus.message}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Button
                            variant="ghost"
                            onClick={() => setRestoreTarget(null)}
                            disabled={isRestoring}
                        >
                            キャンセル
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleRestoreConfirm}
                            disabled={isRestoring || restoreStatus.type === 'success'}
                        >
                            {isRestoring ? '復元中...' : 'この内容で復元'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* プレビューモーダル */}
            <Modal
                isOpen={!!previewBackup}
                onClose={() => setPreviewBackup(null)}
                title={\`バックアップ確認 - 第\${previewBackup?.generation}世代\`}
                size="large"
            >
                {previewBackup && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '0.85rem', color: '#555', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span>ユーザー: <strong>{formatDisplayId(previewBackup.display_id)}</strong></span>
                            <span>レシピ数: <strong>{previewBackup.recipe_count}件</strong></span>
                            <span>日時: <strong>{new Date(previewBackup.created_at).toLocaleString('ja-JP')}</strong></span>
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', background: '#f8f9fa', borderRadius: '8px', padding: '12px' }}>
                            <table className="backup-preview-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>タイトル</th>
                                        <th>カテゴリ</th>
                                        <th>作成日</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(Array.isArray(previewBackup.backup_data) ? previewBackup.backup_data : []).map((recipe, i) => (
                                        <tr key={recipe.id || i}>
                                            <td>{i + 1}</td>
                                            <td style={{ fontWeight: 500 }}>{recipe.title || '-'}</td>
                                            <td>{recipe.category || recipe.course || '-'}</td>
                                            <td>{recipe.created_at ? new Date(recipe.created_at).toLocaleDateString('ja-JP') : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <Button variant="secondary" onClick={() => handleDownload(previewBackup)}>📥 JSONダウンロード</Button>
                            <Button variant="ghost" onClick={() => setPreviewBackup(null)}>閉じる</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
`;export{e as default};
