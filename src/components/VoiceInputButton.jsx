import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { useToast } from '../contexts/useToast';
import { voiceTranscriptionService } from '../services/voiceTranscriptionService';

const MIME_TYPE_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4', // Safari (macOS/iOS) often prefers this
    'audio/ogg;codecs=opus',
    'audio/wav',
];

const pickMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    // Check specific types
    for (const candidate of MIME_TYPE_CANDIDATES) {
        if (MediaRecorder.isTypeSupported(candidate)) {
            return candidate;
        }
    }
    return '';
};

// ... (supportsVoiceInput, cleanTranscript, appendWithSpacing are fine) ...
const supportsVoiceInput = () => {
    if (typeof window === 'undefined') return false;
    return Boolean(
        navigator?.mediaDevices?.getUserMedia &&
        typeof window.MediaRecorder !== 'undefined'
    );
};

// 音声認識で末尾に付く「。」「○」「〇」を除去（材料名などで不要な句点・丸を削除）
const cleanTranscript = (text) => {
    let s = String(text || '').trim();
    s = s.replace(/[。○〇]+$/u, '');
    return s.trim();
};

const appendWithSpacing = (existingText, transcript) => {
    const current = String(existingText || '').trim();
    const incoming = cleanTranscript(transcript);
    if (!incoming) return current;
    if (!current) return incoming;
    if (/[。.!?]$/.test(current)) {
        return `${current}\n${incoming}`;
    }
    return `${current}\n${incoming}`;
};

export const VoiceInputButton = ({
    onTranscript,
    getCurrentValue,
    disabled = false,
    size = 'sm',
    className = '',
    label = '音声入力',
    language = 'ja',
    /** 'ingredient' = 材料名入力時用のプロンプトで解析精度を向上 */
    promptContext,
}) => {
    const toast = useToast();
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const chunksRef = useRef([]);
    const isMountedRef = useRef(true);
    const suppressOnStopRef = useRef(false);

    const cleanupStream = () => {
        const stream = mediaStreamRef.current;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
        mediaStreamRef.current = null;
    };

    const resetRecorder = () => {
        mediaRecorderRef.current = null;
        chunksRef.current = [];
    };

    const forceReset = () => {
        console.warn('[VoiceInputButton] Forcing reset. Mounted:', isMountedRef.current);
        try {
            cleanupStream();
            resetRecorder();
        } catch (e) {
            console.error('[VoiceInputButton] cleanup failed:', e);
        } finally {
            // Force state reset regardless of mount state check if user interaction is involved
            // (React might warn about update on unmounted component, but it's better than stuck UI)
            setRecording(false);
            setTranscribing(false);
        }
    };

    const handleStop = async () => {
        // If "recording" is true, users expect to be able to stop it.
        // Even if transcribing is true, checking recorder state is safer.
        if (!recording && !transcribing) return;

        const recorder = mediaRecorderRef.current;

        // If no recorder instance but state says recording, force reset
        if (!recorder) {
            if (recording) forceReset();
            return;
        }

        try {
            if (recorder.state !== 'inactive') {
                recorder.stop();
                setRecording(false);
                setTranscribing(true);
            } else {
                // Already inactive but state implies recording?
                // Wait a bit for onstop? Or just force reset if it's been too long?
                // For now, force reset to unblock the user.
                forceReset();
            }
        } catch (error) {
            console.error('[VoiceInputButton] failed to stop recorder:', error);
            toast.error('録音の停止に失敗しました（リセットします）');
            forceReset();
        }
    };

    const handleStart = async () => {
        if (disabled || recording || transcribing) return;
        if (!supportsVoiceInput()) {
            toast.error('この端末では音声入力が利用できません');
            return;
        }

        try {
            suppressOnStopRef.current = false;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const mimeType = pickMimeType();
            // console.log('[VoiceInputButton] Using mimeType:', mimeType);

            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event?.data?.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onerror = (event) => {
                console.error('[VoiceInputButton] MediaRecorder error:', event?.error || event);
                cleanupStream();
                resetRecorder();
                setRecording(false);
                setTranscribing(false);
                toast.error('録音に失敗しました');
            };

            recorder.onstop = async () => {
                if (suppressOnStopRef.current) {
                    cleanupStream();
                    resetRecorder();
                    if (isMountedRef.current) {
                        setRecording(false);
                        setTranscribing(false);
                    }
                    return;
                }

                if (isMountedRef.current) {
                    setRecording(false);
                    setTranscribing(true);
                }

                try {
                    const usedMimeType = recorder.mimeType || mimeType || 'audio/webm';
                    const blob = new Blob(chunksRef.current, { type: usedMimeType });
                    if (blob.size === 0) {
                        throw new Error('録音データが空です');
                    }

                    const transcript = await voiceTranscriptionService.transcribe(blob, {
                        mimeType: usedMimeType,
                        fileName: `voice-input.${usedMimeType.includes('mp4') ? 'm4a' : 'webm'}`,
                        language,
                        promptContext: promptContext || undefined,
                    });

                    if (!transcript) {
                        toast.warning('音声を認識できませんでした');
                        return;
                    }

                    const currentValue = typeof getCurrentValue === 'function'
                        ? getCurrentValue()
                        : '';
                    const merged = appendWithSpacing(currentValue, transcript);
                    onTranscript?.(merged, transcript);
                    toast.success('音声入力を反映しました');
                } catch (error) {
                    console.error('[VoiceInputButton] transcription failed:', error);
                    toast.error(error?.message || '音声入力に失敗しました');
                } finally {
                    try { cleanupStream(); } catch { }
                    try { resetRecorder(); } catch { }

                    // Force reset regardless of mounted state to fix stuck UI
                    // (React might warn, but user experience is priority)
                    setRecording(false);
                    setTranscribing(false);
                }
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            setRecording(true);
        } catch (error) {
            console.error('[VoiceInputButton] failed to start recording:', error);

            if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
                toast.error('マイクの許可が必要です');
                // Don't need forceReset here as we haven't set recording=true yet?
                // Actually we set it at line 179 inside try... but wait based on lines shown above, setRecording(true) is at the end.
                // If getUserMedia fails, we haven't set recording=true yet.
                // If recorder.start() fails, we might have set it? No, setRecording is after start().
                // But let's be safe.
                forceReset();
                return;
            }
            toast.error('録音を開始できませんでした');
            forceReset();
        }
    };

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            suppressOnStopRef.current = true;
            try {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    mediaRecorderRef.current.stop();
                }
            } catch {
                // noop
            }
            cleanupStream();
            resetRecorder();
        };
    }, []);

    const handleClick = () => {
        if (disabled) return;

        // If stuck in transcribing or recording, allow force reset
        if (transcribing) {
            forceReset();
            return;
        }

        if (recording) {
            handleStop();
            return;
        }
        handleStart();
    };

    const buttonLabel = transcribing
        ? '文字起こし中...'
        : recording
            ? '停止'
            : label;

    return (
        <Button
            type="button"
            variant="secondary"
            size={size}
            onClick={handleClick}
            disabled={disabled} // Allow clicking even if transcribing (to cancel)
            className={['voice-input-btn', recording ? 'is-recording' : '', className].filter(Boolean).join(' ')}
            title={recording ? '録音を停止して文字起こしします' : (transcribing ? 'クリックして中止' : 'マイクで音声入力')}
        >
            {recording ? '■' : (transcribing ? '⏳' : '🎤')} {buttonLabel}
        </Button>
    );
};
