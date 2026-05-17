const e=`import { supabase } from '../supabase';

const TABLE_NAME = 'user_reference_documents';
const MAX_WARNING_QUEUE = 20;
const MAX_WARNING_LENGTH = 520;
const warningQueue = [];
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const truncateForWarning = (text) => {
  const s = String(text || '').trim();
  if (s.length <= MAX_WARNING_LENGTH) return s;
  return \`\${s.slice(0, MAX_WARNING_LENGTH)}…\`;
};

/** Supabase / PostgREST のエラーをユーザー向け短文にする */
const formatSupabaseError = (error) => {
  if (!error) return '不明なエラー';
  const msg = String(error.message || error.details || error).trim() || '不明なエラー';
  const code = error.code ? \` [\${error.code}]\` : '';
  const hint = error.hint ? \` — \${String(error.hint).trim()}\` : '';
  let extra = '';
  const c = String(error.code || '');
  const low = msg.toLowerCase();
  if (c === '42P01' || low.includes('does not exist')) {
    extra = ' — プロジェクトの Supabase に \`user_reference_documents\` 用マイグレーションが当たっているか確認してください。';
  } else if (c === '42501' || low.includes('permission denied') || low.includes('row-level security')) {
    extra = ' — RLS（行レベルセキュリティ）またはログイン状態を確認してください。';
  } else if (c === 'PGRST301' || low.includes('jwt')) {
    extra = ' — 一度ログアウトして再ログインしてください。';
  } else if (low.includes('quota') || c === '22' || low.includes('exceeded')) {
    extra = ' — ブラウザの保存領域（localStorage）の容量不足のことがあります。';
  }
  return truncateForWarning(\`\${msg}\${code}\${hint}\${extra}\`);
};

const getStorageKey = (userId) => \`reference_box_docs_\${String(userId || '').trim()}\`;

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
  try {
    const lite = docsForLocalCache(Array.isArray(docs) ? docs : []);
    localStorage.setItem(key, JSON.stringify(lite));
  } catch (e) {
    if (isStorageQuotaError(e)) {
      queueWarning('ブラウザの保存領域が不足し、この端末への資料箱のコピーだけ保存できませんでした。一覧はクラウドから表示されます。サイトデータの整理やファイル数の削減で改善することがあります。');
    } else {
      console.warn('referenceBoxService: localStorage save failed', e);
    }
  }
};

const normalizeDoc = (doc) => ({
  id: String(doc?.id || ''),
  title: String(doc?.title || ''),
  body: String(doc?.body || ''),
  attachments: Array.isArray(doc?.attachments) ? doc.attachments : [],
  createdAt: doc?.created_at || doc?.createdAt || new Date().toISOString(),
  updatedAt: doc?.updated_at || doc?.updatedAt || new Date().toISOString(),
});

const isStorageQuotaError = (e) => {
  if (!e) return false;
  const name = String(e.name || '');
  const msg = String(e.message || e || '').toLowerCase();
  return name === 'QuotaExceededError' || msg.includes('quota') || e.code === 22;
};

/** localStorage 用に添付の base64 data を除いた軽量コピー（容量超過と誤判定を防ぐ） */
const docsForLocalCache = (docs) => (
  (Array.isArray(docs) ? docs : []).map((doc) => ({
    ...doc,
    attachments: (Array.isArray(doc.attachments) ? doc.attachments : []).map((att) => {
      if (!att || typeof att !== 'object') return att;
      if (!Object.prototype.hasOwnProperty.call(att, 'data')) return att;
      const { data: _omit, ...rest } = att;
      return rest;
    }),
  }))
);

const sortByUpdatedAtDesc = (items) => (
  [...(items || [])].sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')))
);

const makeLocalId = () => \`local_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`;

export const referenceBoxService = {
  consumeWarnings: () => {
    const messages = [...warningQueue];
    warningQueue.length = 0;
    return messages;
  },

  getAll: async (userId) => {
    const uid = String(userId || '').trim();
    if (!uid) return [];

    let remoteDocs;
    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('id, title, body, attachments, created_at, updated_at')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      remoteDocs = sortByUpdatedAtDesc((data || []).map(normalizeDoc));
    } catch (error) {
      console.warn('referenceBoxService.getAll: Supabase fetch failed, fallback to localStorage', error);
      const localFallback = sortByUpdatedAtDesc(readLocalDocs(uid).map(normalizeDoc));
      queueWarning(
        \`クラウドから資料箱を読み込めませんでした。\${localFallback.length ? 'この端末に保存済みの内容を表示しています。' : '表示できるのはこの端末に保存済みの分のみです。'} 原因: \${formatSupabaseError(error)}\`,
      );
      return localFallback;
    }

    saveLocalDocs(uid, remoteDocs);
    return remoteDocs;
  },

  fetchOwnedShareGrants: async () => {
    const { data, error } = await supabase.rpc('list_reference_shares_owned');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },

  fetchSharedIncoming: async () => {
    const { data, error } = await supabase.rpc('list_shared_reference_attachments_for_viewer');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },

  /** 添付ごとの「誰に見せるか」を置き換える（ファイルのコピーは作らない） */
  setAttachmentShares: async ({ documentId, attachmentId, viewerUserIds }) => {
    const docId = String(documentId || '').trim();
    const attId = String(attachmentId || '').trim();
    if (!UUID_LIKE_RE.test(docId)) {
      throw new Error('共有できるのはクラウドに保存済みの資料のみです。');
    }
    if (!attId) throw new Error('attachment id is required');
    const targets = (Array.isArray(viewerUserIds) ? viewerUserIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const { error } = await supabase.rpc('set_reference_attachment_shares', {
      p_document_id: docId,
      p_attachment_id: attId,
      p_viewer_user_ids: targets,
    });
    if (error) throw error;
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
      queueWarning(\`クラウドへの保存に失敗し、この端末のみに保存しました。原因: \${formatSupabaseError(error)}\`);
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
      queueWarning(\`クラウド上の削除に失敗しました（この端末の一覧からは消えています）。原因: \${formatSupabaseError(error)}\`);
    }
  },
};
`;export{e as default};
