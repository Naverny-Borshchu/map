import { useMemo, useState } from 'react';
import { ReactComponent as IconDelete } from './close.svg';
import { useFilters } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { useT } from '../../i18n';
import {
  EMPTY_FILTERS,
  MEAT_TYPES,
  PLACE_TYPES,
  PRICE_BUCKETS,
  RATING_CRITERIA,
  countActiveFilters,
  filterBorsches,
} from '../../utils/filtering';
import style from './CardFilters.module.scss';

const OVERALL_STEPS = [0, 7, 8, 9];

const MEAT_I18N = {
  "без м'яса": 'filter.meatNone',
  курка: 'filter.meatChicken',
  свинина: 'filter.meatPork',
  телятина: 'filter.meatBeef',
  інше: 'filter.meatOther',
};
const TYPE_I18N = {
  Ресторан: 'filter.typeRestaurant',
  Кафе: 'filter.typeCafe',
  Бістро: 'filter.typeBistro',
  Паб: 'filter.typePub',
};

/**
 * Filter sheet.
 *
 * Rebuilt around three things the old one lacked:
 *  - nothing selected means no constraint (it used to pre-select every option,
 *    so "filtering" meant deselecting, and a default was indistinguishable
 *    from a deliberate choice);
 *  - the primary button carries the live result count, so nobody applies blind;
 *  - taste criteria are collapsed by default, keeping the common case
 *    (score / meat / price) short.
 */
export const CardFilters = ({ onClose }) => {
  const t = useT();
  const { filters, updateFilters } = useFilters();
  const { applyFilters, allPlaces } = usePlaces();
  const { borsch } = useBorsch();

  const [draft, setDraft] = useState(() => ({ ...EMPTY_FILTERS, ...filters }));
  const [showCriteria, setShowCriteria] = useState(() =>
    Object.values(filters.criteria || {}).some((v) => v > 0)
  );

  const placeById = useMemo(() => {
    const m = new Map((allPlaces || []).map((p) => [String(p.id), p]));
    return (id) => m.get(String(id));
  }, [allPlaces]);

  // The same matcher the map and the list run, so this number is the truth.
  const matchCount = useMemo(
    () => filterBorsches(borsch, placeById, draft).length,
    [borsch, placeById, draft]
  );

  const activeCount = countActiveFilters(draft);

  const toggle = (key, value) =>
    setDraft((d) => {
      const list = d[key] || [];
      return {
        ...d,
        [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
      };
    });

  const setCriterion = (key, value) =>
    setDraft((d) => ({ ...d, criteria: { ...d.criteria, [key]: value } }));

  const apply = (e) => {
    e?.preventDefault?.();
    updateFilters(draft);
    applyFilters({ filters: draft, borsch });
    onClose();
  };

  const reset = () => {
    const cleared = { ...EMPTY_FILTERS, search: draft.search };
    setDraft(cleared);
    setShowCriteria(false);
    // apply at once — the old reset left the map on the previous filter
    updateFilters(cleared);
    applyFilters({ filters: cleared, borsch });
  };

  return (
    <div className={style.sheet}>
      <header className={style.head}>
        <h2 className={style.title}>{t('map.filters')}</h2>
        <div className={style.headActions}>
          {activeCount > 0 && (
            <button type="button" className={style.reset} onClick={reset}>
              {t('filter.reset')}
            </button>
          )}
          <button
            type="button"
            className={style.close}
            onClick={onClose}
            aria-label={t('card.close')}
          >
            <IconDelete />
          </button>
        </div>
      </header>

      <div className={style.body}>
        {/* ---- overall score ---- */}
        <section className={style.section}>
          <h3 className={style.legend}>{t('filter.score')}</h3>
          <div className={style.chips}>
            {OVERALL_STEPS.map((v) => (
              <button
                key={v}
                type="button"
                className={`${style.chip} ${draft.minOverall === v ? style.chipOn : ''}`}
                onClick={() => setDraft((d) => ({ ...d, minOverall: v }))}
              >
                {v === 0 ? t('filter.any') : `${v}+`}
              </button>
            ))}
          </div>
        </section>

        {/* ---- taste criteria (collapsed by default) ---- */}
        <section className={style.section}>
          <button
            type="button"
            className={style.disclosure}
            onClick={() => setShowCriteria((v) => !v)}
            aria-expanded={showCriteria}
          >
            <span className={style.legend}>{t('filter.taste')}</span>
            <span className={style.caret}>{showCriteria ? '▾' : '▸'}</span>
          </button>

          {showCriteria && (
            <div className={style.criteria}>
              {RATING_CRITERIA.map((c) => {
                const value = draft.criteria?.[c.key] || 0;
                return (
                  <div className={style.criterion} key={c.key}>
                    <div className={style.criterionHead}>
                      <span className={style.criterionName}>{t(c.i18n)}</span>
                      <span
                        className={`${style.criterionValue} ${value ? style.criterionOn : ''}`}
                      >
                        {value ? `${value}+` : t('filter.any')}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={value}
                      onChange={(e) => setCriterion(c.key, Number(e.target.value))}
                      className={style.slider}
                      aria-label={t(c.i18n)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---- meat ---- */}
        <section className={style.section}>
          <h3 className={style.legend}>{t('filter.meat')}</h3>
          <div className={style.chips}>
            {MEAT_TYPES.map((m) => (
              <button
                key={m}
                type="button"
                className={`${style.chip} ${draft.meats.includes(m) ? style.chipOn : ''}`}
                onClick={() => toggle('meats', m)}
              >
                {t(MEAT_I18N[m])}
              </button>
            ))}
          </div>
        </section>

        {/* ---- venue type ---- */}
        <section className={style.section}>
          <h3 className={style.legend}>{t('filter.venue')}</h3>
          <div className={style.chips}>
            {PLACE_TYPES.map((p) => (
              <button
                key={p}
                type="button"
                className={`${style.chip} ${draft.types.includes(p) ? style.chipOn : ''}`}
                onClick={() => toggle('types', p)}
              >
                {t(TYPE_I18N[p])}
              </button>
            ))}
          </div>
        </section>

        {/* ---- price ---- */}
        <section className={style.section}>
          <h3 className={style.legend}>{t('filter.price')}</h3>
          <div className={style.chips}>
            <button
              type="button"
              className={`${style.chip} ${!draft.price ? style.chipOn : ''}`}
              onClick={() => setDraft((d) => ({ ...d, price: null }))}
            >
              {t('filter.any')}
            </button>
            {PRICE_BUCKETS.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`${style.chip} ${draft.price === b.key ? style.chipOn : ''}`}
                onClick={() =>
                  setDraft((d) => ({ ...d, price: d.price === b.key ? null : b.key }))
                }
              >
                {b.max === null ? `${b.min}+ ₴` : `${b.min ? `${b.min}–` : '< '}${b.max} ₴`}
              </button>
            ))}
          </div>
          {draft.price && <p className={style.note}>{t('filter.priceNote')}</p>}
        </section>
      </div>

      <footer className={style.footer}>
        <button
          type="button"
          className={`${style.apply} ${matchCount === 0 ? style.applyEmpty : ''}`}
          onClick={apply}
        >
          {matchCount === 0
            ? t('filter.nothingFound')
            : t('filter.show', { count: matchCount })}
        </button>
      </footer>
    </div>
  );
};
