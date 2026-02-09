import { supabase } from '../supabase.js';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';

const BUCKET_NAME = 'app-data';
const ROOT_FOLDER = 'incoming-stock';
const STOCK_FILE_NAME = 'stock.json';
const APPLIED_FOLDER_NAME = 'applied';

const readBlobAsText = async (blob) => {
  if (!blob) return '';
  const buffer = await blob.arrayBuffer();
  try {
    return new TextDecoder('utf-8').decode(buffer);
  } catch {
    return String.fromCharCode(...new Uint8Array(buffer));
  }
};

const safeNumber = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value || '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const normalizeUnit = (value) => String(value || '').trim();

const buildKey = (name, unit) => `${normalizeIngredientKey(name)}@@${normalizeUnit(unit)}`;

const isNotFoundError = (error) => {
  const raw = error?.statusCode ?? error?.status ?? null;
  const status = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (status === 404) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('not found') || msg.includes('object not found');
};

const isAlreadyExistsError = (error) => {
  const raw = error?.statusCode ?? error?.status ?? null;
  const status = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (status === 409) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('already exists') || msg.includes('duplicate') || msg.includes('409');
};

const parseResponseJsonSafe = async (res) => {
  if (!res || typeof res !== 'object') return null;
  const clone = typeof res.clone === 'function' ? res.clone() : res;
  if (!clone || typeof clone.json !== 'function') return null;
  try {
    return await clone.json();
  } catch {
    return null;
  }
};

const isMissingObjectDownloadError = async (error) => {
  // Storage download() uses `noResolveJson: true`, so errors can be StorageUnknownError
  // with `originalError` being a Response. In that case, `error.message` is often "{}".
  if (isNotFoundError(error)) return true;

  const res = error?.originalError;
  const status = typeof res?.status === 'number' ? res.status : null;
  if (status === 404) return true;

  // Supabase Storage returns 400 with JSON { statusCode:"404", error:"not_found", message:"Object not found" }
  // for missing objects.
  if (status === 400) {
    const body = await parseResponseJsonSafe(res);
    const statusCodeRaw = body?.statusCode ?? null;
    const statusCode = typeof statusCodeRaw === 'string' ? parseInt(statusCodeRaw, 10) : statusCodeRaw;
    const errCode = String(body?.error || '').toLowerCase();
    const msg = String(body?.message || '').toLowerCase();
    if (statusCode === 404 && (errCode === 'not_found' || msg.includes('object not found'))) return true;
  }

  return false;
};

