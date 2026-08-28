
import { normalizeIngredientKey } from '../src/utils/normalizeIngredientKey.js';

// Mock helpers from incomingStockService.js
const normalizeUnit = (value) => String(value || '').trim();

const buildKey = (name, unit, vendor) => {
    const v = String(vendor || '').trim();
    return `${v}@@${normalizeIngredientKey(name)}@@${normalizeUnit(unit)}`;
};

const safeNumber = (value) => {
    const n = typeof value === 'number' ? value : parseFloat(String(value || '').replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(n) ? n : null;
};

const computeDeltaItems = (parsed) => {
    const acc = new Map(); // key -> { vendor, name, unit, quantity }
    const slips = parsed?.slips || parsed?.receipts || [];

    slips.forEach((slip) => {
        const vendor = String(slip?.vendor || '').trim();
        (slip?.items || []).forEach((it) => {
            const name = String(it?.name || '').trim();
            if (!name) return;
            const unit = normalizeUnit(it?.deliveryUnit || it?.unit || it?.unitName || '');
            const qty = safeNumber(it?.deliveryQty ?? it?.quantity ?? it?.qty);
            if (qty == null) return;

            const key = buildKey(name, unit, vendor);
            const prev = acc.get(key);
            if (prev) {
                prev.quantity += qty;
            } else {
                acc.set(key, { vendor, name, unit, quantity: qty });
            }
        });
    });

    return Array.from(acc.values()).filter((r) => Number.isFinite(r.quantity));
};

const mergeStockItems = (stockItems, deltaItems, nowIso) => {
    const map = new Map(); // key -> item
    (stockItems || []).forEach((it) => {
        const name = String(it?.name || '').trim();
        if (!name) return;
        const unit = normalizeUnit(it?.unit || '');
        const vendor = String(it?.vendor || '').trim();
        const quantity = safeNumber(it?.quantity) ?? 0;
        map.set(buildKey(name, unit, vendor), {
            vendor,
            name,
            unit,
            quantity,
            updatedAt: it?.updatedAt || null,
        });
    });

    deltaItems.forEach((d) => {
        const key = buildKey(d.name, d.unit, d.vendor);
        const prev = map.get(key);
        if (prev) {
            prev.quantity = Math.max(0, (safeNumber(prev.quantity) ?? 0) + (safeNumber(d.quantity) ?? 0));
            prev.updatedAt = nowIso;
        } else {
            map.set(key, {
                vendor: d.vendor,
                name: d.name,
                unit: normalizeUnit(d.unit),
                quantity: Math.max(0, safeNumber(d.quantity) ?? 0),
                updatedAt: nowIso,
            });
        }
    });

    return Array.from(map.values()).sort((a, b) => {
        if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor, 'ja');
        if (a.name !== b.name) return a.name.localeCompare(b.name, 'ja');
        return String(a.unit || '').localeCompare(String(b.unit || ''), 'ja');
    });
};

// Test Cases
const runTest = () => {
    console.log('Running Stock Logic Test...');

    const initialStock = [
        { vendor: 'VendorA', name: 'Item1', unit: 'kg', quantity: 10, updatedAt: '2023-01-01' },
        { vendor: 'VendorA', name: 'Item2', unit: 'pcs', quantity: 5, updatedAt: '2023-01-01' },
    ];

    const parsedDelivery = {
        slips: [
            {
                vendor: 'VendorA',
                items: [
                    { name: 'Item1', deliveryQty: 5, deliveryUnit: 'kg' }, // Should increase to 15
                    { name: 'ITEM1', deliveryQty: 5, deliveryUnit: 'kg' }, // Should increase to 20 (case insensitive)
                    { name: 'Item3', deliveryQty: 20, deliveryUnit: 'box' }, // New item
                    { name: 'Item2 ', deliveryQty: 2, deliveryUnit: 'pcs' }, // Whitespace check, should increase to 7
                ]
            },
            {
                vendor: 'VendorB',
                items: [
                    { name: 'Item1', deliveryQty: 100, deliveryUnit: 'kg' } // Different vendor, new item
                ]
            }
        ]
    };

    console.log('Computing delta...');
    const delta = computeDeltaItems(parsedDelivery);
    // console.log('Delta:', JSON.stringify(delta, null, 2));

    console.log('Merging stock...');
    const merged = mergeStockItems(initialStock, delta, new Date().toISOString());
    console.log('Merged Stock:', JSON.stringify(merged, null, 2));

    // Assertions
    const item1A = merged.find(i => i.name.toLowerCase() === 'item1' && i.vendor === 'VendorA');
    if (item1A.quantity !== 20) console.error(`FAIL: Item1 (VendorA) quantity should be 20, got ${item1A.quantity}`);
    else console.log('PASS: Item1 (VendorA)');

    const item2A = merged.find(i => i.name.toLowerCase() === 'item2' && i.vendor === 'VendorA');
    if (item2A.quantity !== 7) console.error(`FAIL: Item2 (VendorA) quantity should be 7, got ${item2A.quantity}`);
    else console.log('PASS: Item2 (VendorA)');

    const item3A = merged.find(i => i.name === 'Item3' && i.vendor === 'VendorA');
    if (item3A.quantity !== 20) console.error(`FAIL: Item3 (VendorA) quantity should be 20, got ${item3A?.quantity}`);
    else console.log('PASS: Item3 (VendorA)');

    const item1B = merged.find(i => i.name === 'Item1' && i.vendor === 'VendorB');
    if (item1B.quantity !== 100) console.error(`FAIL: Item1 (VendorB) quantity should be 100, got ${item1B?.quantity}`);
    else console.log('PASS: Item1 (VendorB)');
};

runTest();
