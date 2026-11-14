import { useState } from 'react';
import { useT } from '../../i18n';
import { borschAPI } from '../../api';
import { track } from '../../analytics';
import { missingFacts, saveMissingFacts, WEIGHT_CHIPS } from '../../utils/borschFacts';
import { getPriceChipsForCountry } from '../../utils/currency';
import style from './FactsQuestion.module.scss';

const UNKNOWN = 'unknown';

/**
 * One optional question on the closing screen of a rating, and only about what
 * the borshch's card is missing: the portion weight, the price, or both.
 *
 * The review is already saved when this shows, so nothing here can cost the
 * person their rating; ignoring it is the same as «Не знаю». Saving goes
 * through utils/borschFacts, which reads the borshch again and writes only the
 * fields that are still empty, so an existing value is never overwritten.
 */
export const FactsQuestion = ({ borsch, country = '', context = {} }) => {
  const t = useT();
  // what to ask is fixed when the screen opens: the data refresh that follows
  // the save must not make the question vanish while it is being answered
  const [asked] = useState(() => missingFacts(borsch));
  const [weight, setWeight] = useState(null);
  const [price, setPrice] = useState(null);
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const priceChips = getPriceChipsForCountry(country);

  if (!borsch || (!asked.weight && !asked.price)) return null;

  // «Не знаю» to everything that was asked: nothing left to say
  const allUnknown = (!asked.weight || weight === UNKNOWN) && (!asked.price || price === UNKNOWN);
  if (allUnknown && state === 'idle') return null;

  const answers = {
    weight: weight !== UNKNOWN ? weight : null,
    price: price !== UNKNOWN ? price : null,
  };
  const hasAnswer = answers.weight !== null || answers.price !== null;

  const save = async () => {
    if (!hasAnswer || state === 'saving') return;
    setState('saving');
    try {
      const { saved } = await saveMissingFacts({ borschId: borsch.id_borsch, answers, api: borschAPI });
      if (saved.weight) track('bowl_weight_added', { borsch_id: borsch.id_borsch, weight_grams: saved.weight, ...context });
      if (saved.price) track('bowl_price_added', { borsch_id: borsch.id_borsch, price: saved.price, ...context });
      window.dispatchEvent(new Event('borschDataUpdated'));
      setState('saved');
    } catch (e) {
      console.error('Не вдалося зберегти ціну чи грамовку:', e);
      setState('error');
    }
  };

  if (state === 'saved') {
    return <p className={style.saved} role="status">{t('facts.saved')}</p>;
  }

  const chipRow = (label, chips, value, setValue, unitKey) => (
    <div className={style.question}>
      <p className={style.label}>{label}</p>
      <div className={style.chips} role="group" aria-label={label}>
        {chips.map((n) => (
          <button
            key={n}
            type="button"
            className={`${style.chip} ${value === n ? style.chipOn : ''}`}
            aria-pressed={value === n}
            onClick={() => setValue(value === n ? null : n)}
          >
            {n} {t(unitKey)}
          </button>
        ))}
        <button
          type="button"
          className={`${style.chip} ${style.unknown} ${value === UNKNOWN ? style.chipOn : ''}`}
          aria-pressed={value === UNKNOWN}
          onClick={() => setValue(value === UNKNOWN ? null : UNKNOWN)}
        >
          {t('facts.unknown')}
        </button>
      </div>
    </div>
  );

  return (
    <section className={style.card} aria-label={t('facts.kicker')}>
      <p className={style.kicker}>{t('facts.kicker')}</p>
      {asked.weight && chipRow(t('facts.weight'), WEIGHT_CHIPS, weight, setWeight, 'flow.unitGram')}
      {asked.price && chipRow(t('facts.price'), priceChips.chips, price, setPrice, priceChips.unit)}
      {hasAnswer && (
        <button type="button" className={style.save} onClick={save} disabled={state === 'saving'}>
          {state === 'saving' ? t('facts.saving') : t('facts.save')}
        </button>
      )}
      {state === 'error' && <p className={style.error} role="alert">{t('facts.error')}</p>}
    </section>
  );
};
