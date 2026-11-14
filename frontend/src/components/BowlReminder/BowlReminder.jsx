import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBowlDrafts } from '../../hook/useBowlDrafts';
import { deleteDraft, dueDraft, loadDraftPhotos, nextDueAt, snoozeDraft } from '../../services/bowlDrafts';
import { track } from '../../analytics';
import { showToast } from '../Toast';
import { IconBowl } from '../Icons';
import { useT, useVenueLabel, useDishLabel } from '../../i18n';
import style from './BowlReminder.module.scss';

// setTimeout keeps a 32-bit delay; a bowl due in days must not fire at once
const MAX_DELAY = 2 ** 31 - 1;

/**
 * «Як Борщ у закладі «Ватра»?»: the bowl comes back by itself 20 minutes after it was
 * brought, or whenever the app is opened later. Shown on the map, the list and
 * the profile, the screens a person lands on when they pick the phone up
 * again; never over a flow.
 *
 *   Оцінити          moment 2, the rating
 *   Ще їм            ask again in 15 minutes
 *   Не оцінюватиму   drop the bowl
 *
 * Only a banner for now: browser notifications on an iPhone need the app on
 * the home screen, and a Telegram nudge is the next step (concept, decision 2).
 */
export const BowlReminder = () => {
  const t = useT();
  const venueLabel = useVenueLabel();
  const dishLabel = useDishLabel();
  const navigate = useNavigate();
  const bowls = useBowlDrafts();
  const [now, setNow] = useState(() => Date.now());
  const [thumb, setThumb] = useState(null);

  // Wake up exactly when the next bowl becomes due, and whenever the tab is
  // shown again (a phone that slept through the timer).
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    const next = nextDueAt(bowls, Date.now());
    const timer = next ? setTimeout(tick, Math.min(MAX_DELAY, next - Date.now() + 250)) : null;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
      if (timer) clearTimeout(timer);
    };
  }, [bowls, now]);

  const due = useMemo(() => dueDraft(bowls, now), [bowls, now]);
  const dueId = due?.id || null;
  const duePhotos = due?.photoCount || 0;

  useEffect(() => {
    if (!dueId || !duePhotos) {
      setThumb(null);
      return undefined;
    }
    let url = null;
    let cancelled = false;
    loadDraftPhotos(dueId).then((files) => {
      if (cancelled || !files[0]) return;
      url = URL.createObjectURL(files[0]);
      setThumb(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dueId, duePhotos]);

  if (!due) return null;

  const minutes = Math.round((Date.now() - due.createdAt) / 60000);
  const report = (action) => track('bowl_reminder', { action, bowl_id: due.id, minutes_since_brought: minutes });

  const rate = () => {
    report('rate');
    navigate(`/bowl/${due.id}/rate`);
  };
  const snooze = () => {
    report('snooze');
    snoozeDraft(due.id);
  };
  const drop = () => {
    report('drop');
    deleteDraft(due.id);
    showToast(t('bowl.dropped'));
  };

  const venue = due.place?.name ? venueLabel(due.place.name) : t('card.unknownPlace');

  return (
    <aside className={style.banner} aria-label={t('bowl.remindAria')}>
      <div className={style.row}>
        <span className={style.thumb} aria-hidden="true">
          {thumb ? <img src={thumb} alt="" /> : <IconBowl size={26} />}
        </span>
        <div className={style.words}>
          <p className={style.title}>{t('bowl.remindTitle', { venue })}</p>
          {due.borsch?.name && <p className={style.dish}>{dishLabel(due.borsch.name)}</p>}
        </div>
      </div>
      <div className={style.actions}>
        <button type="button" className={style.rate} onClick={rate}>{t('bowl.remindRate')}</button>
        <button type="button" className={style.snooze} onClick={snooze}>{t('bowl.remindSnooze')}</button>
        <button type="button" className={style.drop} onClick={drop}>{t('bowl.remindDrop')}</button>
      </div>
    </aside>
  );
};
