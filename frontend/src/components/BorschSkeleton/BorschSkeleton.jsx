import { useEffect, useState } from 'react';
import style from './BorschSkeleton.module.css';
import { useT } from '../../i18n';

// Must match the opacity transition in BorschSkeleton.module.css — the node
// unmounts right after the fade so the animations stop costing anything.
const FADE_MS = 350;

/**
 * «Борщ вариться» — themed photo-loading placeholder: a slowly pulsing
 * beet-red gradient with bubbles rising off the bottom, like a pot coming
 * to a boil. Shown while an <img> is still loading.
 *
 * `visible` — keep the pot simmering while true; flipping it to false starts
 * a smooth fade-out, after which the node unmounts itself.
 * `className` — for the host to add sizing/rounding (the component itself is
 * position:absolute; inset:0 inside the nearest positioned ancestor).
 *
 * prefers-reduced-motion is honored in CSS: static broth, no bubbles.
 */
export const BorschSkeleton = ({ visible = true, className = '' }) => {
  const t = useT();
  const [gone, setGone] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setGone(false);
      return undefined;
    }
    const id = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(id);
  }, [visible]);

  if (gone) return null;

  return (
    <div
      className={`${style.pot} ${visible ? '' : style.fadeOut} ${className}`}
      role="img"
      aria-label={t('photo.loading')}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={style.bubble} aria-hidden="true" />
      ))}
    </div>
  );
};
