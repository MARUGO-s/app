import { supabase } from '../supabase.js';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';

const BUCKET_NAME = 'app-data';
const ROOT_FOLDER = 'incoming-stock';
const STOCK_FILE_NAME = 'stock.json';
const APPLIED_FOLDER_NAME = 'applied';



const safeNumber = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value || '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const normalizeUnit = (value) => String(value || '').trim();

const buildKey = (name, unit, vendor) => {
  const v = String(vendor || '').trim();
  return `${v}@@${normalizeIngredientKey(name)}@@${normalizeUnit(unit)}`;
};

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

    // Use createSignedUrl + fetch to bypass browser cache
    // storage.download() sometimes caches aggressiveley for fixed filenames
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, 60); // 60 seconds is enough for immediate fetch

    if (signError) {
      if (isNotFoundError(signError)) {
        return { _meta: { version: 1, updatedAt: null }, items: [] };
      }
      throw signError;
    }

    try {
      const res = await fetch(signed.signedUrl, { cache: 'no-store' }); // Force network
      if (!res.ok) {
        if (res.status === 404) {
          return { _meta: { version: 1, updatedAt: null }, items: [] };
        }
        throw new Error(`Failed to fetch stock: ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      const json = JSON.parse(text || '{}');
      const items = Array.isArray(json?.items) ? json.items : [];
      return {
        _meta: {
          version: 1,
          updatedAt: json?._meta?.updatedAt || null,
        },
        items,
      };
    } catch (e) {
      console.warn('loadStock fetch failed', e);
      // Fallback: treat as empty if really broken, or rethrow?
      // If we got a signed URL but fetch failed, it might be 404 or network.
      // Let's assume empty if it looks like a missing file issue, otherwise throw.
      throw e;
    }
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



  async updateStockItem({ name, unit, vendor, delta }, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('商品名が必要です');

    // Normalize unit for consistency
    const cleanUnit = normalizeUnit(unit);
    const cleanVendor = String(vendor || '').trim();

    // Key now includes vendor
    const key = buildKey(cleanName, cleanUnit, cleanVendor);
    const numericDelta = safeNumber(delta);

    if (numericDelta === null || !Number.isFinite(numericDelta)) {
      throw new Error('変更数量が無効です');
    }

    const stock = await this.loadStock(effectiveUserId);
    const items = stock.items || [];
    const nowIso = new Date().toISOString();

    let found = false;
    const newItems = items.map(item => {
      const itemKey = buildKey(item.name, item.unit, item.vendor);
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

  async deleteStockItem({ name, unit, vendor }, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');

    // Normalize keys to find the item to remove
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('商品名が必要です');
    const cleanUnit = normalizeUnit(unit);
    const cleanVendor = String(vendor || '').trim();
    const targetKey = buildKey(cleanName, cleanUnit, cleanVendor);

    const stock = await this.loadStock(effectiveUserId);
    const items = stock.items || [];

    // Filter out the item
    const newItems = items.filter(item => {
      const itemKey = buildKey(item.name, item.unit, item.vendor);
      return itemKey !== targetKey;
    });

    if (newItems.length === items.length) {
      // Item not found, but operation is idempotent so maybe okay? 
      // Or return specific status? Let's just proceed to save (no-op).
    }

    await this.saveStock({ items: newItems }, effectiveUserId);
    return { status: 'deleted', name: cleanName };
  },

  async clearStock(userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');

    // 1. Clear stock file
    const stockPath = this._stockPath(effectiveUserId);
    const emptyPayload = {
      _meta: { version: 1, updatedAt: new Date().toISOString() },
      items: [],
    };
    await supabase.storage.from(BUCKET_NAME).upload(
      stockPath,
      new Blob([JSON.stringify(emptyPayload, null, 2)], { type: 'application/json' }),
      { upsert: true, contentType: 'application/json' }
    );

    // 2. Clear all applied markers
    // Listing all triggers might be heavy if many files, but for now we list 1000 which should cover most.
    const folder = this._appliedFolder(effectiveUserId);
    const { data: list } = await supabase.storage.from(BUCKET_NAME).list(folder, { limit: 1000 });

    if (list?.length) {
      const paths = list.map(f => `${folder}/${f.name}`);
      await supabase.storage.from(BUCKET_NAME).remove(paths);
    }

    return { status: 'cleared' };
  },

  async deleteAppliedMarker(baseName, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');

    const markerPath = this._appliedMarkerPath(effectiveUserId, baseName);
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([markerPath]);

    if (error) {
      if (isNotFoundError(error)) return { status: 'not_found' };
      throw error;
    }
    return { status: 'deleted' };
  },
};
