import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { borschAPI } from '../../api';
import { useT } from '../../i18n';
import { useRequireAuthAction } from '../../hook/useRequireAuthAction';
import style from '../VenueReport/VenueReport.module.scss';

/** The backend's limit (core/borsch_checks.py NAME_MAX). */
export const RENAME_MAX = 120;

/** Which line to show for a failed rename (the API's code, NAV-228). */
export const renameErrorKey = (error) => {
  const code = error?.code;
  if (code === 'same') return 'rename.errSame';
  if (code === 'too_short') return 'rename.errShort';
  if (code === 'too_long') return 'rename.errLong';
  if (code === 'too_many' || error?.status === 429) return 'rename.errTooMany';
  return 'rename.errFailed';
};

/**
 * «Інша назва в меню?» under the borshch's name (NAV-228).
 *
 * 24.11.2026 у «Глеку» назва в меню відрізнялась від назви на мапі, а змінити
 * її було ніде, тож дегустація поставила на мапу другий такий самий Борщ.
 * Тут людина пише назву з меню. Від модератора вона діє одразу, від решти її
 * спершу дивиться AI (той самий Борщ, не інша страва й не жарт), і за
 * хвилину чи дві вона зʼявляється на картці. Потрібен акаунт: гостя веде на вхід.
 */
export const BorschRename = ({ borschId, name }) => {
  const t = useT();
  const { requireAuth } = useRequireAuthAction();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // 'pending' | 'renamed'

  const start = () => requireAuth(() => {
    setValue(name || '');
    setError('');
    setResult(null);
    setOpen(true);
  });

  const close = () => {
    setOpen(false);
    setSending(false);
  };

  const send = async () => {
    const clean = value.trim().replace(/\s+/g, ' ');
    if (!clean || sending) return;
    setSending(true);
    setError('');
    try {
      const answer = await borschAPI.rename(borschId, clean);
      setResult(answer?.status === 'renamed' ? 'renamed' : 'pending');
      if (answer?.status === 'renamed') window.dispatchEvent(new Event('borschDataUpdated'));
    } catch (e) {
      setError(t(renameErrorKey(e), { max: RENAME_MAX }));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button type="button" className={style.trigger} onClick={start}>
        {t('rename.link')}
      </button>

      {open && (
        <Modal onClose={close}>
          <div className={style.sheet} role="dialog" aria-labelledby="borsch-rename-title">
            {result ? (
              <>
                <h2 className={style.title} id="borsch-rename-title">
                  {t(result === 'renamed' ? 'rename.doneTitle' : 'rename.pendingTitle')}
                </h2>
                <p className={style.hint}>
                  {t(result === 'renamed' ? 'rename.doneText' : 'rename.pendingText')}
                </p>
                <div className={style.actions}>
                  <button type="button" className={style.primary} onClick={close}>{t('venue.close')}</button>
                </div>
              </>
            ) : (
              <>
                <h2 className={style.title} id="borsch-rename-title">{t('rename.title')}</h2>
                <p className={style.hint}>{t('rename.hint')}</p>
                <input
                  className={style.input}
                  style={{ minHeight: 48 }}
                  type="text"
                  value={value}
                  maxLength={RENAME_MAX + 10}
                  onChange={(e) => { setValue(e.target.value); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                  aria-label={t('rename.title')}
                  autoComplete="off"
                />
                {error && <p className={style.hint} role="alert">{error}</p>}
                <div className={style.actions}>
                  <button type="button" className={style.ghost} onClick={close}>{t('venue.cancel')}</button>
                  <button
                    type="button"
                    className={style.primary}
                    onClick={send}
                    disabled={sending || !value.trim()}
                  >
                    {sending ? t('rename.sending') : t('rename.send')}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};
