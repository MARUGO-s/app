import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import './CookingMode.css';

export const CookingMode = ({ recipe, steps: propSteps, onClose }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const wakeLockRef = useRef(null);

    // Use passed steps, or fall back to recipe.steps, or try to find them in recipe (robustness)
    const steps = propSteps || recipe.steps || [];
    const currentStep = steps[currentStepIndex];

    // Request Wake Lock on mount
    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLockRef.current = await navigator.wakeLock.request('screen');
                    console.log('Wake Lock is active');
                }
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        };

        requestWakeLock();

        const handleVisibilityChange = async () => {
            if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
                await requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLockRef.current) {
                wakeLockRef.current.release();
                wakeLockRef.current = null;
            }
        };
    }, []);

    // Timer Logic
    useEffect(() => {
        let interval = null;
        if (isTimerRunning && timerSeconds > 0) {
            interval = setInterval(() => {
                setTimerSeconds((prev) => prev - 1);
            }, 1000);
        } else if (timerSeconds === 0 && isTimerRunning) {
            setIsTimerRunning(false);
            // Play sound?
            const audio = new Audio('/timer_end.mp3'); // Assuming file exists or just alert
            // Using a simple beep fallback if no file
            try {
                // Beep logic or alert
                // alert("Timer Finished!"); // Alert blocks UI, maybe just visual
            } catch (e) { }
        }
        return () => clearInterval(interval);
    }, [isTimerRunning, timerSeconds]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const addTime = (sec) => {
        setTimerSeconds(prev => prev + sec);
    };

    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

    // ... (rest of existing hooks)

    const handleNext = () => {
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex(currentStepIndex + 1);
        } else {
            // End of recipe
            setShowCompleteConfirm(true);
        }
    };

    const handlePrev = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(currentStepIndex - 1);
        }
    };

    // Auto-detect timer from text (simple regex)
    useEffect(() => {
        const text = typeof currentStep === 'string' ? currentStep : (currentStep?.text || currentStep?.content || "");
        if (text) {
            // Look for "X分" or "Y秒"
            // Very simple extraction
            // Not auto-setting to avoid overriding manual user set, 
            // but maybe a suggestion button?
        }
    }, [currentStep]);

    const confirmFinish = () => {
        setShowCompleteConfirm(false);
        onClose();
    };

    return (
        <div className="cooking-mode-overlay">
            {showCompleteConfirm && (
                <div className="cooking-modal-overlay">
                    <div className="cooking-modal">
                        <h3>調理を終了しますか？</h3>
                        <p>お疲れ様でした！</p>
                        <div className="cooking-modal-actions">
                            <Button variant="secondary" onClick={() => setShowCompleteConfirm(false)}>キャンセル</Button>
                            <Button variant="primary" onClick={confirmFinish}>終了する</Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="cooking-header">
                <Button variant="ghost" onClick={onClose} style={{ color: 'white' }}>✕ 閉じる</Button>
                <div className="cooking-progress">
                    Step {currentStepIndex + 1} / {steps.length}
                </div>
                <div className="cooking-timer-mini">
                    {/* Mini timer display if running */}
                </div>
            </div>

            <div className="cooking-content">
                <div className="step-card">
                    <h2 className="step-number">Step {currentStepIndex + 1}</h2>
                    <p className="step-text">
                        {typeof currentStep === 'string' ? currentStep : (currentStep?.text || currentStep?.content || "内容がありません")}
                    </p>
                    {/* Image if available for step? Scheme doesn't strictly support per-step images yet, using recipe image as background? No, distracting. */}
                </div>

                {/* Timer Controls */}
                <div className="timer-controls">
                    <div className="timer-displaybox">
                        <span className={`timer-value ${timerSeconds === 0 && isTimerRunning ? 'blink' : ''}`}>
                            {formatTime(timerSeconds)}
                        </span>
                    </div>
                    <div className="timer-buttons">
                        <Button variant="secondary" size="sm" onClick={() => addTime(60)}>+1分</Button>
                        <Button variant="secondary" size="sm" onClick={() => addTime(10)}>+10秒</Button>
                        <Button variant="secondary" size="sm" onClick={() => setTimerSeconds(0)}>クリア</Button>
                        <Button
                            variant={isTimerRunning ? "warning" : "primary"}
                            onClick={() => setIsTimerRunning(!isTimerRunning)}
                        >
                            {isTimerRunning ? '一時停止' : 'スタート'}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="cooking-navigation">
                <Button
                    variant="secondary"
                    onClick={handlePrev}
                    disabled={currentStepIndex === 0}
                    className="nav-btn"
                >
                    ← 前へ
                </Button>
                <Button
                    variant="primary"
                    onClick={handleNext}
                    className="nav-btn main-nav"
                >
                    {currentStepIndex === steps.length - 1 ? '完了' : '次へ →'}
                </Button>
            </div>
        </div>
    );
};
