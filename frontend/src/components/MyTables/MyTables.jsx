import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tablesAPI } from '../../api/tables';
import { tableDate } from '../../utils/tableView';
import { useI18n, useVenueLabel, useCityLabel } from '../../i18n';
import style from './MyTables.module.scss';
import { joinMeta } from '../../utils/dates';

/**
 * «Мої Столи» in the profile: the tables this person hosts (GET /api/tables/),
 * newest first, open ones marked, each a link back to its screen (the QR while
 * it is open, the results once it is closed). Nothing at all for a person who
 * never set one up, so the profile looks as it did.
 */
export const MyTables = ({ className = '' }) => {
  const { t, lang } = useI18n();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  const [tables, setTables] = useState(null);

  useEffect(() => {
    let cancelled = false;
    tablesAPI.listMine()
      .then((list) => { if (!cancelled) setTables(list); })
      .catch(() => { if (!cancelled) setTables([]); });
    return () => { cancelled = true; };
  }, []);

  if (!tables || !tables.length) return null;

  return (
    <section className={`${style.card} ${className}`.trim()} aria-labelledby="my-tables-title">
      <h2 id="my-tables-title" className={style.title}>{t('table.mineTitle')}</h2>
      <p className={style.lead}>{t('table.mineLead')}</p>
      <ul className={style.list}>
        {tables.map((tb) => {
          const venue = venueLabel(tb.place?.name || '');
          const open = tb.status === 'open';
          const meta = joinMeta([
            tb.title ? venue : (tb.place?.city ? cityLabel(tb.place.city) : null),
            tableDate(tb.created_at, lang),
            t('table.borschCount', { count: tb.borsch_count || 0 }),
            t('table.reviewCount', { count: tb.review_count || 0 }),
          ]);
          return (
            <li key={tb.code}>
              <Link to={`/t/${tb.code}`} className={style.row}>
                <span className={style.words}>
                  <span className={style.name}>{tb.title || venue}</span>
                  <span className={style.meta}>{meta}</span>
                </span>
                <span className={`${style.status} ${open ? style.open : ''}`}>
                  {t(open ? 'table.statusOpen' : 'table.statusClosed')}
                </span>
                <span className={style.code}>{tb.code}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
