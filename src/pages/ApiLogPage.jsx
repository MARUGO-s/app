import React from 'react';
import ApiUsageLogs from '../components/ApiUsageLogs';
import { Card } from '../components/Card';

const ApiLogPage = () => {
    return (
        <div className="api-log-page" style={{ padding: '20px' }}>
            <Card>
                <div style={{ marginBottom: '20px' }}>
                    <h2>システム管理</h2>
                    <p style={{ color: '#666' }}>AI機能（音声入力、画像解析など）の使用状況とコストを確認できます。</p>
                </div>
                <ApiUsageLogs />
            </Card>
        </div>
    );
};

export default ApiLogPage;
