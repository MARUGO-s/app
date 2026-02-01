import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // Import portal
import { ingredientSearchService } from '../services/ingredientSearchService';
import './AutocompleteInput.css';

/**
 * Autocomplete Input Component
 * Automatically searches for ingredients and displays suggestions.
 * Uses Portal to render suggestions on top of all other layers.
 */
export const AutocompleteInput = ({ value, onChange, placeholder, disabled, onSelect }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const wrapperRef = useRef(null);
    const listRef = useRef(null); // Ref for the list
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    useEffect(() => {
        // Close suggestions when clicking outside
        const handleClickOutside = (event) => {
            // Check if click is inside wrapper or inside the portal list
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target) &&
                listRef.current &&
                !listRef.current.contains(event.target)
            ) {
                setShowSuggestions(false);
            }
        };

        const handleScroll = (e) => {
            // Close on scroll events to prevent detachment, unless scrolling inside the list
            if (listRef.current && listRef.current.contains(e.target)) return;
            setShowSuggestions(false);
        };

        // Update position on resize
        const handleResize = () => {
            if (showSuggestions) calculatePosition();
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, { capture: true }); // Capture scroll globally
        window.addEventListener('resize', handleResize);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, { capture: true });
            window.removeEventListener('resize', handleResize);
        };
    }, [showSuggestions]);

    const calculatePosition = () => {
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom,
                left: rect.left,
                width: rect.width
            });
        }
    };

    // Update position when showing
    useEffect(() => {
        if (showSuggestions) {
            calculatePosition();
        }
    }, [showSuggestions, suggestions]); // Recalc if suggestions change (though height changes, top/left shouldn't, but good practice)

    const handleInputChange = async (e) => {
        const newValue = e.target.value;
        onChange(e); // Propagate change to parent

        if (newValue.length > 0) {
            const results = await ingredientSearchService.search(newValue);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
            setSelectedIndex(-1);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSelect = (item) => {
        // Create a synthetic event to update the input value
        const event = {
            target: { value: item.name }
        };
        onChange(event);
        setShowSuggestions(false);

        // Callback with extra data (price, unit, etc.)
        if (onSelect) {
            onSelect(item);
        }
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0) {
                e.preventDefault();
                handleSelect(suggestions[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    return (
        <div className="autocomplete-wrapper" ref={wrapperRef}>
            <input
                type="text"
                className="input-field autocomplete-input"
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (value && value.length > 0) {
                        calculatePosition();
                        setShowSuggestions(true);
                    }
                }}
                placeholder={placeholder}
                disabled={disabled}
            />
            {showSuggestions && createPortal(
                <ul
                    className="suggestions-list"
                    ref={listRef}
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        zIndex: 9999, // Ensure top layer
                        marginTop: '4px'
                    }}
                >
                    {suggestions.map((item, index) => (
                        <li
                            key={`${item.source}-${index}`}
                            className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <div className="suggestion-main">
                                <span className="suggestion-name">{item.name}</span>
                                <span className="suggestion-source">{item.displaySource}</span>
                            </div>
                            <div className="suggestion-details">
                                {item.price && `¥${Number(item.price).toLocaleString()}`}
                                {item.size && ` / ${item.size}${item.unit}`}
                                {!item.size && item.unit && ` / ${item.unit}`}
                            </div>
                        </li>
                    ))}
                </ul>,
                document.body
            )}
        </div>
    );
};
