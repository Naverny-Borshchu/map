import { useState } from 'react';
import { useT } from '../../i18n';
import { borschAPI } from '../../api';
import { track } from '../../analytics';
import { factAnswer, factsToAsk, saveMissingFacts, WEIGHT_CHIPS } from '../../utils/borschFacts';
import { getPriceChipsForCountry } from '../../utils/currency';
import style from './FactsQuestion.module.scss';

const UNKNOWN = 'unknown';

const formatValue = (n) => {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
};

/**
 * The facts on the closing screen of a rating, never more than two questions
 * (utils/borschFacts factsToAsk):
 *
 *   «only if missing»   the portion weight or the price the card has not got,
 *                       saved only into empty fields (saveMissingFacts)
 *   «Ціна досі 330 грн?» one tap about a value nobody confirmed for half a
 *                       year: «Так» confirms it, «Ні, інша» takes the new one,
 *                       «Пропустити» leaves it (POST confirm_facts)
 *
 * The review is already saved when this shows, so nothing here can cost the
 * person their rating; ignoring it is the same as «Не знаю».
 */
export const FactsQuestion = ({ borsch, country = '', context = {}, api = borschAPI }) => {
  const t = useT();
  // what to ask is fixed when the screen opens: the data refresh that follows
  // the save must not make the question vanish while it is being answered
  const [asked] = useState(() => factsToAsk(borsch));
  const [weight, setWeight] = useState(null);
  const [price, setPrice] = useState(null);
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [confirmMode, setConfirmMode] = useState('ask'); // ask | other
  const [confirmState, setConfirmState] = useState('idle'); // idle | saving | done | skipped | error
  const [other, setOther] = useState('');
  const priceChips = getPriceChipsForCountry(country);

  if (!borsch || !borsch.id_borsch) return null;
  const askMissing = asked.missing.weight || asked.missing.price;
  if (!askMissing && !asked.confirm) return null;

  // «Не знаю» to every missing question: nothing left to say there
  const allUnknown = (!asked.missing.weight || weight === UNKNOWN) && (!asked.missing.price || price === UNKNOWN);
  const missingOpen = askMissing && !(allUnknown && state === 'idle');
  const confirmOpen = Boolean(asked.confirm) && confirmState !== 'skipped';
  if (!missingOpen && !confirmOpen) return null;

  const answers = {
    weight: weight !== UNKNOWN ? weight : null,
    price: price !== UNKNOWN ? price : null,
  };
  const hasAnswer = answers.weight !== null || answers.price !== null;

  const save = async () => {
    if (!hasAnswer || state === 'saving') return;
    setState('saving');
    try {
      const { saved } = await saveMissingFacts({ borschId: borsch.id_borsch, answers, api });
      if (saved.weight) {
        track('bowl_weight_added', { borsch_id: borsch.id_borsch, weight_grams: saved.weight, ...context });
        track('fact_confirm', { field: 'weight', action: 'added', borsch_id: borsch.id_borsch, ...context });
      }
      if (saved.price) {
        track('bowl_price_added', { borsch_id: borsch.id_borsch, price: saved.price, ...context });
        track('fact_confirm', { field: 'price', action: 'added', borsch_id: borsch.id_borsch, ...context });
      }
      window.dispatchEvent(new Event('borschDataUpdated'));
      setState('saved');
    } catch (e) {
      console.error('Не вдалося зберегти ціну чи грамовку:', e);
      setState('error');
    }
  };

  // --- «Ціна досі 330 грн?» -------------------------------------------------
  const field = asked.confirm;
  const unitKey = field === 'weight' ? 'flow.unitGram' : priceChips.unit;
  const current = field === 'weight' ? borsch.weight_value : borsch.price_value;
  const otherValue = field ? factAnswer(field, other) : null;

  const report = (action, extra = {}) =>
    track('fact_confirm', { field, action, borsch_id: borsch.id_borsch, ...extra, ...context });

  const sendConfirm = async (body, action, extra = {}) => {
    setConfirmState('saving');
    try {
      await api.confirmFacts(borsch.id_borsch, body);
      report(action, extra);
      window.dispatchEvent(new Event('borschDataUpdated'));
      setConfirmState('done');
    } catch (e) {
      console.error('Не вдалося підтвердити ціну чи грамовку:', e);
      setConfirmState('error');
    }
  };

  const yes = () => sendConfirm({ confirm: [field] }, 'yes');
  const sendOther = () => {
    if (otherValue === null) return;
    sendConfirm(field === 'weight' ? { weight_grams: otherValue } : { price_uah: otherValue }, 'changed', { value: otherValue });
  };
  const skip = () => {
    report('skip');
    setConfirmState('skipped');
  };

  const chipRow = (label, chips, value, setValue, chipUnitKey) => (
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
            {n} {t(chipUnitKey)}
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

  const missingBlock = missingOpen && (
    state === 'saved' ? (
      <p className={style.saved} role="status">{t('facts.saved')}</p>
    ) : (
      <>
        {asked.missing.weight && chipRow(t('facts.weight'), WEIGHT_CHIPS, weight, setWeight, 'flow.unitGram')}
        {asked.missing.price && chipRow(t('facts.price'), priceChips.chips, price, setPrice, priceChips.unit)}
        {hasAnswer && (
          <button type="button" className={style.save} onClick={save} disabled={state === 'saving'}>
            {state === 'saving' ? t('facts.saving') : t('facts.save')}
          </button>
        )}
        {state === 'error' && <p className={style.error} role="alert">{t('facts.error')}</p>}
      </>
    )
  );

  const confirmQuestion = t(field === 'weight' ? 'facts.stillWeight' : 'facts.stillPrice', {
    value: formatValue(current),
    unit: t(unitKey),
  });

  const confirmBlock = confirmOpen && (
    <div className={style.question} data-testid="fact-confirm">
      {confirmState === 'done' ? (
        <p className={style.saved} role="status">{t('facts.confirmed')}</p>
      ) : (
        <>
          <p className={style.label}>{confirmQuestion}</p>
          {confirmMode === 'ask' && (
            <div className={style.chips}>
              <button type="button" className={`${style.chip} ${style.yes}`} onClick={yes} disabled={confirmState === 'saving'}>
                {t('facts.yes')}
              </button>
              <button type="button" className={style.chip} onClick={() => setConfirmMode('other')} disabled={confirmState === 'saving'}>
                {t('facts.no')}
              </button>
              <button type="button" className={`${style.chip} ${style.unknown}`} onClick={skip} disabled={confirmState === 'saving'}>
                {t('facts.skip')}
              </button>
            </div>
          )}
          {confirmMode === 'other' && (
            <>
              <div className={style.chips} role="group" aria-label={confirmQuestion}>
                {(field === 'weight' ? WEIGHT_CHIPS : priceChips.chips)
                  .filter((n) => Number(n) !== Number(current))
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`${style.chip} ${String(other) === String(n) ? style.chipOn : ''}`}
                      aria-pressed={String(other) === String(n)}
                      onClick={() => setOther(String(n))}
                    >
                      {n} {t(unitKey)}
                    </button>
                  ))}
              </div>
              <label className={style.otherField}>
                <span className="nb-sr-only">{t(field === 'weight' ? 'facts.otherWeight' : 'facts.otherPrice')}</span>
                <input
                  type="number"
                  inputMode={field === 'weight' ? 'numeric' : 'decimal'}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  placeholder={t(field === 'weight' ? 'facts.otherWeight' : 'facts.otherPrice')}
                  data-testid="fact-other"
                />
                <span className={style.otherUnit}>{t(unitKey)}</span>
              </label>
              <div className={style.chips}>
                <button type="button" className={style.save} onClick={sendOther} disabled={otherValue === null || confirmState === 'saving'}>
                  {confirmState === 'saving' ? t('facts.saving') : t('facts.save')}
                </button>
                <button type="button" className={style.skipLink} onClick={skip} disabled={confirmState === 'saving'}>
                  {t('facts.skip')}
                </button>
              </div>
            </>
          )}
          {confirmState === 'error' && <p className={style.error} role="alert">{t('facts.error')}</p>}
        </>
      )}
    </div>
  );

  return (
    <section className={style.card} aria-label={t('facts.kicker')}>
      <p className={style.kicker}>{t('facts.kicker')}</p>
      {missingBlock}
      {confirmBlock}
    </section>
  );
};
