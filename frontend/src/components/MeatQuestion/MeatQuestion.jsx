import { useState } from 'react';
import { useT } from '../../i18n';
import { borschAPI } from '../../api';
import { track } from '../../analytics';
import style from '../FactsQuestion/FactsQuestion.module.scss';

/** What the person may answer, in the order the add flow shows them. */
export const MEAT_CHOICES = [
  { code: 'no_meat', i18n: 'ans.meatNo' },
  { code: 'chicken', i18n: 'ans.meatChicken' },
  { code: 'pork', i18n: 'ans.meatPork' },
  { code: 'beef', i18n: 'ans.meatBeef' },
];

/**
 * «Яке мʼясо в ньому?» on the closing screen of a bowl's rating, when that
 * bowl has just put a new borshch on the map: it is created as «other»
 * (services/bowlTargets), because the bowl asks nothing before the meal.
 *
 * The API lets the creator set the type once, while it is «other»; after that
 * it is a moderator's (backend: one PATCH with type_meat alone). One tap
 * saves. A 403 means somebody already set it, or the borshch is not this
 * person's after all: the question then goes away quietly.
 *
 * borsch   mapped borshch (api mapBorsch); asked only while type_meat is
 *          «other» when the screen opens
 * created  this device created that borshch (bowl draft `borsch.created`)
 */
export const MeatQuestion = ({ borsch, created = false, context = {}, api = borschAPI }) => {
  const t = useT();
  // fixed when the screen opens: the refresh after the save changes type_meat
  const [asked] = useState(() => Boolean(created && borsch?.id_borsch && borsch?.type_meat === 'other'));
  const [state, setState] = useState('idle'); // idle | saving | saved | error | gone
  const [picked, setPicked] = useState(null);

  if (!asked || state === 'gone') return null;

  const choose = async (code) => {
    if (state === 'saving') return;
    setPicked(code);
    setState('saving');
    try {
      await api.update(borsch.id_borsch, { type_meat: code });
      track('meat_set', { borsch_id: borsch.id_borsch, type_meat: code, ...context });
      window.dispatchEvent(new Event('borschDataUpdated'));
      setState('saved');
    } catch (e) {
      if (e?.status === 403) {
        track('meat_set', { borsch_id: borsch.id_borsch, type_meat: code, result: 'forbidden', ...context });
        setState('gone');
        return;
      }
      console.error('Не вдалося зберегти тип мʼяса:', e);
      setState('error');
    }
  };

  const unknown = () => {
    track('meat_set', { borsch_id: borsch.id_borsch, type_meat: 'unknown', ...context });
    setState('gone');
  };

  return (
    <section className={style.card} aria-label={t('meatq.kicker')} data-testid="meat-question">
      <p className={style.kicker}>{t('meatq.kicker')}</p>
      {state === 'saved' ? (
        <p className={style.saved} role="status">{t('facts.saved')}</p>
      ) : (
        <div className={style.question}>
          <p className={style.label}>{t('meatq.label', { name: borsch.name })}</p>
          <div className={style.chips} role="group" aria-label={t('meatq.label', { name: borsch.name })}>
            {MEAT_CHOICES.map((m) => (
              <button
                key={m.code}
                type="button"
                className={`${style.chip} ${picked === m.code ? style.chipOn : ''}`}
                aria-pressed={picked === m.code}
                disabled={state === 'saving'}
                onClick={() => choose(m.code)}
              >
                {t(m.i18n)}
              </button>
            ))}
            <button
              type="button"
              className={`${style.chip} ${style.unknown}`}
              disabled={state === 'saving'}
              onClick={unknown}
            >
              {t('facts.unknown')}
            </button>
          </div>
          {state === 'error' && <p className={style.error} role="alert">{t('facts.error')}</p>}
        </div>
      )}
    </section>
  );
};
