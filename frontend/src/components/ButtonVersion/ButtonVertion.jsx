import style from './ButtonVertion.module.css';

/**
 * Small icon button (share, like) used by the list rows and the map popup.
 *
 * It used to destructure only {icon, onClick, type, label}, so any other prop
 * was silently dropped. The reviews list passed `style` to tint the heart once
 * a borsch was liked and nothing happened — which is exactly the report
 * "зберігається до обраних але не підсвічується кнопка лайка, не зрозуміло чи
 * щось відбулось" (Yuliia, 2026-08-17). A component that quietly ignores props
 * its callers pass is a trap, so the presentation props are explicit now and
 * `pressed` drives both the visual state and the accessible one.
 */
export const ButtonVertion = ({
    icon: Icon,
    onClick,
    type = 'button',
    label,
    style: inlineStyle,
    className = '',
    pressed,
    disabled = false,
}) => {
    const classes = `${style.btn} ${pressed ? style.pressed : ''} ${className}`.trim();
    return (
        <button
            type={type}
            onClick={onClick}
            className={classes}
            style={inlineStyle}
            aria-label={label}
            aria-pressed={pressed === undefined ? undefined : pressed}
            disabled={disabled}
        >
          <Icon />
        </button>
    );
};
