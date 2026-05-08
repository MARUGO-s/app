import { supabase } from '../supabase';

const TABLE_NAME = 'user_reference_documents';
const LOCAL_WARNING = 'クラウド保存に失敗したため、この操作はローカル保存に切り替えました。';
const MAX_WARNING_QUEUE = 20;
const warningQueue = [];
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getStorageKey = (userId) => `reference_box_docs_${String(userId || '').trim()}`;

const queueWarning = (message) => {
  if (!message) return;
  const last = warningQueue[warningQueue.length - 1];
  if (last === message) return;
  warningQueue.push(message);
  if (warningQueue.length > MAX_WARNING_QUEUE) {
    warningQueue.splice(0, warningQueue.length - MAX_WARNING_QUEUE);
  }
};

const readLocalDocs = (userId) => {
  const key = getStorageKey(userId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveLocalDocs = (userId, docs) => {
  const key = getStorageKey(userId);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(Array.isArray(docs) ? docs : []));
};

const normalizeDoc = (doc) => ({
  id: String(doc?.id || ''),
  title: String(doc?.title || ''),
  body: String(doc?.body || ''),
  attachments: Array.isArray(doc?.attachments) ? doc.attachments : [],
  createdAt: doc?.created_at || doc?.createdAt || new Date().toISOString(),
  updatedAt: doc?.updated_at || doc?.updatedAt || new Date().toISOString(),
});

const sortByUpdatedAtDesc = (items) => (
  [...(items || [])].sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')))
);

const makeLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const makeAttachmentId = () => `shared_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const referenceBoxService = {
  consumeWarnings: () => {
    const messages = [...warningQueue];
    warningQueue.length = 0;
    return messages;
  },

  getAll: async (userId) => {
    const uid = String(userId || '').trim();
    if (!uid) return [];

    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('id, title, body, attachments, created_at, updated_at')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const remoteDocs = sortByUpdatedAtDesc((data || []).map(normalizeDoc));
      saveLocalDocs(uid, remoteDocs);
      return remoteDocs;
    } catch (error) {
      console.warn('referenceBoxService.getAll: fallback to localStorage', error);
      queueWarning(LOCAL_WARNING);
      return sortByUpdatedAtDesc(readLocalDocs(uid).map(normalizeDoc));
    }
  },

  save: async (userId, doc) => {
    const uid = String(userId || '').trim();
    if (!uid) throw new Error('userId is required');

    const now = new Date().toISOString();
    const normalized = {
      id: String(doc?.id || ''),
      title: String(doc?.title || '').trim(),
      body: String(doc?.body || ''),
      attachments: Array.isArray(doc?.attachments) ? doc.attachments : [],
      updatedAt: now,
    };
    if (!normalized.title) {
      normalized.title = String(normalized.attachments?.[0]?.name || '資料');
    }

    const localDocs = readLocalDocs(uid).map(normalizeDoc);
    const currentLocal = localDocs.find((item) => item.id === normalized.id) || null;
    const localSavedDoc = normalizeDoc({
      ...currentLocal,
      ...normalized,
      id: normalized.id || makeLocalId(),
      createdAt: currentLocal?.createdAt || now,
      updatedAt: now,
    });

    const localMerged = sortByUpdatedAtDesc([
      localSavedDoc,
      ...localDocs.filter((item) => item.id !== localSavedDoc.id),
    ]);
    saveLocalDocs(uid, localMerged);

    try {
      if (UUID_LIKE_RE.test(normalized.id)) {
        const { data, error } = await supabase
          .from(TABLE_NAME)
          .update({
            title: normalized.title,
            body: normalized.body,
            attachments: normalized.attachments,
            updated_at: now,
          })
          .eq('id', normalized.id)
          .eq('user_id', uid)
          .select('id, title, body, attachments, created_at, updated_at')
          .single();
        if (error) throw error;

        const saved = normalizeDoc(data);
        const synced = sortByUpdatedAtDesc([
          saved,
          ...localMerged.filter((item) => item.id !== saved.id),
        ]);
        saveLocalDocs(uid, synced);
        return saved;
      }

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert({
          user_id: uid,
          title: normalized.title,
          body: normalized.body,
          attachments: normalized.attachments,
        })
        .select('id, title, body, attachments, created_at, updated_at')
        .single();
      if (error) throw error;

      const saved = normalizeDoc(data);
      const synced = sortByUpdatedAtDesc([
        saved,
        ...localMerged.filter((item) => item.id !== localSavedDoc.id && item.id !== saved.id),
      ]);
      saveLocalDocs(uid, synced);
      return saved;
    } catch (error) {
      console.warn('referenceBoxService.save: fallback to localStorage', error);
      queueWarning(LOCAL_WARNING);
      return localSavedDoc;
    }
  },

  remove: async (userId, documentId) => {
    const uid = String(userId || '').trim();
    const docId = String(documentId || '').trim();
    if (!uid || !docId) return;

    const localDocs = readLocalDocs(uid).map(normalizeDoc);
    saveLocalDocs(uid, localDocs.filter((item) => item.id !== docId));

    if (!UUID_LIKE_RE.test(docId)) return;

    try {
      const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', docId)
        .eq('user_id', uid);
      if (error) throw error;
    } catch (error) {
      console.warn('referenceBoxService.remove: cloud delete failed', error);
      queueWarning(LOCAL_WARNING);
    }
  },

  shareFilesToUsers: async ({ sourceUserId, targetUserIds, files }) => {
    const actorId = String(sourceUserId || '').trim();
    const targets = Array.isArray(targetUserIds) ? targetUserIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
    const rows = Array.isArray(files) ? files : [];
    if (!actorId) throw new Error('source user is required');
    if (targets.length === 0) throw new Error('共有先ユーザーを選択してください。');
    if (rows.length === 0) throw new Error('共有するファイルがありません。');

    let insertedCount = 0;
    for (const targetUserId of targets) {
      for (const file of rows) {
        const attachment = file?.attachment || null;
        if (!attachment?.data) continue;
        const copiedAttachment = {
          ...attachment,
          id: makeAttachmentId(),
          addedAt: new Date().toISOString(),
        };
        const title = String(file?.fileName || attachment?.name || '共有ファイル').trim() || '共有ファイル';
        const { error } = await supabase
          .from(TABLE_NAME)
          .insert({
            user_id: targetUserId,
            title,
            body: '',
            attachments: [copiedAttachment],
          });
        if (error) throw error;
        insertedCount += 1;
      }
    }
    return { insertedCount, targetCount: targets.length, fileCount: rows.length };
  },
};
