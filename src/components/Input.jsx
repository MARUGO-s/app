import React from 'react';
import './Input.css';

export const Input = ({ label, id, error, textarea, ...props }) => {
    const Component = textarea ? 'textarea' : 'input';

    return (
        <div className={`input-group ${error ? 'input-group--error' : ''} ${props.wrapperClassName || ''}`}>
            {label && <label htmlFor={id} className="input-label">{label}</label>}
            <Component
                id={id}
                className={`input-field ${props.className || ''}`}
                style={props.style}
                {...props}
            />
            {error && <span className="input-error">{error}</span>}
        </div>
    );
};
