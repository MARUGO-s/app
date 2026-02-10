
// Mock of parseDeliveryLines from src/utils/parseDeliveryPdf.js
// Updated to match the FIX.

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const toCleanLine = (v) => String(v ?? '').replace(/\u0000/g, '').trim();
const parseNumber = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return null;
    const normalized = s.replace(/[￥¥,\s]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
};
const shouldIgnoreLine = (line) => false; // Simplified

const detectSlipNo = (line, nextLine) => {
    const s = String(line ?? '').trim();
    const inline = s.match(/^伝票No\.?\s*(\d{3,})\s*$/);
    if (inline?.[1]) return { slipNo: inline[1], consumeNext: false };
    if (/^伝票No\.?\s*$/.test(s)) {
        const n = String(nextLine ?? '').trim();
        if (/^\d{3,}$/.test(n)) return { slipNo: n, consumeNext: true };
    }
    return null;
};

const parseDeliveryLines = (lines) => {
    const cleaned = (lines || []).map(toCleanLine).filter((l) => !shouldIgnoreLine(l));
    const slipMap = new Map();
    let currentSlip = null;

    // New state to track vendor found BEFORE slip
    let pendingVendor = null;

    for (let i = 0; i < cleaned.length; i += 1) {
        const line = cleaned[i];
        const next = cleaned[i + 1];

        const slipDetected = detectSlipNo(line, next);
        if (slipDetected?.slipNo) {
            const slipNo = slipDetected.slipNo;
            if (slipDetected.consumeNext) i += 1;
            const existing = slipMap.get(slipNo);
            if (existing) {
                currentSlip = existing;
            } else {
                currentSlip = {
                    slipNo,
                    vendor: pendingVendor || null, // Inherit pending vendor
                    items: [],
                };
                slipMap.set(slipNo, currentSlip);
            }
            continue;
        }

        // Check for Vendor (Order Source) - Works even if currentSlip is null
        if (/^(取引先|仕入先|発注先)/.test(line) && !line.includes('コード') && !line.includes('住所') && !line.includes('電話')) {
            let labelLen = 3;
            if (line.startsWith('取引先名') || line.startsWith('仕入先名') || line.startsWith('発注先名')) {
                labelLen = 4;
            }

            let rest = line.slice(labelLen).trim();
            if (rest.startsWith(':') || rest.startsWith('：')) rest = rest.slice(1).trim();

            let foundVendor = null;
            // Extract vendor name
            if (!rest) {
                if (isNonEmpty(next)) {
                    if (!/^\d+$/.test(next) && !next.includes('コード')) {
                        foundVendor = next.trim();
                    }
                }
            } else {
                const matchCode = rest.match(/^(\d+)\s+(.+)$/);
                if (matchCode) {
                    rest = matchCode[2].trim();
                }
                foundVendor = rest;
            }

            if (foundVendor) {
                if (currentSlip) {
                    if (!currentSlip.vendor) currentSlip.vendor = foundVendor;
                } else {
                    pendingVendor = foundVendor;
                }
            }
            continue;
        }

        if (!currentSlip) continue;
    }

    return Array.from(slipMap.values());
};

const runTest = () => {
    console.log('Testing PDF Parsing Logic (Fix Verification)...');

    // Case 1: Vendor BEFORE Slip No
    const lines1 = [
        '取引先名： 株式会社サンプルフード',
        'Some other header',
        '伝票No. 10001',
        '商品A',
        '100',
        '1',
        '個'
    ];

    const result1 = parseDeliveryLines(lines1);
    console.log('Case 1 Result:', JSON.stringify(result1, null, 2));

    if (result1.length > 0 && result1[0].vendor === '株式会社サンプルフード') {
        console.log('PASS: Case 1 (Vendor captured)');
    } else {
        console.log('FAIL: Case 1 (Vendor missed)');
    }

    // Case 2: Vendor INSIDE Slip
    const lines2 = [
        '伝票No. 10002',
        '取引先名： 株式会社サンプルフード',
        '商品B'
    ];
    const result2 = parseDeliveryLines(lines2);
    if (result2.length > 0 && result2[0].vendor === '株式会社サンプルフード') {
        console.log('PASS: Case 2 (Vendor captured)');
    } else {
        console.log('FAIL: Case 2 (Vendor missed)');
    }

    // Case 3: Vendor without "Name" suffix (e.g. "発注先")
    const lines3 = [
        '発注先： テストサプライヤー',
        '伝票No. 10003',
    ];
    const result3 = parseDeliveryLines(lines3);
    if (result3.length > 0 && result3[0].vendor === 'テストサプライヤー') {
        console.log('PASS: Case 3 (Vendor captured with short label)');
    } else {
        console.log('FAIL: Case 3 (Vendor missed)');
    }
};

runTest();
