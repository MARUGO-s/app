import { supabase } from '../supabase.js';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';

const BUCKET_NAME = 'app-data';
// No fixed FILE_PATH anymore

export const purchasePriceService = {
    _cacheByUserId: new Map(), // userId -> Map(normalizedNameKey -> {price,...})
    _historyCacheByUserId: new Map(), // userId -> Map(normalizedNameKey -> entry[])

    async _getCurrentUserId() {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        return data?.user?.id || null;
    },

    _getUserScopedPath(userId, fileName) {
        // Always store under <auth_uid>/filename.csv
        if (!userId) throw new Error('User ID is required');
        const clean = String(fileName || '').replace(/^\/+/, '');
        return `${userId}/${clean}`;
    },

    /**
     * Clear the in-memory cache
     */
    clearCache(userId = null) {
        if (userId) {
            this._cacheByUserId.delete(userId);
            this._historyCacheByUserId.delete(userId);
        } else {
            this._cacheByUserId.clear();
            this._historyCacheByUserId.clear();
        }
    },

    async _downloadAllCsvTexts(effectiveUserId) {
        const { data: files, error: listError } = await supabase.storage
            .from(BUCKET_NAME)
            .list(effectiveUserId);

        if (listError) {
            console.warn('Failed to list price files:', listError.message);
            return [];
        }

        if (!files || files.length === 0) {
            return [];
        }

        const promises = files
            // Some environments upload files as ".CSV". Treat extension case-insensitively.
            .filter(f => String(f?.name || '').toLowerCase().endsWith('.csv'))
            .map(async (file) => {
                const path = this._getUserScopedPath(effectiveUserId, file.name);
                const { data, error } = await supabase.storage
                    .from(BUCKET_NAME)
                    .download(path);

                if (error) {
                    console.error(`Failed to download ${file.name}:`, error);
                    return null;
                }

                const buffer = await data.arrayBuffer();
                // Some Android/WebView environments don't support Shift-JIS in TextDecoder.
                // Fallback to UTF-8 to avoid "Loading..." deadlocks on mobile.
                try {
                    const decoder = new TextDecoder('shift-jis');
                    return { fileName: file.name, text: decoder.decode(buffer) };
                } catch (e) {
                    try {
                        const decoder = new TextDecoder('utf-8');
                        return { fileName: file.name, text: decoder.decode(buffer) };
                    } catch {
                        console.warn('TextDecoder failed (shift-jis/utf-8). Skipping file:', file.name, e);
                        return null;
                    }
                }
            });

        const results = await Promise.all(promises);
        return results.filter(Boolean);
    },

    /**
     * Fetches the material price list from Supabase Storage.
     * Returns a Map where keys are material names and values are prices.
     */
    async fetchPriceList(userId = null) {
        const effectiveUserId = userId || await this._getCurrentUserId();
        if (!effectiveUserId) return new Map();

        const cached = this._cacheByUserId.get(effectiveUserId);
        if (cached) return cached;

        try {
            // 1. Download and Parse all CSVs
            const masterMap = new Map(); // Key: normalizedNameKey, Value: { price, vendor, unit, dateStr, displayName }

            const csvFiles = await this._downloadAllCsvTexts(effectiveUserId);
            if (!csvFiles || csvFiles.length === 0) return new Map();

            // 2. Merge Data (by normalized key)
            for (const { text } of csvFiles) {
                if (!text) continue;
                const fileMap = this.parseCSV(text);

                for (const [key, entry] of fileMap) {
                    if (masterMap.has(key)) {
                        const existing = masterMap.get(key);
                        // Keep latest date
                        if ((entry?.dateStr || '') > (existing?.dateStr || '')) {
                            masterMap.set(key, entry);
                        }
                    } else {
                        masterMap.set(key, entry);
                    }
                }
            }

            this._cacheByUserId.set(effectiveUserId, masterMap);
            return masterMap;
        } catch (err) {
            console.error('Error in fetchPriceList:', err);
            return new Map();
        }
    },

    /**
     * Lists all uploaded CSV files.
     */
    async getFileList(userId = null) {
        try {
            const effectiveUserId = userId || await this._getCurrentUserId();
            if (!effectiveUserId) return [];
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .list(effectiveUserId);

            if (error) throw error;
            return data.filter(f => String(f?.name || '').toLowerCase().endsWith('.csv')) || [];
        } catch (err) {
            console.error('Error fetching file list:', err);
            return [];
        }
    },

    /**
     * Uploads a CSV file to Supabase Storage.
     * @param {File} file 
     */
    async uploadPriceList(file, userId = null) {
        try {
            const effectiveUserId = userId || await this._getCurrentUserId();
            if (!effectiveUserId) throw new Error('ログインが必要です');
            // Use original filename, ensuring it's a CSV
            const fileName = file.name; // User wants to save multiples, so we trust reasonable unique names

            this.clearCache(effectiveUserId);
            const path = this._getUserScopedPath(effectiveUserId, fileName);

            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(path, file, {
                    upsert: true,
                    contentType: 'text/csv'
                });

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('Error uploading price list:', err);
            return { success: false, error: err };
        }
    },

    /**
     * Deletes the CSV file from Supabase Storage.
     */
    async deletePriceFile(fileName, userId = null) {
        try {
            const effectiveUserId = userId || await this._getCurrentUserId();
            if (!effectiveUserId) throw new Error('ログインが必要です');
            this.clearCache(effectiveUserId);
            const path = this._getUserScopedPath(effectiveUserId, fileName);
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([path]);

            if (error) throw error;

            // Check if file was actually deleted (if RLS blocks, data might be empty)
            if (!data || data.length === 0) {
                throw new Error('削除に失敗しました。権限がないか、ファイルが見つかりません。');
            }

            return { success: true, data };
        } catch (err) {
            console.error('Error deleting price file:', err);
            return { success: false, error: err };
        }
    },

    /**
     * 全CSVファイルをゴミ箱（trash_price_csvs）へ移動する
     * ProgressCallback: ({ total, done, current }) => void
     */
    async moveAllToTrash(onProgress) {
        const userId = await this._getCurrentUserId();
        if (!userId) throw new Error('ログインが必要です');

        // 1. List all CSV files
        const { data: files, error: listErr } = await supabase.storage
            .from(BUCKET_NAME)
            .list(userId);
        if (listErr) throw listErr;

        const csvFiles = (files || []).filter(f => String(f?.name || '').toLowerCase().endsWith('.csv'));
        const total = csvFiles.length;
        let done = 0;

        if (total === 0) return { moved: 0 };

        const trashRows = [];
        const failedFiles = [];

        for (const file of csvFiles) {
            const path = this._getUserScopedPath(userId, file.name);
            if (onProgress) onProgress({ total, done, current: file.name });

            try {
                // Download file content
                const { data: blob, error: dlErr } = await supabase.storage
                    .from(BUCKET_NAME)
                    .download(path);
                if (dlErr) throw dlErr;

                // Try to read as Shift-JIS, fallback to UTF-8
                const buffer = await blob.arrayBuffer();
                let csvContent = '';
                try {
                    csvContent = new TextDecoder('shift-jis').decode(buffer);
                } catch {
                    csvContent = new TextDecoder('utf-8').decode(buffer);
                }

                trashRows.push({
                    user_id: userId,
                    file_name: file.name,
                    csv_content: csvContent,
                    original_path: path,
                });
            } catch (e) {
                console.error('Failed to read file for trash:', file.name, e);
                failedFiles.push(file.name);
            }
            done++;
        }

        if (onProgress) onProgress({ total, done, current: 'ゴミ箱へ保存中...' });

        // 2. Insert all to trash
        if (trashRows.length > 0) {
            const { error: insertErr } = await supabase
                .from('trash_price_csvs')
                .insert(trashRows);
            if (insertErr) throw insertErr;
        }

        if (onProgress) onProgress({ total, done, current: 'Storageから削除中...' });

        // 3. Delete from Storage
        const pathsToRemove = trashRows.map(r => r.original_path);
        if (pathsToRemove.length > 0) {
            const { error: removeErr } = await supabase.storage
                .from(BUCKET_NAME)
                .remove(pathsToRemove);
            if (removeErr) throw removeErr;
        }

        this.clearCache(userId);
        return { moved: trashRows.length, failed: failedFiles };
    },

    /**
     * 管理者専用: adminロール以外の全ユーザーのCSVファイルをStorageから一括削除する
     * onProgress: ({ total, done, current }) => void
     */
    async adminClearAllNonAdminCsvs(onProgress) {
        const currentUserId = await this._getCurrentUserId();
        if (!currentUserId) throw new Error('ログインが必要です');

        // 1. 全ユーザープロファイルを取得（admin_list_profiles RPCを使用）
        const { data: profiles, error: profErr } = await supabase.rpc('admin_list_profiles');
        if (profErr) throw profErr;

        // 2. adminロール以外のユーザーIDを抽出（自分自身も除外）
        const nonAdminUsers = (profiles || []).filter(p =>
            p.role !== 'admin' && p.id !== currentUserId
        );

        const total = nonAdminUsers.length;
        let done = 0;
        const results = [];

        for (const profile of nonAdminUsers) {
            const targetUserId = profile.id;
            const displayName = profile.email || profile.id;
            if (onProgress) onProgress({ total, done, current: displayName });

            try {
                // ユーザーのCSVファイル一覧を取得
                const { data: files, error: listErr } = await supabase.storage
                    .from(BUCKET_NAME)
                    .list(targetUserId);

                if (listErr) {
                    console.warn(`Failed to list files for ${displayName}:`, listErr.message);
                    results.push({ userId: targetUserId, email: displayName, deleted: 0, error: listErr.message });
                    done++;
                    continue;
                }

                const csvFiles = (files || []).filter(f => String(f?.name || '').toLowerCase().endsWith('.csv'));
                if (csvFiles.length === 0) {
                    results.push({ userId: targetUserId, email: displayName, deleted: 0, error: null });
                    done++;
                    continue;
                }

                const paths = csvFiles.map(f => `${targetUserId}/${f.name}`);
                const { error: removeErr } = await supabase.storage
                    .from(BUCKET_NAME)
                    .remove(paths);

                if (removeErr) {
                    results.push({ userId: targetUserId, email: displayName, deleted: 0, error: removeErr.message });
                } else {
                    results.push({ userId: targetUserId, email: displayName, deleted: csvFiles.length, error: null });
                    this.clearCache(targetUserId);
                }
            } catch (e) {
                results.push({ userId: targetUserId, email: displayName, deleted: 0, error: String(e?.message || e) });
            }
            done++;
        }

        if (onProgress) onProgress({ total, done, current: '完了' });

        const totalDeleted = results.reduce((acc, r) => acc + (r.deleted || 0), 0);
        const failedUsers = results.filter(r => r.error);
        return { results, totalDeleted, failedUsers };
    },

    /**
     * 管理者専用: 指定したユーザーのCSVファイルをStorageから全て削除する
     */
    async adminClearTargetUserCsvs(targetUserId, onProgress) {
        const currentUserId = await this._getCurrentUserId();
        if (!currentUserId) throw new Error('ログインが必要です');

        if (targetUserId === currentUserId) {
            throw new Error('自分自身のデータはこの機能で削除できません');
        }

        if (onProgress) onProgress({ total: 1, done: 0, current: 'ファイル一覧を取得中...' });

        // ユーザーのCSVファイル一覧を取得
        const { data: files, error: listErr } = await supabase.storage
            .from(BUCKET_NAME)
            .list(targetUserId);

        if (listErr) throw listErr;

        const csvFiles = (files || []).filter(f => String(f?.name || '').toLowerCase().endsWith('.csv'));
        if (csvFiles.length === 0) {
            if (onProgress) onProgress({ total: 1, done: 1, current: '完了' });
            return { deleted: 0, error: null };
        }

        const total = csvFiles.length;
        if (onProgress) onProgress({ total, done: 0, current: `削除中... (0/${total})` });

        // Storageから削除
        const paths = csvFiles.map(f => `${targetUserId}/${f.name}`);
        const { error: removeErr } = await supabase.storage
            .from(BUCKET_NAME)
            .remove(paths);

        if (removeErr) throw removeErr;

        if (onProgress) onProgress({ total, done: total, current: '完了' });
        this.clearCache(targetUserId);

        return { deleted: total, error: null };
    },

    _splitFileName(name) {
        const raw = String(name || '');
        const lastDot = raw.lastIndexOf('.');
        if (lastDot <= 0) return { base: raw, ext: '' };
        return { base: raw.slice(0, lastDot), ext: raw.slice(lastDot) };
    },

    _makeCopyFileName(originalName, existingNamesSet) {
        const orig = String(originalName || '');
        if (!existingNamesSet?.has?.(orig)) return orig;

        const { base, ext } = this._splitFileName(orig);
        const safeBase = base || orig || 'price';

        // e.g. "12.csv" -> "12_copy.csv", then "12_copy2.csv"...
        let n = 1;
        // Limit attempts to avoid an infinite loop in weird edge cases.
        while (n < 1000) {
            const suffix = (n === 1) ? '_copy' : `_copy${n}`;
            const candidate = `${safeBase}${suffix}${ext}`;
            if (!existingNamesSet.has(candidate)) return candidate;
            n++;
        }
        // Fallback: timestamp-based unique name
        return `${safeBase}_copy_${Date.now()}${ext}`;
    },

    /**
     * One-time copy (duplicate) price CSV files to another account.
     * Note: This is NOT sync. It simply clones the CSV files under app-data/<sourceUserId>/ to app-data/<targetUserId>/.
     */
    async copyPriceFilesToUser({ targetUserId, sourceUserId = null, onProgress = null } = {}) {
        const effectiveSourceUserId = sourceUserId || await this._getCurrentUserId();
        if (!effectiveSourceUserId) throw new Error('ログインが必要です');

        const destUserId = String(targetUserId || '').trim();
        if (!destUserId) throw new Error('コピー先アカウントを選択してください');
        if (destUserId === effectiveSourceUserId) throw new Error('同じアカウントにはコピーできません');

        const { data: sourceFiles, error: sourceListError } = await supabase.storage
            .from(BUCKET_NAME)
            .list(effectiveSourceUserId);
        if (sourceListError) throw sourceListError;

        const sourceCsvFiles = (sourceFiles || [])
            .map(f => f?.name)
            .filter(Boolean)
            .filter(name => String(name).toLowerCase().endsWith('.csv'));

        const { data: destFiles, error: destListError } = await supabase.storage
            .from(BUCKET_NAME)
            .list(destUserId);

        // If listing fails (rare), treat as empty only for "not found" style errors; otherwise fail.
        let existingDestNames = new Set();
        if (destListError) {
            const msg = String(destListError?.message || '').toLowerCase();
            if (msg.includes('not found') || msg.includes('404')) {
                existingDestNames = new Set();
            } else {
                throw destListError;
            }
        } else {
            existingDestNames = new Set((destFiles || []).map(f => f?.name).filter(Boolean));
        }

        const result = {
            sourceUserId: effectiveSourceUserId,
            targetUserId: destUserId,
            copied: [], // { fromFile, toFile }
            skipped: [], // { file, reason }
            failed: [], // { file, errorMessage }
        };

        const total = sourceCsvFiles.length;
        onProgress?.({ phase: 'start', total, done: 0, current: '' });

        for (let idx = 0; idx < sourceCsvFiles.length; idx++) {
            const fromFile = sourceCsvFiles[idx];
            // Decide target filename (avoid overwriting existing destination files)
            const toFile = this._makeCopyFileName(fromFile, existingDestNames);
            existingDestNames.add(toFile);

            const fromPath = this._getUserScopedPath(effectiveSourceUserId, fromFile);
            const toPath = this._getUserScopedPath(destUserId, toFile);

            onProgress?.({
                phase: 'progress',
                total,
                done: idx,
                current: `${fromFile} → ${toFile}`,
                fromFile,
                toFile,
            });

            try {
                const { data: blob, error: downloadError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .download(fromPath);
                if (downloadError) throw downloadError;
                if (!blob) throw new Error('ファイルのダウンロードに失敗しました');

                // Upload without upsert to avoid accidental overwrite.
                const { error: uploadError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(toPath, blob, {
                        upsert: false,
                        contentType: 'text/csv'
                    });

                if (uploadError) {
                    // If the name unexpectedly conflicts, generate another name and retry a few times.
                    const msg = String(uploadError?.message || '').toLowerCase();
                    if (msg.includes('already exists') || msg.includes('exists') || msg.includes('409')) {
                        let retry = 0;
                        let lastErr = uploadError;
                        while (retry < 5) {
                            retry++;
                            const retryName = this._makeCopyFileName(fromFile, existingDestNames);
                            existingDestNames.add(retryName);
                            const retryPath = this._getUserScopedPath(destUserId, retryName);
                            const { error: retryErr } = await supabase.storage
                                .from(BUCKET_NAME)
                                .upload(retryPath, blob, {
                                    upsert: false,
                                    contentType: 'text/csv'
                                });
                            if (!retryErr) {
                                result.copied.push({ fromFile, toFile: retryName });
                                lastErr = null;
                                break;
                            }
                            lastErr = retryErr;
                        }
                        if (lastErr) throw lastErr;
                        continue;
                    }
                    throw uploadError;
                }

                result.copied.push({ fromFile, toFile });
            } catch (e) {
                console.error('copyPriceFilesToUser failed:', e);
                result.failed.push({ file: fromFile, errorMessage: String(e?.message || e) });
            }

            onProgress?.({
                phase: 'progress',
                total,
                done: idx + 1,
                current: `${fromFile} → ${toFile}`,
                fromFile,
                toFile,
            });
        }

        onProgress?.({ phase: 'done', total, done: total, current: '', result });

        // Caches are per-user. Source didn't change, but destination might be read later in this session.
        this.clearCache(destUserId);
        return result;
    },

    /**
     * Custom Parser for 12.csv format
     * Format: Quoted fields.
     * Indices (0-based):
     * 0: Record Type ("D" for data)
     * 1: Date (YYYY/MM/DD)
     * 14: Ingredient Name
     * 18: Cost
     */
    parseCSV(csvText) {
        const priceMap = new Map(); // Key: normalizedNameKey, Value: { price, vendor, unit, dateStr, displayName }

        // Split lines handling potential CRLF
        const lines = csvText.split(/\r?\n/).filter(line => line.trim());

        if (lines.length === 0) return priceMap;

        // Detect Format
        // Legacy "12.csv" format starts with "D" in the first column of data lines.
        // We check the first few non-empty lines. If any starts with "D,", it's likely legacy.
        // Actually, let's try to parse as Legacy first. If it yields results, good.
        // If not, try Generic.

        const isLegacy = lines.some(line => line.startsWith('D,') || line.startsWith('"D",'));

        if (isLegacy) {
            // --- Legacy Parser (Kept from original) ---
            for (let line of lines) {
                // ... (Existing parsing logic)
                // Simple regex for quoted CSV parsing
                // Matches: "value" OR value
                const matches = [];
                let current = '';
                let inQuote = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') inQuote = !inQuote;
                    else if (char === ',' && !inQuote) { matches.push(current); current = ''; }
                    else current += char;
                }
                matches.push(current);
                const columns = matches.map(val => {
                    val = val.trim();
                    if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
                    return val;
                });

                if (columns[0] !== 'D') continue;

                const dateStr = columns[1];
                const vendor = columns[8];
                const nameRaw = columns[14];
                const priceStr = columns[18];
                const unit = columns[20];

                const displayName = String(nameRaw ?? '').trim();
                const key = normalizeIngredientKey(displayName);

                if (key && priceStr) {
                    const price = parseFloat(priceStr);
                    if (!isNaN(price)) {
                        const entry = { price, vendor, unit, dateStr, displayName };
                        if (priceMap.has(key)) {
                            const existing = priceMap.get(key);
                            // Keep latest date. If same date, keep the last seen row.
                            if ((dateStr || '') >= (existing?.dateStr || '')) priceMap.set(key, entry);
                        } else {
                            priceMap.set(key, entry);
                        }
                    }
                }
            }
        } else {
            // --- Generic Parser ---
            // Assume first row is Header? Or check for keywords.
            // Keywords: Name (材料, 品名), Price (単価, 価格, 原価), Unit (単位), Vendor (業者, 問屋)

            let headerIndices = { name: -1, price: -1, unit: -1, vendor: -1 };
            let startRow = 0;

            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

            // Heuristic detection
            headers.forEach((h, i) => {
                if (['材料', '材料名', '品名', '商品名', 'name', 'item'].some(k => h.includes(k))) headerIndices.name = i;
                if (['単価', '価格', '原価', '金額', 'price', 'cost'].some(k => h.includes(k))) headerIndices.price = i;
                if (['単位', 'unit'].some(k => h.includes(k))) headerIndices.unit = i;
                if (['業者', '問屋', '仕入', 'vendor', 'supplier'].some(k => h.includes(k))) headerIndices.vendor = i;
            });

            // If no header detected, assume order: Name, Price, Unit, Vendor (0, 1, 2, 3)
            if (headerIndices.name === -1 && headerIndices.price === -1) {
                headerIndices = { name: 0, price: 1, unit: 2, vendor: 3 };
                // If first row looks like header (not number in price col), skip it
                const firstRowCols = lines[0].split(',');
                if (isNaN(parseFloat(firstRowCols[1]))) {
                    startRow = 1;
                }
            } else {
                startRow = 1; // Header exists
            }

            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

            for (let i = startRow; i < lines.length; i++) {
                const row = lines[i];
                // basic split (caveat: doesn't handle quoted commas well, but good enough for simple)
                // Use the same robust split logic as above just in case
                const matches = [];
                let current = '';
                let inQuote = false;
                for (let j = 0; j < row.length; j++) {
                    const char = row[j];
                    if (char === '"') inQuote = !inQuote;
                    else if (char === ',' && !inQuote) { matches.push(current); current = ''; }
                    else current += char;
                }
                matches.push(current);
                const columns = matches.map(val => {
                    val = val.trim();
                    if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
                    return val;
                });

                const name = headerIndices.name > -1 ? columns[headerIndices.name] : null;
                const priceStr = headerIndices.price > -1 ? columns[headerIndices.price] : null;
                const unit = headerIndices.unit > -1 ? columns[headerIndices.unit] : '';
                const vendor = headerIndices.vendor > -1 ? columns[headerIndices.vendor] : '';

                const displayName = String(name ?? '').trim();
                const key = normalizeIngredientKey(displayName);

                if (key && priceStr) {
                    const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')); // clean currency symbols
                    if (!isNaN(price)) {
                        // For generic CSV, use current date as 'dateStr' since it's an import? 
                        // Or just empty. If merging with legacy, legacy has dates.
                        // Let's use Today.
                        priceMap.set(key, { price, vendor, unit, dateStr: today, displayName });
                    }
                }
            }
        }

        return priceMap;
    },

    parseCSVEntries(csvText, sourceFile = '') {
        const entries = [];

        const lines = csvText.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) return entries;

        const parseNumberMaybe = (raw) => {
            const s = String(raw ?? '').trim();
            if (!s) return null;
            const n = parseFloat(s.replace(/[^0-9.]/g, ''));
            return Number.isFinite(n) ? n : null;
        };

        const splitRow = (row) => {
            const matches = [];
            let current = '';
            let inQuote = false;
            for (let i = 0; i < row.length; i++) {
                const char = row[i];
                if (char === '"') inQuote = !inQuote;
                else if (char === ',' && !inQuote) { matches.push(current); current = ''; }
                else current += char;
            }
            matches.push(current);
            return matches.map(val => {
                val = val.trim();
                if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
                return val;
            });
        };

        const normalizeDateStr = (raw) => {
            const s = String(raw ?? '').trim();
            if (!s) return '';
            const m1 = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
            if (m1) {
                return `${m1[1]}/${String(m1[2]).padStart(2, '0')}/${String(m1[3]).padStart(2, '0')}`;
            }
            const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
            if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`;
            return s;
        };

        const isLegacy = lines.some(line => line.startsWith('D,') || line.startsWith('"D",'));

        if (isLegacy) {
            for (let line of lines) {
                const columns = splitRow(line);
                if (columns[0] !== 'D') continue;

                const dateStr = normalizeDateStr(columns[1]);
                const vendor = columns[8];
                const nameRaw = columns[14];
                const priceStr = columns[18];
                // Column T (0-based 19) stores incoming quantity ("入荷個数") in the user's CSV.
                const incomingQty = parseNumberMaybe(columns[19]);
                const unit = columns[20];

                const displayName = String(nameRaw ?? '').trim();
                const key = normalizeIngredientKey(displayName);
                if (!key || !priceStr) continue;

                const price = parseNumberMaybe(priceStr);
                if (!Number.isFinite(price)) continue;

                entries.push({
                    key,
                    displayName,
                    price,
                    vendor,
                    unit,
                    dateStr,
                    incomingQty,
                    sourceFile
                });
            }
            return entries;
        }

        // --- Generic CSV Parser (history) ---
        let headerIndices = { name: -1, price: -1, unit: -1, vendor: -1, date: -1, quantity: -1 };
        let startRow = 0;

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        headers.forEach((h, i) => {
            const lower = String(h || '').toLowerCase();
            if (['材料', '材料名', '品名', '商品名', 'name', 'item'].some(k => lower.includes(k))) headerIndices.name = i;
            if (['単価', '価格', '原価', '金額', 'price', 'cost'].some(k => lower.includes(k))) headerIndices.price = i;
            if (['単位', 'unit'].some(k => lower.includes(k))) headerIndices.unit = i;
            if (['業者', '問屋', '仕入', 'vendor', 'supplier'].some(k => lower.includes(k))) headerIndices.vendor = i;
            if (['日付', '入荷日', '納品日', 'date'].some(k => lower.includes(k))) headerIndices.date = i;
            if (['数量', '個数', '入荷', '入荷数', '入荷個数', 'qty', 'quantity'].some(k => lower.includes(k))) headerIndices.quantity = i;
        });

        if (headerIndices.name === -1 && headerIndices.price === -1) {
            headerIndices = { name: 0, price: 1, unit: 2, vendor: 3, date: -1, quantity: -1 };
            const firstRowCols = lines[0].split(',');
            if (isNaN(parseFloat(firstRowCols[1]))) startRow = 1;
        } else {
            startRow = 1;
        }

        const today = normalizeDateStr(new Date().toISOString().slice(0, 10));

        for (let i = startRow; i < lines.length; i++) {
            const columns = splitRow(lines[i]);
            const name = headerIndices.name > -1 ? columns[headerIndices.name] : null;
            const priceStr = headerIndices.price > -1 ? columns[headerIndices.price] : null;
            const unit = headerIndices.unit > -1 ? columns[headerIndices.unit] : '';
            const vendor = headerIndices.vendor > -1 ? columns[headerIndices.vendor] : '';
            const dateRaw = headerIndices.date > -1 ? columns[headerIndices.date] : '';
            const incomingQty = headerIndices.quantity > -1 ? parseNumberMaybe(columns[headerIndices.quantity]) : null;

            const displayName = String(name ?? '').trim();
            const key = normalizeIngredientKey(displayName);
            if (!key || !priceStr) continue;

            const price = parseNumberMaybe(priceStr);
            if (!Number.isFinite(price)) continue;

            entries.push({
                key,
                displayName,
                price,
                vendor,
                unit,
                dateStr: normalizeDateStr(dateRaw) || today,
                incomingQty,
                sourceFile
            });
        }

        return entries;
    },

    async fetchPriceHistory(userId = null) {
        const effectiveUserId = userId || await this._getCurrentUserId();
        if (!effectiveUserId) return new Map();

        const cached = this._historyCacheByUserId.get(effectiveUserId);
        if (cached) return cached;

        try {
            const csvFiles = await this._downloadAllCsvTexts(effectiveUserId);
            if (!csvFiles || csvFiles.length === 0) return new Map();

            const historyMap = new Map(); // key -> entry[]
            for (const { fileName, text } of csvFiles) {
                if (!text) continue;
                const entries = this.parseCSVEntries(text, fileName);
                entries.forEach((entry) => {
                    const key = entry?.key;
                    if (!key) return;
                    if (!historyMap.has(key)) historyMap.set(key, []);
                    historyMap.get(key).push(entry);
                });
            }

            // Sort entries oldest -> newest for stable diffs (UI can reverse)
            for (const arr of historyMap.values()) {
                arr.sort((a, b) => {
                    const da = String(a?.dateStr || '');
                    const db = String(b?.dateStr || '');
                    if (da !== db) return da.localeCompare(db);
                    const pa = Number(a?.price);
                    const pb = Number(b?.price);
                    if (Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pa - pb;
                    return String(a?.sourceFile || '').localeCompare(String(b?.sourceFile || ''));
                });
            }

            this._historyCacheByUserId.set(effectiveUserId, historyMap);
            return historyMap;
        } catch (err) {
            console.error('Error in fetchPriceHistory:', err);
            return new Map();
        }
    },

    /**
     * Helper to get price list as array for UI display
     */
    async getPriceListArray(userId = null) {
        const map = await this.fetchPriceList(userId);
        const array = [];
        for (const [key, data] of map.entries()) {
            if (data && typeof data === 'object') {
                const { displayName, ...rest } = data;
                array.push({ name: displayName || key, ...rest });
            } else {
                array.push({ name: key, price: data });
            }
        }
        // Sort by date desc, then name
        return array.sort((a, b) => {
            if (a.dateStr && b.dateStr) {
                return b.dateStr.localeCompare(a.dateStr);
            }
            return a.name.localeCompare(b.name);
        });
    },

    /**
     * Get price data for a specific ingredient
     * @param {string} name 
     * @returns {Promise<{price: number, unit: string, vendor: string}|null>}
     */
    async getPrice(name, userId = null) {
        if (!name) return null;
        const map = await this.fetchPriceList(userId);
        return map.get(normalizeIngredientKey(name)) || null;
    }
};
