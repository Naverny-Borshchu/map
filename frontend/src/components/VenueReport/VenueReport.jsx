import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { useT } from '../../i18n';
import { reportVenue } from '../../analytics';
import style from './VenueReport.module.scss';

const MAX_NOTE = 300;
const INSTAGRAM = 'https://www.instagram.com/naverny_borshchu/';

/**
 * «Заклад закрився або переїхав?» — рядок під адресою.
 *
 * У день запуску двоє людей написали про це в чат за першу годину: одна
 * відкрила мапу й побачила поруч місця, що не працюють уже кілька років,
 * інший знайшов заклад, який переїхав з-під купола у двори на Костьольній.
 * Обидва змогли поскаржитись лише тому, що знають автора особисто — в самому
 * застосунку сказати про це не було де.
 *
 * Тут навмисно не вільний текст, а дві кнопки. Людина, яка щойно постояла під
 * зачиненими дверима, не буде складати повідомлення; вона тицьне «Зачинився»
 * і піде. Текст лишається, але необовʼязковий — для деталей на кшталт «тепер
 * у дворі навпроти».
 *
 * Модалка своя, а не спільна з BugReport, свідомо: той віджет зараз їде в
 * релізі, і чіпати його заради спільних стилів означало б міняти вміст
 * релізу, який уже описаний і перевірений. Коли обидва приживуться — варто
 * винести спільний «лист» в один модуль стилів.
 */
export const VenueReport = ({ placeName, placeLabel, placeId, borschId }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(null);

  const close = () => {
    setOpen(false);
    setReason(null);
    setNote('');
    setSent(null);
  };

  const send = () => {
    if (!reason) return;
    setSent(reportVenue({ reason, note: note.trim(), placeId, placeName, borschId }));
  };

  return (
    <>
      <button type="button" className={style.trigger} onClick={() => setOpen(true)}>
        {t('venue.link')}
      </button>

      {open && (
        <Modal onClose={close}>
          <div className={style.sheet}>
            {sent ? (
              <>
                <h2 className={style.title}>
                  {sent.delivered ? t('venue.thanksTitle') : t('venue.failTitle')}
                </h2>
                <p className={style.hint}>
                  {sent.delivered ? t('venue.thanksHint') : t('venue.failHint')}
                </p>
                {!sent.delivered && (
                  <a className={style.fallbackLink} href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
                    {t('venue.failLink')}
                  </a>
                )}
                <div className={style.actions}>
                  <button type="button" className={style.primary} onClick={close}>
                    {t('venue.close')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className={style.title}>{t('venue.title')}</h2>
                <p className={style.hint}>{placeLabel || placeName ? `«${placeLabel || placeName}»` : t('venue.hint')}</p>
                <div className={style.choices} role="group" aria-label={t('venue.title')}>
                  <button
                    type="button"
                    className={`${style.chip} ${reason === 'closed' ? style.chipActive : ''}`}
                    aria-pressed={reason === 'closed'}
                    onClick={() => setReason('closed')}
                  >
                    {t('venue.closed')}
                  </button>
                  <button
                    type="button"
                    className={`${style.chip} ${reason === 'moved' ? style.chipActive : ''}`}
                    aria-pressed={reason === 'moved'}
                    onClick={() => setReason('moved')}
                  >
                    {t('venue.moved')}
                  </button>
                </div>
                <textarea
                  className={style.input}
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
                  placeholder={t('venue.notePlaceholder')}
                  rows={3}
                  aria-label={t('venue.notePlaceholder')}
                />
                <div className={style.actions}>
                  <button type="button" className={style.ghost} onClick={close}>
                    {t('venue.cancel')}
                  </button>
                  <button type="button" className={style.primary} onClick={send} disabled={!reason}>
                    {t('venue.send')}
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
