import style from './ButtonProfile.module.css';

export const ButtonProfile = ({name, onClick, active}) => {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={!!active}
            className={`${style.btn} ${active ? style.active : ''}`}
            onClick={onClick}
        >
            {name}
        </button>
    )
}
