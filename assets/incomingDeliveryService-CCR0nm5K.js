const e=`import { supabase } from '../supabase.js';

const BUCKET_NAME = 'app-data';
const FOLDER_NAME = 'incoming-deliveries';

const sanitizeFileName = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return 'delivery';
  // Keep simple ASCII-ish names for storage paths.
  return raw
    .replace(/\\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'delivery';
};

const getBaseName = (fileName) => {
  const raw = String(fileName || '');
  const lastDot = raw.lastIndexOf('.');
  if (lastDot <= 0) return raw;
  return raw.slice(0, lastDot);
};

const readBlobAsText = async (blob) => {
  if (!blob) return '';
  const buffer = await blob.arrayBuffer();
  try {
    return new TextDecoder('utf-8').decode(buffer);
  } catch {
    // Very old environments: fallback
    return String.fromCharCode(...new Uint8Array(buffer));
  }
};

export const incomingDeliveryService = {
  async _getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user?.id || null;
  },

  _folderPath(userId) {
    if (!userId) throw new Error('User ID is required');
    return \`\${userId}/\${FOLDER_NAME}\`;
  },

  _filePath(userId, fileName) {
    const folder = this._folderPath(userId);
    const clean = String(fileName || '').replace(/^\\/+/, '');
    return \`\${folder}/\${clean}\`;
  },

  async listJsonFiles(userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) return [];

    const folder = this._folderPath(effectiveUserId);
    const { data, error } = await supabase.storage.from(BUCKET_NAME).list(folder, {
      limit: 200,
      sortBy: { column: 'updated_at', order: 'desc' },
    });

    if (error) {
      console.error('Failed to list incoming deliveries:', error);
      return [];
    }

    return (data || []).filter((f) => String(f?.name || '').toLowerCase().endsWith('.json'));
  },

  async downloadJson(fileName, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');

    const path = this._filePath(effectiveUserId, fileName);
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(path);
    if (error) throw error;

    const text = await readBlobAsText(data);
    return JSON.parse(text);
  },

  async saveDeliverySet({ pdfFile, parsed }, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');
    if (!pdfFile) throw new Error('PDFファイルが必要です');
    if (!parsed) throw new Error('解析結果が必要です');

    const ts = new Date();
    const stamp = \`\${ts.getFullYear()}\${String(ts.getMonth() + 1).padStart(2, '0')}\${String(ts.getDate()).padStart(2, '0')}_\${String(ts.getHours()).padStart(2, '0')}\${String(ts.getMinutes()).padStart(2, '0')}\${String(ts.getSeconds()).padStart(2, '0')}\`;
    const base = sanitizeFileName(getBaseName(pdfFile.name || 'delivery'));
    const baseName = \`\${stamp}_\${base}\`;

    const pdfPath = this._filePath(effectiveUserId, \`\${baseName}.pdf\`);
    const jsonPath = this._filePath(effectiveUserId, \`\${baseName}.json\`);

    // Keep metadata for listing without re-parsing.
    const payload = {
      ...parsed,
      _meta: {
        savedAt: ts.toISOString(),
        originalFileName: pdfFile.name || null,
      },
    };

    const [pdfRes, jsonRes] = await Promise.all([
      supabase.storage.from(BUCKET_NAME).upload(pdfPath, pdfFile, {
        upsert: false,
        contentType: 'application/pdf',
      }),
      supabase.storage.from(BUCKET_NAME).upload(jsonPath, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), {
        upsert: false,
        contentType: 'application/json',
      }),
    ]);

    if (pdfRes.error) throw pdfRes.error;
    if (jsonRes.error) throw jsonRes.error;

    return { baseName, pdfPath, jsonPath };
  },

  async deleteDeliverySet(baseName, userId = null) {
    const effectiveUserId = userId || await this._getCurrentUserId();
    if (!effectiveUserId) throw new Error('ログインが必要です');
    const cleanBase = String(baseName || '').trim();
    if (!cleanBase) throw new Error('baseName が必要です');

    const pdfPath = this._filePath(effectiveUserId, \`\${cleanBase}.pdf\`);
    const jsonPath = this._filePath(effectiveUserId, \`\${cleanBase}.json\`);

    const { data, error } = await supabase.storage.from(BUCKET_NAME).remove([pdfPath, jsonPath]);
    if (error) throw error;
    return data;
  },
};

`;export{e as default};
