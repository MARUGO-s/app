
import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';

// --- Helper Functions from src/utils/parseDeliveryPdf.js ---
const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const toCleanLine = (v) => String(v ?? '').replace(/\u0000/g, '').trim();

const parseNumber = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return null;
    const normalized = s.replace(/[￥¥,\s]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
};

const parseDateLike = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return null;
    const m = s.match(/^(\d{4}\/\d{2}\/\d{2})(?:\s+(\d{2}:\d{2}))?$/);
    if (!m) return null;
    return m[2] ? `${m[1]} ${m[2]}` : m[1];
};

const shouldIgnoreLine = (line) => {
    const s = String(line ?? '').trim();
    if (!s) return true;
    if (s === '/') return true;
    if (s.startsWith('抽出条件→')) return true;
    if (s.includes('ソート条件→')) return true;
    return false;
};

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

const isSlipStart = (line) => {
    const s = String(line ?? '').trim();
    if (!s) return false;
    if (/^伝票No\.?\s*(\d{3,})?\s*$/.test(s)) return true;
    return false;
};

const parseItemAt = (lines, startIndex) => {
    const name = toCleanLine(lines[startIndex]);
    if (!name) return null;
    if (isSlipStart(name)) return null;
    if (name === '納品予定一覧') return null;
    if (name === '出力日：' || name === '出力日') return null;
    if (name === 'No' || name === '商品名' || name === '単価' || name === '納品数量' || name === '規格・入数／単位' || name === '発注数量' || name === 'ﾁｪｯｸ') return null;

    let i = startIndex + 1;
    const unitPrice = parseNumber(lines[i]);
    if (unitPrice == null) return null;
    i += 1;

    const deliveryQty = parseNumber(lines[i]);
    if (deliveryQty == null) return null;
    i += 1;

    const deliveryUnit = toCleanLine(lines[i]);
    if (!deliveryUnit) return null;
    i += 1;

    let spec = null;
    let orderQty = null;
    let orderUnit = null;

    const maybeNumber = parseNumber(lines[i]);
    if (maybeNumber != null) {
        orderQty = maybeNumber;
        i += 1;
        orderUnit = toCleanLine(lines[i]);
        i += 1;
    } else {
        spec = toCleanLine(lines[i]) || null;
        i += 1;
        orderQty = parseNumber(lines[i]);
        i += 1;
        orderUnit = toCleanLine(lines[i]);
        i += 1;
    }

    while (i < lines.length) {
        const t = toCleanLine(lines[i]);
        if (t === '□' || t === '○') {
            i += 1;
            continue;
        }
        break;
    }

    let no = null;
    const maybeNo = toCleanLine(lines[i]);
    if (/^\d+$/.test(maybeNo)) {
        no = parseInt(maybeNo, 10);
        i += 1;
    }

    return {
        item: {
            no,
            name,
            unitPrice,
            deliveryQty,
            deliveryUnit,
            spec,
            orderQty,
            orderUnit,
        },
        nextIndex: i,
    };
};

const parseDeliveryLines = (lines) => {
    const cleaned = (lines || [])
        .map(toCleanLine)
        .filter((l) => !shouldIgnoreLine(l));

    const report = {
        title: cleaned.find((l) => l.includes('納品')) || null,
        outputAt: null,
        rangeFrom: null,
        rangeTo: null,
    };

    const slipMap = new Map();
    let currentSlip = null;

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
                    vendor: null,
                    slipDate: null,
                    items: [],
                };
                slipMap.set(slipNo, currentSlip);
            }
            continue;
        }

        if (!currentSlip) continue;

        // "取引先" or "仕入先" or "発注先" marker
        if (/^(取引先|仕入先|発注先)/.test(line) && !line.includes('コード') && !line.includes('住所') && !line.includes('電話')) {
            let labelLen = 3;
            if (line.startsWith('取引先名') || line.startsWith('仕入先名') || line.startsWith('発注先名')) {
                labelLen = 4;
            }

            let rest = line.slice(labelLen).trim();
            if (rest.startsWith(':') || rest.startsWith('：')) rest = rest.slice(1).trim();

            if (!rest) {
                if (isNonEmpty(next) && !currentSlip.vendor) {
                    if (!/^\d+$/.test(next) && !next.includes('コード')) {
                        currentSlip.vendor = next.trim();
                    }
                }
            } else {
                const matchCode = rest.match(/^(\d+)\s+(.+)$/);
                if (matchCode) {
                    rest = matchCode[2].trim();
                }
                if (rest && !currentSlip.vendor) {
                    currentSlip.vendor = rest;
                }
            }
            continue;
        }
    }

    const slips = Array.from(slipMap.values());
    return { report, slips };
};

// --- Test Execution ---

async function runTest() {
    const files = [
        '/Users/yoshito/Downloads/TaskDeliveryList3-5.pdf'
    ];

    for (const file of files) {
        console.log(`\n=== Testing ${file} ===`);
        try {
            const dataBuffer = fs.readFileSync(file);
            const data = await pdf(dataBuffer);
            const lines = data.text.split('\n');
            console.log('Total text lines:', lines.length);

            // Dump first 50 lines to see structure
            console.log('--- Head of text content ---');
            lines.slice(0, 50).forEach((l, idx) => console.log(`${idx}: ${l}`));
            console.log('----------------------------');

            const result = parseDeliveryLines(lines);
            console.log('Extracted Slips:', result.slips.length);
            result.slips.forEach(s => {
                console.log(`Slip ${s.slipNo}: Vendor="${s.vendor}"`);
            });

        } catch (e) {
            console.error('Error processing file:', e);
        }
    }
}

runTest();
