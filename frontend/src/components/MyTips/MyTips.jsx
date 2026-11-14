import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tipsAPI, tipPoint } from '../../api/tips';
import { useFilters } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { useI18n, useVenueLabel, useCityLabel } from '../../i18n';
import style from '../MyTables/MyTables.module.scss';
import own from './MyTips.module.scss';

// a person's own words go in as they are, never through t(): «$&» in a note must stay «$&»
const quote = (note, lang) => (lang === 'en' ? `“${note}”` : `«${note}»`);

const tipDate = (iso, lang) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'long' });
};

/**
 * «Мої підказки» in the profile: every «Тут є Борщ» this person left
 * (GET /tips/?mine=true), in any state: still grey, confirmed by somebody,
 * rated (the grey bowl became an ordinary pin), or gone. A row opens the map
 * at that venue. Nothing at all for a person who never left one.
 */
export const MyTips = ({ className = '' }) => {
  const { t, lang } = useI18n();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  const navigate = useNavigate();
  const { focusMap } = useFilters();
  const { selectPlace } = usePlaces();
  const [tips, setTips] = useState(null);

  useEffect(() => {
    let cancelled = false;
    tipsAPI.mine()
      .then((list) => { if (!cancelled) setTips(list); })
      .catch(() => { if (!cancelled) setTips([]); });
    return () => { cancelled = true; };
  }, []);

  if (!tips || !tips.length) return null;

  const open = (tip) => {
    const point = tipPoint(tip);
    if (tip.place?.id) selectPlace(tip.place.id);
    if (point) focusMap(point.lat, point.lng, 16);
    navigate('/');
  };

  return (
    <section className={`${style.card} ${className}`.trim()} aria-labelledby="my-tips-title">
      <h2 id="my-tips-title" className={style.title}>{t('tip.mineTitle')}</h2>
      <p className={style.lead}>{t('tip.mineLead')}</p>
      <ul className={style.list}>
        {tips.map((tip) => {
          const meta = [
            tip.place?.city ? cityLabel(tip.place.city) : null,
            tipDate(tip.created_at, lang),
            tip.confirmations ? t('tip.confirmations', { count: tip.confirmations }) : null,
          ].filter(Boolean).join(' · ');
          return (
            <li key={tip.id}>
              <button type="button" className={`${style.row} ${own.row}`} onClick={() => open(tip)}>
                <span className={style.words}>
                  <span className={style.name}>{venueLabel(tip.place?.name || '')}</span>
                  {tip.note && <span className={own.note}>{quote(tip.note, lang)}</span>}
                  <span className={style.meta}>{meta}</span>
                </span>
                <span className={`${style.status} ${own[`st_${tip.status}`] || ''}`}>
                  {t(`tip.status.${tip.status}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
