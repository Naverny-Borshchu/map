import { directionsUrl } from '../../utils/directions';
import style from './RouteButton.module.scss';
import { IconRoute } from '../Icons';
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
      <IconRoute className={style.icon} />
      {!iconOnly && <span>{text}</span>}
    </a>
  );
};
