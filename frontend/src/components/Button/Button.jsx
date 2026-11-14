import style from './Button.module.scss';

export const Button = ({
                    name,
                    onClick,
                    disabled = false,
                    type = 'button',
                    className = '',
                }) => (
    <button
        type={type}
        onClick={onClick}
        className={`${style.btn} ${className}`.trim()}
        disabled={disabled}
    >
        {name}
    </button>
);
