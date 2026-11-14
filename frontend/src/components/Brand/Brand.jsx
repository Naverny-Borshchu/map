import plateUrl from '../../assets/images/plate.svg';
import { useT } from '../../i18n';
import style from './Brand.module.scss';

/**
 * The brand lock-up, as in the landing's header: the borshch plate and the
 * name in MAK, red. The plate is an <img> (one cached file, not 21 KB of
 * inline SVG in the bundle) and keeps its own ink on the dark theme, sitting
 * on a cream disc there.
 *
 * size: 'sm' (map badge), 'md' (headers), 'lg' (sign-in, dialogs)
 * sub:  a line of your own under the name instead of the tagline (the map
 *       badge puts its counter there, so the plaque is one lock-up, not a
 *       lock-up with a caption under it)
 */
export const Brand = ({ size = 'md', tagline = false, sub = null, subClassName = '', className = '', as: Tag = 'span' }) => {
  const t = useT();
  return (
    <Tag className={`${style.brand} ${style[size] || ''} ${className}`.trim()}>
      <span className={`${style.plate} nb-plate`}>
        <img src={plateUrl} alt="" width="44" height="44" />
      </span>
      <span className={style.words}>
        <span className={style.name}>{t('brand.name')}</span>
        {sub !== null && sub !== undefined
          ? <small className={`${style.tagline} ${subClassName}`.trim()}>{sub}</small>
          : tagline && <small className={style.tagline}>{t('brand.tagline')}</small>}
      </span>
    </Tag>
  );
};

export default Brand;
