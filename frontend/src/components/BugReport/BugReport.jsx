import { useState } from 'react';
import { LuBug } from 'react-icons/lu';
import { Modal } from '../Modal/Modal';
import { useT } from '../../i18n';
import { reportBug } from '../../analytics';
import style from './BugReport.module.scss';

const MIN_LEN = 5;
const MAX_LEN = 1000;

// Куди писати, коли звіт не доїхав. Той самий акаунт, що й у підвалі
// навігації, — інших каналів, які ми читаємо щодня, у нас просто нема.
const INSTAGRAM = 'https://www.instagram.com/naverny_borshchu/';

/**
 * «Щось зламалось» — один вхід для скарги, жучок поруч із навігацією.
 *
 * Зроблено за зразком того самого віджета в Generect, з двома свідомими
 * відмінностями.
 *
 * Перша: жодного вибору категорії. Людина, у якої щойно щось не спрацювало,
 * не має ще й вгадувати, це «баг» чи «пропозиція» — розбирати простіше тому,
 * хто читає, ніж тому, хто пише.
 *
 * Друга: замість скриншота — посилання на запис сесії. Запис уже вмикається в
 * initAnalytics, і він показує, ЩО людина робила до поломки, а не один кадр
 * після неї. Це та сама причина, з якої Generect чіпляє до звіту і скриншот, і
 * реплей; тут другого достатньо, і це економить залежність на рендер DOM у
 * картинку.
 *
 * Контекст (сторінка, мова, розмір екрана, браузер) збирається мовчки: питати
 * про це у формі означало б просити людину виконати роботу браузера.
 *
 * Екран подяки дивиться на `delivered`. Канал у нас один — PostHog, — і він
 * відвалюється тихо: блокувальник, Do Not Track, відсутній ключ. Сказати
 * «дякуємо» за повідомлення, якого ніхто не отримав, значить змусити людину
 * думати, що про ваду вже знають.
 */
export const BugReport = ({ className = '' }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(null);

  const canSend = message.trim().length >= MIN_LEN;

  const close = () => {
    setOpen(false);
    // Скидаємо лише після закриття, щоб текст не зникав під час набору, якщо
    // модалка перемалюється.
    setMessage('');
    setSent(null);
  };

  const send = () => {
    if (!canSend) return;
    setSent(reportBug(message.trim().slice(0, MAX_LEN)));
  };

  return (
    <>
      <button
        type="button"
        className={`${style.trigger} ${className}`.trim()}
        onClick={() => setOpen(true)}
        aria-label={t('bug.aria')}
        title={t('bug.aria')}
      >
        <LuBug className={style.icon} aria-hidden="true" />
        <span className={style.label}>{t('bug.trigger')}</span>
      </button>

      {open && (
        <Modal onClose={close}>
          <div className={style.sheet}>
            {sent ? (
              <>
                <h2 className={style.title}>
                  {sent.delivered ? t('bug.thanksTitle') : t('bug.failTitle')}
                </h2>
                <p className={style.hint}>
                  {sent.delivered ? t('bug.thanksHint') : t('bug.failHint')}
                </p>
                {!sent.delivered && (
                  <a
                    className={style.fallbackLink}
                    href={INSTAGRAM}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('bug.failLink')}
                  </a>
                )}
                <div className={style.actions}>
                  <button type="button" className={style.primary} onClick={close}>
                    {t('bug.close')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className={style.title}>{t('bug.title')}</h2>
                <p className={style.hint}>{t('bug.hint')}</p>
                <textarea
                  className={style.input}
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
                  placeholder={t('bug.placeholder')}
                  rows={5}
                  autoFocus
                  aria-label={t('bug.title')}
                />
                <div className={style.actions}>
                  <button type="button" className={style.ghost} onClick={close}>
                    {t('bug.cancel')}
                  </button>
                  <button
                    type="button"
                    className={style.primary}
                    onClick={send}
                    disabled={!canSend}
                  >
                    {t('bug.send')}
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
