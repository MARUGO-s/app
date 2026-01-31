import React from 'react';
import './Button.css';

/**
 * @param {Object} props
 * @param {'primary' | 'secondary' | 'ghost'} [props.variant='primary']
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {boolean} [props.isLoading=false]
 * @param {boolean} [props.block=false]
 */
export const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading,
    block,
    className = '',
    ...props
}) => {
    const rootClassName = [
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        block ? 'btn--block' : '',
        isLoading ? 'btn--loading' : '',
        className
    ].filter(Boolean).join(' ');

    return (
        <button className={rootClassName} disabled={isLoading} {...props}>
            {isLoading && <span className="btn__spinner" />}
            <span className="btn__content">{children}</span>
        </button>
    );
};
