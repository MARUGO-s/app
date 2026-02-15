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
    /**
     * @param {Blob} blob - 音声データ
     * @param {Object} options
     */
    async transcribe(blob, { mimeType, fileName, language = 'ja', promptContext } = {}) {
        if (!(blob instanceof Blob)) {
            throw new Error('音声データが不正です');
        }

        const audioBase64 = await blobToBase64(blob);
        if (!audioBase64) {
            throw new Error('音声データが空です');
        }

        const body = {
            audioBase64,
            mimeType: mimeType || blob.type || 'audio/webm',
            fileName: fileName || 'voice-input.webm',
            language,
            promptContext: promptContext || null,
        };

        const INVOKE_TIMEOUT_MS = 25000;

        const invokePromise = supabase.functions.invoke('transcribe', { body });
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
                () => reject(new Error('音声認識がタイムアウトしました。ネットワークを確認して再試行してください。')),
                INVOKE_TIMEOUT_MS
            );
        });

        const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

        if (error) {
            throw new Error(error.message || '音声認識リクエストに失敗しました');
        }

        if (data?.success !== true) {
            throw new Error(data?.error || '音声認識に失敗しました');
        }

        return String(data?.text || '').trim();
    },
};
