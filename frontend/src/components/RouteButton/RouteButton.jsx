import { directionsUrl } from '../../utils/directions';
import style from './RouteButton.module.scss';
import { useT } from '../../i18n';

/**
 * "Прокласти маршрут" — opens Google Maps directions to the place's Business
 * Profile. Renders nothing when the place has neither a name/address nor
 * coordinates, so it never appears as a dead control.
 */
export const RouteButton = ({ place, label, className = '', iconOnly = false }) => {
  const t = useT();
  const text = label || t('card.route');
  const url = directionsUrl(place);
  if (!url) return null;

  return (
    <a
      className={`${iconOnly ? style.iconOnly : style.route} ${className}`.trim()}
      title={iconOnly ? text : undefined}
      aria-label={iconOnly ? text : undefined}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      // the card and the popup behind it have their own click handlers
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={style.icon}>
        <path d="M21.7 11.3 12.7 2.3a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4Zm-9.7 8.3L4.4 12 12 4.4 19.6 12 12 19.6Z"/>
        <path d="M13 8v3H9.5a1.5 1.5 0 0 0-1.5 1.5V16h2v-3h3v3l3.5-3.5L13 9v-1Z"/>
      </svg>
      {!iconOnly && <span>{text}</span>}
    </a>
  );
};
