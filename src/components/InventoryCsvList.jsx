import React, { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Button } from './Button';
import { Input } from './Input';
import { purchasePriceService } from '../services/purchasePriceService'; // Using existing service for CSV parsing if applicable, or custom logic

// Draggable CSV Item
const DraggableCsvItem = ({ item }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `csv-${item.id}`,
        data: { item, type: 'csv-item' }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        position: 'relative',
        zIndex: 999
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="csv-draggable-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div className="csv-item-name" style={{ lineHeight: '1.2', flex: 1 }}>{item.name}</div>
                <div style={{ fontSize: '0.85rem', color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {item.price ? `¥${item.price}` : ''} {item.unit ? `/${item.unit}` : ''}
                </div>
            </div>
            <div className="csv-item-details">
                {item.vendor && <span style={{ color: '#555', fontSize: '0.8rem' }}>🏢 {item.vendor}</span>}
            </div>
        </div>
    );
};

export const InventoryCsvList = () => {
    const [csvItems, setCsvItems] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    // const [sortBy, setSortBy] = useState('name'); // Removed as per request
    const [filterVendor, setFilterVendor] = useState(''); // '' = all
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const items = await purchasePriceService.getPriceListArray();
            // Map to display format if needed, but getPriceListArray returns {name, price, unit, vendor...}
            // We need to add ID for dnd
            const mappedItems = items.map((item, index) => ({
                ...item,
                id: `csv-saved-${index}`,
                // Ensure defaults
                price: item.price || 0,
                unit: item.unit || '',
                vendor: item.vendor || ''
            }));

            setCsvItems(mappedItems);
        } catch (error) {
            console.error("Failed to load CSV data:", error);
            // Silent error or toast? simple alert for now as per previous pattern, or just log
        } finally {
            setLoading(false);
        }
    };

    // Extract unique vendors
    const uniqueVendors = [...new Set(csvItems.map(item => item.vendor).filter(v => v))].sort();

    const filteredItems = csvItems
        .filter(item => {
            const matchQuery = item.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchVendor = filterVendor ? item.vendor === filterVendor : true;
            return matchQuery && matchVendor;
        })
        .sort((a, b) => {
            // Always sort by vendor first
            const vendorA = a.vendor || '';
            const vendorB = b.vendor || '';
            if (vendorA < vendorB) return -1;
            if (vendorA > vendorB) return 1;
            // fallback to name
            return a.name.localeCompare(b.name, 'ja');
        });

    return (
        <div className="inventory-csv-list">
            <h3 className="section-title">📥 CSV取込 (ドラッグして登録)</h3>

            <div className="csv-upload-section">
                <Button size="sm" variant="secondary" onClick={loadData} disabled={loading} style={{ width: '100%' }}>
                    {loading ? '更新中...' : '↻ 保存済みデータを再読み込み'}
                </Button>
            </div>

            {/* Controls: Search, Sort, Filter */}
            <div className="csv-controls" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div className="csv-search" style={{ display: 'flex', gap: '0.5rem' }}>
                    <Input
                        placeholder="CSV内検索..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ flex: 1 }}
                    />
                </div>

                <div className="csv-filters" style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                        value={filterVendor}
                        onChange={(e) => setFilterVendor(e.target.value)}
                        style={{
                            flex: 1,
                            minWidth: 0, // Fix flex overflow
                            padding: '0.5rem',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            backgroundColor: 'white',
                            color: '#333',
                            fontSize: '0.9rem'
                        }}
                    >
                        <option value="">🏢 全ての業者</option>
                        {uniqueVendors.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="csv-items-container">
                {loading && <p>読み込み中...</p>}
                {!loading && csvItems.length === 0 && <p className="empty-msg">保存されたデータがありません</p>}

                {filteredItems.map(item => (
                    <DraggableCsvItem key={item.id} item={item} />
                ))}
            </div>
        </div>
    );
};
