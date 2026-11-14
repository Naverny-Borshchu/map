import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { track } from '../../analytics';
import { IconCamera, IconBowl, IconSpoonPlus, IconTable, IconClose, IconChevronRight } from '../Icons';
import style from './BowlChooser.module.scss';

/** Where each choice goes. Exported for the routing test. */
export const CHOOSER_ROUTES = {
  brought: '/bowl/new?from=chooser',
  rate: '/bowl/new?mode=rate&from=chooser',
  table: '/table/new?from=chooser',
  add: '/add-borsch',
};

/**
 * What «Додати борщ» opens: four ways to put a borshch on the map, the one
 * people need most often first. «Мені принесли Борщ» starts a bowl (photo
 * now, rating after the meal), «Оцінити Борщ, який уже скуштував» picks the
 * venue and borshch and goes into the ordinary rating, «Ми зібрались
 * компанією» sets up a table with a QR for everyone at it (stage 2),
 * «Додати новий Борщ» is the add flow as it was. A sheet from the bottom on a phone, a dialog on a
 * desktop.
 */
export const BowlChooser = ({ open, onClose }) => {
  const t = useT();
  const navigate = useNavigate();
  const firstRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    firstRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (choice) => {
    track('add_chooser_pick', { choice });
    onClose();
    navigate(CHOOSER_ROUTES[choice]);
  };

  const option = (choice, Icon, title, hint, primary = false, ref = null) => (
    <button
      ref={ref}
      type="button"
      className={`${style.option} ${primary ? style.primary : ''}`}
      onClick={() => go(choice)}
    >
      <span className={style.icon} aria-hidden="true"><Icon size={26} /></span>
      <span className={style.words}>
        <span className={style.title}>{title}</span>
        <span className={style.hint}>{hint}</span>
      </span>
      <span className={style.chevron} aria-hidden="true"><IconChevronRight /></span>
    </button>
  );

  return ReactDOM.createPortal(
    <div className={style.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={style.sheet} role="dialog" aria-modal="true" aria-labelledby="bowl-chooser-title">
        <div className={style.top}>
          <div>
            <p className={style.kicker}>{t('bowl.chooserKicker')}</p>
            <h2 id="bowl-chooser-title" className={style.heading}>{t('bowl.chooserTitle')}</h2>
          </div>
          <button type="button" className={style.close} onClick={onClose} aria-label={t('card.close')}>
            <IconClose size={22} />
          </button>
        </div>
        <div className={style.options}>
          {option('brought', IconCamera, t('bowl.optBrought'), t('bowl.optBroughtHint'), true, firstRef)}
          {option('rate', IconBowl, t('bowl.optRate'), t('bowl.optRateHint'))}
          {option('table', IconTable, t('bowl.optTable'), t('bowl.optTableHint'))}
          {option('add', IconSpoonPlus, t('bowl.optAdd'), t('bowl.optAddHint'))}
        </div>
      </div>
    </div>,
    document.body
  );
};
