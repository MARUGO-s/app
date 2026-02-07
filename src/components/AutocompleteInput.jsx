import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    const [coords, setCoords] = useState({
        top: 0,
        left: 0,
        width: 0,
        maxHeight: 250,
        placeAbove: true
    });

    const calculatePosition = useCallback(() => {
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            const viewportPadding = 8;
            const gap = 4;
            const spaceAbove = rect.top - viewportPadding;
            const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
            const preferAbove = spaceAbove >= 180 || spaceAbove >= spaceBelow;
            const placeAbove = preferAbove && spaceAbove >= 110;
            const maxHeight = Math.max(110, Math.min(280, placeAbove ? spaceAbove - gap : spaceBelow - gap));

            const baseLeft = rect.left;
            const maxWidth = Math.max(220, window.innerWidth - viewportPadding * 2);
            const width = Math.min(Math.max(rect.width, 220), maxWidth);
            const left = Math.min(
                Math.max(viewportPadding, baseLeft),
                window.innerWidth - viewportPadding - width
            );

            setCoords({
                top: placeAbove ? rect.top - gap : rect.bottom + gap,
                left,
                width,
                maxHeight,
                placeAbove
            });
        }
    }, []);

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
    }, [showSuggestions, calculatePosition]);

    // Update position when showing
    useEffect(() => {
        if (showSuggestions) {
            calculatePosition();
        }
    }, [showSuggestions, suggestions, calculatePosition]); // Recalc if suggestions change (though height changes, top/left shouldn't, but good practice)

    const requestRef = useRef(0); // Track latest request ID
    const timeoutRef = useRef(null); // Debounce timeout

    const handleInputChange = async (e) => {
        const newValue = e.target.value;
        onChange(e); // Propagate change to parent immediately (Input responsiveness)

        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        if (newValue.length === 0) {
            // If empty, hide suggestions
            setShowSuggestions(false);
            return;
        }

        // DEBOUNCE: Wait 150ms before searching (DB search is fast)
        // Reduced from 300ms for better responsiveness with database-level search
        timeoutRef.current = setTimeout(async () => {
            if (newValue.length > 0) {
                const currentRequestId = ++requestRef.current; // Increment ID

                console.log('🔍 AutocompleteInput: Fetching suggestions for:', newValue);
                const results = await ingredientSearchService.search(newValue);

                console.log('📋 AutocompleteInput: Got', results.length, 'suggestions');

                // RACE CONDITION CHECK:
                // Only update state if this is still the latest request
                if (currentRequestId === requestRef.current) {
                    setSuggestions(results);
                    setShowSuggestions(results.length > 0);
                    setSelectedIndex(-1);
                }
            }
        }, 150);
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
                onFocus={async () => {
                    if (value && value.length > 0) {
                        // If already has value, show suggestions
                        calculatePosition();
                        const results = await ingredientSearchService.search(value);
                        setSuggestions(results);
                        setShowSuggestions(results.length > 0);
                    } else {
                        // If empty, trigger search anyway to show all available options
                        calculatePosition();
                        // For empty focus, show recently used or top items
                        // This will be loaded on first keystroke
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
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                        width: `${coords.width}px`,
                        maxHeight: `${coords.maxHeight}px`,
                        transform: coords.placeAbove ? 'translateY(-100%)' : 'none',
                        zIndex: 9999 // Ensure top layer
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
