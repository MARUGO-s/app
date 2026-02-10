// Local PDF text extraction + deterministic parser for "納品予定一覧" style PDFs.
// Avoids external API calls (Gemini/Azure) to keep local/dev reliable.

import pdfWorkerUrl from 'pdf-parse/lib/pdf.js/v2.0.550/build/pdf.worker.js?url';

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
  // Accept "YYYY/MM/DD" or "YYYY/MM/DD HH:mm"
  const m = s.match(/^(\d{4}\/\d{2}\/\d{2})(?:\s+(\d{2}:\d{2}))?$/);
  if (!m) return null;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
};

const shouldIgnoreLine = (line) => {
  const s = String(line ?? '').trim();
  if (!s) return true;
  if (s === '/') return true; // page marker split (e.g., 1 / 2)
  if (s.startsWith('抽出条件→')) return true;
  if (s.includes('ソート条件→')) return true;
  return false;
};

const detectSlipNo = (line, nextLine) => {
  const s = String(line ?? '').trim();
  // "伝票No.524355"
  const inline = s.match(/^伝票No\.?\s*(\d{3,})\s*$/);
  if (inline?.[1]) return { slipNo: inline[1], consumeNext: false };
  // "伝票No." then next line "524355"
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

  // Next token is either spec (string) or directly orderQty (number) when spec is missing.
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

  // Skip checkmarks and other small markers
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
      code: null,
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

export const parseDeliveryLines = (lines) => {
  const cleaned = (lines || [])
    .map(toCleanLine)
    .filter((l) => !shouldIgnoreLine(l));

  const report = {
    title: cleaned.find((l) => l.includes('納品')) || null,
    outputAt: null,
    rangeFrom: null,
    rangeTo: null,
  };

  for (let i = 0; i < cleaned.length; i += 1) {
    const line = cleaned[i];
    const mOut = line.match(/^出力日：?\s*(.+)$/);
    if (mOut?.[1] && !report.outputAt) {
      report.outputAt = parseDateLike(mOut[1]) || mOut[1].trim();
      continue;
    }
    const mRange = line.match(/^(\d{4}\/\d{2}\/\d{2})\s*～\s*(\d{4}\/\d{2}\/\d{2})/);
    if (mRange && !report.rangeFrom) {
      report.rangeFrom = mRange[1];
      report.rangeTo = mRange[2];
    }
  }

  const slipMap = new Map(); // slipNo -> slip
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
          deliveryDate: null,
          total: null,
          comment: null,
          items: [],
        };
        slipMap.set(slipNo, currentSlip);
      }
      continue;
    }

    if (!currentSlip) continue;

    if (line === '伝票日付' || line.startsWith('伝票日付')) {
      const inline = line.match(/^伝票日付\s*(\d{4}\/\d{2}\/\d{2})$/);
      if (inline?.[1]) currentSlip.slipDate = inline[1];
      else if (parseDateLike(next)) currentSlip.slipDate = parseDateLike(next);
      continue;
    }

    // "取引先" or "仕入先" marker
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

    if (line === '総合計') {
      const n = parseNumber(next);
      if (n != null) currentSlip.total = n;
      continue;
    }

    if (line === '納品日' || line.startsWith('納品日')) {
      const inline = line.match(/^納品日\s*(\d{4}\/\d{2}\/\d{2})$/);
      if (inline?.[1]) currentSlip.deliveryDate = inline[1];
      else if (parseDateLike(next)) currentSlip.deliveryDate = parseDateLike(next)?.slice(0, 10);
      continue;
    }

    if (line.startsWith('コメント')) {
      const inline = line.match(/^コメント[:：]?\s*(.*)$/);
      const inlineText = inline?.[1]?.trim() || '';
      if (inlineText && inlineText !== 'No') {
        currentSlip.comment = inlineText;
        continue;
      }
      // Collect until header markers
      const parts = [];
      for (let j = i + 1; j < cleaned.length; j += 1) {
        const t = cleaned[j];
        if (!t) continue;
        if (isSlipStart(t) || t === 'No' || t === '商品コード' || t === '商品名' || t === '単価' || t === '納品数量' || t === '規格・入数／単位' || t === '発注数量' || t === 'ﾁｪｯｸ') break;
        parts.push(t);
      }
      const c = parts.join(' ').trim();
      if (c && c !== 'No') currentSlip.comment = c;
      continue;
    }

    if (line === 'ﾁｪｯｸ' || line === 'チェック') {
      let j = i + 1;
      while (j < cleaned.length) {
        const t = cleaned[j];
        if (isSlipStart(t) || t === '納品予定一覧') break;
        const parsed = parseItemAt(cleaned, j);
        if (!parsed) {
          j += 1;
          continue;
        }
        currentSlip.items.push(parsed.item);
        j = parsed.nextIndex;
      }
      i = j - 1;
    }
  }

  const slips = Array.from(slipMap.values()).sort((a, b) => String(a.slipNo).localeCompare(String(b.slipNo), 'ja'));
  return { report, slips };
};

export const parseDeliveryPdfFile = async (pdfFile) => {
  if (!pdfFile) throw new Error('PDFファイルが必要です');

  const arrayBuffer = await pdfFile.arrayBuffer();

  // pdf-parse bundles a PDF.js build we can reuse without adding a new dependency.
  const mod = await import('pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js');
  const pdfjs = mod?.default && mod.default.getDocument ? mod.default : mod;

  if (!pdfjs?.getDocument) throw new Error('PDF解析モジュールの読み込みに失敗しました');

  // Configure worker for browser environments (required).
  // If you don't set this, PDF.js throws: "No 'GlobalWorkerOptions.workerSrc' specified."
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }

  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items || []) {
      const s = toCleanLine(it?.str);
      if (s) lines.push(s);
    }
  }

  const parsed = parseDeliveryLines(lines);
  if (!parsed?.slips || parsed.slips.length === 0) {
    throw new Error('このPDFから伝票データを抽出できませんでした（スキャンPDF等の可能性があります）');
  }
  return parsed;
};
