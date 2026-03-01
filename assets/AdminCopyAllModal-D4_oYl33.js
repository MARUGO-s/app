const e=`import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export const AdminCopyAllModal = ({
    isOpen,
    onClose,
    onConfirm,
    loading,
    progressStatus, // { phase: 'start' | 'progress_user' | 'progress_file' | 'done', message: string, totalUser: number, doneUser: number, currentUser: string, ... }
    copyResult
}) => {
    if (!isOpen) return null;

    const renderProgress = () => {
        if (!progressStatus) return null;

        const { phase, message, totalUser, doneUser, totalFile, doneFile } = progressStatus;

        return (
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#334155' }}>
                    {message || '処理中...'}
                </div>

                {/* ユーザー全体の進捗バー */}
                {totalUser > 0 && (
                    <div style={{ marginBottom: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', color: '#64748b' }}>
                            <span>全体の進捗 ({doneUser} / {totalUser} ユーザー)</span>
                            <span>{Math.round((doneUser / totalUser) * 100)}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{
                                width: \`\${(doneUser / totalUser) * 100}%\`,
                                height: '100%',
                                backgroundColor: '#3b82f6',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                    </div>
                )}

                {/* 現在のユーザーのファイル進捗バー */}
                {phase === 'progress_file' && totalFile > 0 && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px', color: '#64748b' }}>
                            <span>対象ユーザーのファイル処理 ({doneFile} / {totalFile})</span>
                            <span>{Math.round((doneFile / totalFile) * 100)}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                                width: \`\${(doneFile / totalFile) * 100}%\`,
                                height: '100%',
                                backgroundColor: '#10b981',
                                transition: 'width 0.2s ease'
                            }} />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderResult = () => {
        if (!copyResult) return null;

        return (
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                <div style={{ fontWeight: 'bold', color: '#065f46', marginBottom: '10px' }}>
                    🎉 一括コピーが完了しました！
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#047857' }}>
                    <li>価格データのコピー先ユーザー数: {copyResult.totalTargetUsers} 人</li>
                    <li>価格データのコピー処理結果: {copyResult.csvResults.filter(r => !r.error).length}件成功 / {copyResult.csvResults.filter(r => r.error).length}件エラー</li>
                    <li>材料マスターのコピー: 完了</li>
                </ul>
            </div>
        );
    };

    const isDone = copyResult !== null || (progressStatus && progressStatus.phase === 'done');

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!loading) onClose(); }}
            title="管理者データの一斉配布"
            maxWidth="550px"
        >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {!progressStatus && !copyResult && (
                    <div style={{ marginBottom: '20px' }}>
                        <p style={{ margin: '0 0 10px', fontSize: '0.95rem', lineHeight: 1.6, color: '#334155' }}>
                            あなたが登録している<strong>価格データ（CSV）</strong>と<strong>材料マスター（単位変換・上書き情報）</strong>を、<br />
                            <strong>他のすべての通常ユーザーに一気にコピー</strong>します。
                        </p>
                        <div style={{ backgroundColor: '#fff8f1', padding: '12px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '0.85rem', color: '#c2410c' }}>
                            ⚠️ <strong>注意点</strong>
                            <ul style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: 1.5 }}>
                                <li>ユーザーが独自に登録した材料マスターは消えませんが、同じ材料名がある場合はあなたのデータで上書きされます。</li>
                                <li>ユーザーの価格データフォルダに同名のファイルがある場合は、ファイル名の末尾に <code>_copy</code> などの連番が付与されます。</li>
                                <li>この処理は取り消すことができません。完了するまで画面を閉じないでください。</li>
                            </ul>
                        </div>
                    </div>
                )}

                {renderProgress()}
                {renderResult()}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                    {!loading && !isDone && (
                        <>
                            <Button variant="ghost" onClick={onClose}>
                                キャンセル
                            </Button>
                            <Button variant="primary" onClick={onConfirm}>
                                🔄 実行して配布する
                            </Button>
                        </>
                    )}
                    {isDone && (
                        <Button variant="primary" onClick={onClose}>
                            閉じる
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};
`;export{e as default};
