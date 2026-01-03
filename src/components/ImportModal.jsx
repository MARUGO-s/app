import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Card } from './Card';
import { Button } from './Button';
import './ImportModal.css';

export const ImportModal = ({ onClose, onImport }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleImport = async () => {
        if (!url) return;

        setIsLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.functions.invoke('scrape-recipe', {
                body: { url }
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            if (!data.recipe) {
                throw new Error("No recipe found at this URL");
            }

            onImport(data.recipe);
            onClose();

        } catch (err) {
            console.error("Import failed:", err);
            setError(err.message || "Failed to import recipe. The site might not support automatic import.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay fade-in">
            <Card className="import-modal-card">
                <h3>Webからレシピを取り込む</h3>
                <p>レシピサイトのURLを入力してください。<br />
                    <small>※ Cookpad, Delish Kitchenなど、主要なサイトに対応しています。</small>
                </p>

                <input
                    type="url"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="import-url-input"
                    autoFocus
                />

                {error && <p className="error-text">{error}</p>}

                <div className="modal-actions">
                    <Button variant="ghost" onClick={onClose} disabled={isLoading}>キャンセル</Button>
                    <Button variant="primary" onClick={handleImport} isLoading={isLoading} disabled={!url}>
                        取り込む
                    </Button>
                </div>
            </Card>
        </div>
    );
};
