import { useEffect, useState } from 'react';
import { IconMapPin, IconBowl, IconSpoonPlus } from '../Icons';
import heroArt from '../../assets/illustrations/hero.webp';
import { useT } from '../../i18n';
import style from './Onboarding.module.scss';

const SEEN_KEY = 'nb-intro-done';
export const REQUEST_LOCATION_EVENT = 'nb:request-location';

export const hasSeenIntro = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch (e) {
    return true; // no storage — never trap the user behind an intro
  }
};

/**
 * First-run intro.
 *
 * Before this, a first-time visitor's very first interaction with the app was
 * the browser's geolocation prompt — a system dialog asking for their position
 * on behalf of a page they had not yet understood. Denying is the safe answer
 * to that question, and a denial is sticky.
 *
 * So: say what the app is, then ask. The permission request is now attached to
 * a button the user presses on purpose.
 */
export const Onboarding = () => {
  const t = useT();
  const [open, setOpen] = useState(() => !hasSeenIntro());

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const dismiss = (withLocation) => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* ignore */ }
    setOpen(false);
    if (withLocation) {
      window.dispatchEvent(new Event(REQUEST_LOCATION_EVENT));
    }
  };

  return (
    <div className={style.overlay} role="dialog" aria-modal="true" aria-labelledby="nb-intro-title">
      <div className={style.card}>
        <img className={style.art} src={heroArt} alt="" width="560" height="560" />

        <p className={style.kicker}>{t('intro.kicker')}</p>
        <h1 className={style.title} id="nb-intro-title">{t('intro.title')}</h1>
        <p className={style.lead}>{t('intro.lead')}</p>

        {/* Drawn icons, not emoji (brand kit); ratings are bowls, never stars. */}
        <ul className={style.points}>
          <li><span className={style.ic}><IconMapPin /></span>{t('intro.point1')}</li>
          <li><span className={style.ic}><IconBowl /></span>{t('intro.point2')}</li>
          <li><span className={style.ic}><IconSpoonPlus /></span>{t('intro.point3')}</li>
        </ul>

        <button type="button" className={style.cta} onClick={() => dismiss(true)}>
          {t('intro.allow')}
        </button>
        <button type="button" className={style.later} onClick={() => dismiss(false)}>
          {t('intro.later')}
        </button>
        <p className={style.note}>{t('intro.note')}</p>
      </div>
    </div>
  );
};