const computeDeltaItems = (parsed) => {
  const acc = new Map(); // key -> { name, unit, quantity }
  const slips = parsed?.slips || parsed?.receipts || [];

  slips.forEach((slip) => {
    (slip?.items || []).forEach((it) => {
      const name = String(it?.name || '').trim();
      if (!name) return;
      const unit = normalizeUnit(it?.deliveryUnit || it?.unit || it?.unitName || '');
      const qty = safeNumber(it?.deliveryQty ?? it?.quantity ?? it?.qty);
      if (qty == null) return;
      const key = buildKey(name, unit);
      const prev = acc.get(key);
      if (prev) {
        prev.quantity += qty;
      } else {
        acc.set(key, { name, unit, quantity: qty });
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
    const quantity = safeNumber(it?.quantity) ?? 0;
    map.set(buildKey(name, unit), {
      name,
      unit,
      quantity,
      updatedAt: it?.updatedAt || null,
    });
  });

  deltaItems.forEach((d) => {
    const key = buildKey(d.name, d.unit);
    const prev = map.get(key);
    if (prev) {
      prev.quantity = Math.max(0, (safeNumber(prev.quantity) ?? 0) + (safeNumber(d.quantity) ?? 0));
      prev.updatedAt = nowIso;
    } else {
      map.set(key, {
        name: d.name,
        unit: normalizeUnit(d.unit),
        quantity: Math.max(0, safeNumber(d.quantity) ?? 0),
        updatedAt: nowIso,
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name, 'ja');
    return String(a.unit || '').localeCompare(String(b.unit || ''), 'ja');
  });
};

export const incomingStockService = {
  async _getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user?.id || null;
  },

  _folderPath(userId) {
    if (!userId) throw new Error('User ID is required');
    return `${userId}/${ROOT_FOLDER}`;
  },

  _stockPath(userId) {
    const folder = this._folderPath(userId);
    return `${folder}/${STOCK_FILE_NAME}`;
  },

  _appliedFolder(userId) {
    const folder = this._folderPath(userId);
    return `${folder}/${APPLIED_FOLDER_NAME}`;
  },

  _appliedMarkerPath(userId, baseName) {
    const folder = this._appliedFolder(userId);
    const clean = String(baseName || '').trim();
    if (!clean) throw new Error('baseName is required');
    return `${folder}/${clean}.json`;
  },

  async listAppliedBaseNames(userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) return new Set();

    const folder = this._appliedFolder(effectiveUserId);
    const { data, error } = await supabase.storage.from(BUCKET_NAME).list(folder, {
      limit: 1000,
      sortBy: { column: 'updated_at', order: 'desc' },
    });

    if (error) {
      if (isNotFoundError(error)) return new Set();
      console.error('Failed to list applied markers:', error);
      return new Set();
    }

    const set = new Set();
    (data || []).forEach((f) => {
      const name = String(f?.name || '');
      if (!name.toLowerCase().endsWith('.json')) return;
      set.add(name.replace(/\.json$/i, ''));
    });
    return set;
  },

  async loadStock(userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');

    const path = this._stockPath(effectiveUserId);
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(path);
    if (error) {
      if (await isMissingObjectDownloadError(error)) {
        return { _meta: { version: 1, updatedAt: null }, items: [] };
      }
      throw error;
    }

    const text = await readBlobAsText(data);
    const json = JSON.parse(text || '{}');
    const items = Array.isArray(json?.items) ? json.items : [];
    return {
      _meta: {
        version: 1,
        updatedAt: json?._meta?.updatedAt || null,
      },
      items,
    };
  },

  async saveStock(stock, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');

    const path = this._stockPath(effectiveUserId);
    const payload = {
      _meta: {
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      items: Array.isArray(stock?.items) ? stock.items : [],
    };

    const { error } = await supabase.storage.from(BUCKET_NAME).upload(
      path,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      { upsert: true, contentType: 'application/json' },
    );
    if (error) throw error;
    return payload;
  },

  async applyDeliverySet({ baseName, parsed }, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');
    const cleanBase = String(baseName || '').trim();
    if (!cleanBase) throw new Error('baseName が必要です');
    if (!parsed) throw new Error('解析済みデータが必要です');

    const deltaItems = computeDeltaItems(parsed);
    const nowIso = new Date().toISOString();

    const markerPath = this._appliedMarkerPath(effectiveUserId, cleanBase);
    const markerPayload = {
      baseName: cleanBase,
      appliedAt: nowIso,
      slipCount: (parsed?.slips || parsed?.receipts || []).length || 0,
      itemCount: deltaItems.length,
    };

    // 1) Create marker first (idempotency gate). If it already exists, do not apply.
    const markerRes = await supabase.storage.from(BUCKET_NAME).upload(
      markerPath,
      new Blob([JSON.stringify(markerPayload, null, 2)], { type: 'application/json' }),
      { upsert: false, contentType: 'application/json' },
    );

    if (markerRes.error) {
      if (isAlreadyExistsError(markerRes.error)) {
        return { status: 'already_applied' };
      }
      throw markerRes.error;
    }

    // 2) Update stock
    try {
      const stock = await this.loadStock(effectiveUserId);
      const mergedItems = mergeStockItems(stock.items || [], deltaItems, nowIso);
      await this.saveStock({ items: mergedItems }, effectiveUserId);
      return { status: 'applied', addedCount: deltaItems.length };
    } catch (e) {
      // Best-effort rollback marker if stock update fails
      try {
        await supabase.storage.from(BUCKET_NAME).remove([markerPath]);
      } catch {
        // ignore rollback errors
      }
      throw e;
    }
  },

  async updateStockItem({ name, unit, delta }, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('商品名が必要です');

    // Normalize unit for consistency
    const cleanUnit = normalizeUnit(unit);
    const key = buildKey(cleanName, cleanUnit);
    const numericDelta = safeNumber(delta);

    if (numericDelta === null || !Number.isFinite(numericDelta)) {
      throw new Error('変更数量が無効です');
    }

    const stock = await this.loadStock(effectiveUserId);
    const items = stock.items || [];
    const nowIso = new Date().toISOString();

    let found = false;
    const newItems = items.map(item => {
      const itemKey = buildKey(item.name, item.unit);
      if (itemKey === key) {
        found = true;
        const newQty = Math.max(0, (safeNumber(item.quantity) ?? 0) + numericDelta);
        return { ...item, quantity: newQty, updatedAt: nowIso };
      }
      return item;
    });

    if (!found) {
      // Item not found? Should we error or ignore? 
      // For "consumption", it usually implies item exists. 
      // But if someone tries to consume a phantom item, maybe error.
      throw new Error('対象の在庫が見つかりません');
    }

    // Filter out 0 quantity items? Or keep them?
    // Current logic keeps them. Let's keep them for now so user can see 0 stock.

    await this.saveStock({ items: newItems }, effectiveUserId);
    return { status: 'updated', name: cleanName, unit: cleanUnit };
  },
};
