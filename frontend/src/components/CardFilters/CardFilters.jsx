import { useMemo, useState } from 'react';
import { IconClose as IconDelete } from '../Icons';
import { useFilters } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { useT } from '../../i18n';
import {
  EMPTY_FILTERS,
  MEAT_TYPES,
  PLACE_TYPES,
  PRICE_BUCKETS,
  EXCLUSIVE_TRAITS,
  countActiveFilters,
  filterBorsches,
} from '../../utils/filtering';
import style from './CardFilters.module.scss';

const OVERALL_STEPS = [0, 7, 8, 9];

// «Мʼяса багато» sits with the meat types; the rest of «Який він» together
const DESCRIBE_TRAITS = ['beety', 'thick', 'thin', 'pampushky', 'salo'];

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
 *  - «Який він» (Оцінювання 3.0) describes instead of setting minimums:
 *    «Буряковий», «Густий», «З пампушками». The old «мінімум за критерієм»
 *    allowed «солоність від 7», which is «oversalted».
 */
export const CardFilters = ({ onClose }) => {
  const t = useT();
  const { filters, updateFilters } = useFilters();
  const { applyFilters, allPlaces } = usePlaces();
  const { borsch } = useBorsch();

  const [draft, setDraft] = useState(() => ({ ...EMPTY_FILTERS, ...filters }));

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

  const toggleTrait = (key) =>
    setDraft((d) => {
      const list = d.traits || [];
      if (list.includes(key)) return { ...d, traits: list.filter((x) => x !== key) };
      return { ...d, traits: [...list.filter((x) => x !== EXCLUSIVE_TRAITS[key]), key] };
    });

  const traitChip = (key) => {
    const on = (draft.traits || []).includes(key);
    return (
      <button
        key={key}
        type="button"
        className={`${style.chip} ${on ? style.chipOn : ''}`}
        aria-pressed={on}
        onClick={() => toggleTrait(key)}
      >
        {t(`filter.trait.${key}`)}
      </button>
    );
  };

  const apply = (e) => {
    e?.preventDefault?.();
    updateFilters(draft);
    applyFilters({ filters: draft, borsch });
    onClose();
  };

  const reset = () => {
    const cleared = { ...EMPTY_FILTERS, search: draft.search };
    setDraft(cleared);
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
            {traitChip('meaty')}
          </div>
        </section>

        {/* ---- what it is like (Оцінювання 3.0) ---- */}
        <section className={style.section}>
          <h3 className={style.legend}>
            {t('filter.describe')}
            <span className={style.newTag}>{t('filter.new')}</span>
          </h3>
          <div className={style.chips}>{DESCRIBE_TRAITS.map(traitChip)}</div>
          <p className={style.note}>{t('filter.traitHint')}</p>
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
                {b.max === null
                  ? `${b.min}+ ${t('unit.uah')}`
                  : b.min
                    ? `${b.min}-${b.max} ${t('unit.uah')}`
                    : t('filter.priceUnder', { max: b.max, unit: t('unit.uah') })}
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
