import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { deployLogService } from '../services/deployLogService';
import { useToast } from '../contexts/useToast';
import './DeployLogs.css';

export const DeployLogs = ({ onBack }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const toast = useToast();

    // フォーム用ステート
    const [formData, setFormData] = useState({
        project: 'git',
        type: 'commit',
        message: '',
        actor: 'user',
        status: 'success'
    });

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await deployLogService.fetchDeployLogs(50);
            setLogs(data || []);
        } catch (error) {
            console.error(error);
            toast.error('デプロイ履歴の取得に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddLog = async () => {
        if (!formData.message.trim()) {
            toast.warning('メッセージを入力してください');
            return;
        }
        try {
            await deployLogService.insertDeployLog(formData);
            toast.success('ログを追加しました');
            setIsAddModalOpen(false);
            setFormData({ ...formData, message: '' });
            fetchLogs();
        } catch (error) {
            toast.error('追加に失敗しました');
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    return (
        <div style={{ paddingBottom: '40px' }}>
            <div style={{ padding: '20px 20px 0', textAlign: 'left' }}>
                <Button onClick={onBack}>
                    ← 一覧に戻る
                </Button>
            </div>
            
            <div className="deploy-logs-container">
                <div className="deploy-logs-header">
                    <h2>🚀 デプロイとコミット履歴 (最新50件)</h2>
                    <div className="deploy-logs-controls">
                        <Button variant="secondary" onClick={() => setIsAddModalOpen(true)}>
                            + 手動追加
                        </Button>
                        <Button variant="ghost" onClick={fetchLogs}>
                            🔄 更新
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                        読み込み中...
                    </div>
                ) : logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                        デプロイ履歴がありません。
                    </div>
                ) : (
                    <div className="deploy-logs-table-wrapper">
                        <table className="deploy-logs-table">
                            <thead>
                                <tr>
                                    <th>日時</th>
                                    <th>対象 (Project)</th>
                                    <th>種別 (Type)</th>
                                    <th>ステータス</th>
                                    <th>実行者 (Actor)</th>
                                    <th>メッセージ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                                        <td>
                                            <span className="badge-project" data-project={log.project ? log.project.toLowerCase() : ''}>
                                                {log.project || '-'}
                                            </span>
                                        </td>
                                        <td>{log.type}</td>
                                        <td>
                                            <span className={`badge-status ${log.status ? log.status.toLowerCase() : 'pending'}`}>
                                                {log.status || 'unknown'}
                                            </span>
                                        </td>
                                        <td>{log.actor}</td>
                                        <td className="log-message" title={log.message}>
                                            {log.message && log.message.length > 50 ? log.message.substring(0, 50) + '...' : log.message}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <Modal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    title="デプロイ履歴の手動追加"
                >
                    <div className="add-log-modal">
                        <div className="form-group">
                            <label>対象 (Project)</label>
                            <select name="project" value={formData.project} onChange={handleChange}>
                                <option value="git">Git (GitHub / Vercel)</option>
                                <option value="supabase">Supabase</option>
                                <option value="frontend">Frontend (App)</option>
                                <option value="backend">Backend</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>種別 (Type)</label>
                            <select name="type" value={formData.type} onChange={handleChange}>
                                <option value="commit">Commit</option>
                                <option value="deploy">Deploy</option>
                                <option value="migration">Database Migration</option>
                                <option value="system">System Event</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>メッセージ</label>
                            <textarea 
                                name="message" 
                                rows={3} 
                                value={formData.message} 
                                onChange={handleChange}
                                placeholder="例: v1.0.2 リリース、マイグレーション実行 等"
                            />
                        </div>
                        <div className="form-group">
                            <label>実行者</label>
                            <input name="actor" value={formData.actor} onChange={handleChange} placeholder="例: yoshito, github-actions..." />
                        </div>
                        <div className="form-group">
                            <label>ステータス</label>
                            <select name="status" value={formData.status} onChange={handleChange}>
                                <option value="success">Success / 成功</option>
                                <option value="error">Error / 失敗</option>
                                <option value="pending">Pending / 実行中</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                        <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>キャンセル</Button>
                        <Button variant="primary" onClick={handleAddLog}>追加する</Button>
                    </div>
                </Modal>
            </div>
            
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <Button onClick={onBack}>
                    ← 一覧に戻る
                </Button>
            </div>
        </div>
    );
};
