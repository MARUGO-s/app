const n=`import React from 'react';
import './Input.css';
import { normalizeNumericInput } from '../utils/normalizeNumericInput.js';

export const Input = ({ label, id, error, textarea, wrapperClassName, ...props }) => {
    const Component = textarea ? 'textarea' : 'input';
    const isNumericLike = props.type === 'number' || props.inputMode === 'decimal' || props.inputMode === 'numeric';

    const handleChange = (e) => {
        if (!props.onChange) return;
        if (!isNumericLike) {
            props.onChange(e);
            return;
        }

        const raw = e?.target?.value ?? '';
        const normalized = normalizeNumericInput(raw);

        // If nothing changed, keep original event for compatibility.
        if (normalized === raw) {
            props.onChange(e);
            return;
        }

        // Minimal event-like shape used throughout this app.
        props.onChange({
            target: {
                id: e?.target?.id,
                name: e?.target?.name,
                value: normalized,
            }
        });
    };

    return (
        <div className={\`input-group \${error ? 'input-group--error' : ''} \${wrapperClassName || ''}\`}>
            {label && <label htmlFor={id} className="input-label">{label}</label>}
            <Component
                id={id}
                className={\`input-field \${props.className || ''}\`}
                style={props.style}
                {...props}
                onChange={handleChange}
            />
            {error && <span className="input-error">{error}</span>}
        </div>
    );
};
`;export{n as default};
