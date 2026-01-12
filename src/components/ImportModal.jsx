import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Card } from './Card';
import { Button } from './Button';
import './ImportModal.css';

export const ImportModal = ({ onClose, onImport, initialMode = 'url' }) => {
    const [mode, setMode] = useState(initialMode); // 'url' | 'image'
    const [url, setUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragActive(true);
        } else if (e.type === "dragleave") {
            setIsDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
            }
        }
    };

    const handleImport = async () => {
        setIsLoading(true);
        setError(null);

        try {
            let data;

            if (mode === 'url') {
                if (!url) return;
                const { data: resData, error: resError } = await supabase.functions.invoke('scrape-recipe', {
                    body: { url }
                });
                if (resError) throw resError;
                data = resData;
            } else {
                if (!imageFile) return;
                const formData = new FormData();
                formData.append('image', imageFile);

                const { data: resData, error: resError } = await supabase.functions.invoke('analyze-image', {
                    body: formData
                });
                if (resError) throw resError;
                data = resData;
            }

            if (data.error) throw new Error(data.error);
            if (!data.recipe) throw new Error("No recipe found");

            onImport(data.recipe);
            onClose();

        } catch (err) {
            console.error("Import failed details:", err);
            const msg = err.message || "Import failed. Please try again.";
            setError(msg);
            alert(`Error: ${msg}`); // Temporary Alert for debugging
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    return (
        <div className="modal-overlay fade-in">
            <Card className="import-modal-card">
                <h3 className="modal-title">レシピを取り込む</h3>

                <div className="import-mode-tabs">
                    <button
                        onClick={() => setMode('url')}
                        className={`tab-btn tab-import-web ${mode === 'url' ? 'active' : ''}`}
                    >
                        🌐 Web URL
                    </button>
                    <button
                        onClick={() => setMode('image')}
                        className={`tab-btn tab-import-image ${mode === 'image' ? 'active' : ''}`}
                    >
                        📷 画像解析 (Best Effort)
                    </button>
                </div>

                {mode === 'url' ? (
                    <>
                        <p>レシピサイトのURLを入力してください。</p>
                        <input
                            type="url"
                            placeholder="https://..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="import-url-input"
                            autoFocus
                        />
                    </>
                ) : (
                    <>
                        <p>レシピの画像（スクリーンショットや写真）をアップロードしてください。</p>
                        <div className="image-upload-wrapper">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                id="recipe-image-upload"
                                className="image-upload-input"
                            />
                            <label
                                htmlFor="recipe-image-upload"
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                className={`image-upload-label ${isDragActive ? 'drag-active' : ''}`}
                            >
                                {imagePreview ? (
                                    <img src={imagePreview} alt="Preview" className="image-upload-preview" />
                                ) : (
                                    isDragActive ? "ここに画像をドロップ" : "クリックして画像を選択、またはドラッグ＆ドロップ"
                                )}
                            </label>
                        </div>
                    </>
                )}

                {error && <p className="error-text">{error}</p>}

                <div className="modal-actions">
                    <Button variant="ghost" onClick={onClose} disabled={isLoading}>キャンセル</Button>
                    <Button
                        variant="primary"
                        onClick={handleImport}
                        isLoading={isLoading}
                        disabled={mode === 'url' ? !url : !imageFile}
                    >
                        取り込む
                    </Button>
                </div>
            </Card>
        </div>
    );
};
