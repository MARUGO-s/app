import { supabase } from '../supabase';

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('音声データの読み込みに失敗しました'));
    reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
    };
    reader.readAsDataURL(blob);
});

export const voiceTranscriptionService = {
    async transcribe(blob, { mimeType, fileName, language = 'ja' } = {}) {
        if (!(blob instanceof Blob)) {
            throw new Error('音声データが不正です');
        }

        const audioBase64 = await blobToBase64(blob);
        if (!audioBase64) {
            throw new Error('音声データが空です');
        }

        const { data, error } = await supabase.functions.invoke('transcribe', {
            body: {
                audioBase64,
                mimeType: mimeType || blob.type || 'audio/webm',
                fileName: fileName || 'voice-input.webm',
                language,
            },
        });

        if (error) {
            throw new Error(error.message || '音声認識リクエストに失敗しました');
        }

        if (data?.success !== true) {
            throw new Error(data?.error || '音声認識に失敗しました');
        }

        return String(data?.text || '').trim();
    },
};
