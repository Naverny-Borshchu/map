import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBowlDrafts } from '../../hook/useBowlDrafts';
import { deleteDraft, loadDraftPhotos, saveDraftPhotos } from '../../services/bowlDrafts';
import { borschAPI } from '../../api';
import { uploadPhotos } from '../../utils/uploadPhotos';
import { LONG_TOAST_MS, showToast } from '../Toast';
import { MAX_PHOTOS } from '../QuestFlow';
import { IconBowl } from '../Icons';
import { useI18n, useVenueLabel, useDishLabel } from '../../i18n';
import style from './MyBowls.module.scss';
import { dayMonth, joinMeta } from '../../utils/dates';

/** "щойно", "25 хв тому", "3 год тому", or the date for older bowls. */
export const bowlAge = (createdAt, now, t, lang = 'uk') => {
  const minutes = Math.floor((now - createdAt) / 60000);
  if (minutes < 1) return t('bowl.justNow');
  if (minutes < 60) return t('bowl.agoMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('bowl.agoHours', { n: hours });
  return dayMonth(new Date(createdAt), lang);
};

const BowlRow = ({ bowl }) => {
  const { t, lang } = useI18n();
  const venueLabel = useVenueLabel();
  const dishLabel = useDishLabel();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [thumb, setThumb] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bowl.photoCount) {
      setThumb(null);
      return undefined;
    }
    let url = null;
    let cancelled = false;
    loadDraftPhotos(bowl.id).then((files) => {
      if (cancelled || !files[0]) return;
      url = URL.createObjectURL(files[0]);
      setThumb(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bowl.id, bowl.photoCount]);

  // «Фото пізніше»: the picture can join the bowl any time before the rating.
  const addPhotos = async (fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    setBusy(true);
    try {
      const existing = await loadDraftPhotos(bowl.id);
      await saveDraftPhotos(bowl.id, [...existing, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      showToast(t('bowl.photoSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  // A rated bowl whose photo did not reach the server: send it now.
  const uploadPending = async () => {
    setBusy(true);
    const photos = await loadDraftPhotos(bowl.id);
    const result = await uploadPhotos({ borschId: bowl.borsch.id, photos, upload: borschAPI.uploadPhoto });
    setBusy(false);
    if (result.failed === 0) {
      await deleteDraft(bowl.id);
      window.dispatchEvent(new Event('borschDataUpdated'));
      // NAV-218: a 202 is sent all the same, it only waits for the AI check
      if (result.pending.length) showToast(t('photo.pending', { count: result.pending.length }), { ms: LONG_TOAST_MS });
      else showToast(t('rev.photoAdded'));
    } else {
      showToast(t('rev.photoFailed', { n: result.failed, total: photos.length }));
    }
  };

  const remove = () => {
    if (bowl.photoCount && !window.confirm(t('bowl.removeConfirm'))) return;
    deleteDraft(bowl.id);
  };

  const venue = bowl.place?.name ? venueLabel(bowl.place.name) : t('card.unknownPlace');
  const meta = joinMeta([
    bowl.borsch?.name ? dishLabel(bowl.borsch.name) : null,
    bowlAge(bowl.createdAt, Date.now(), t, lang),
    bowl.photoCount ? t('bowl.photos', { count: bowl.photoCount }) : t('bowl.noPhoto'),
  ]);

  return (
    <li className={style.row}>
      <span className={style.thumb} aria-hidden="true">
        {thumb ? <img src={thumb} alt="" /> : <IconBowl size={28} />}
      </span>
      <div className={style.body}>
        <p className={style.venue}>{venue}</p>
        <p className={style.meta}>{meta}</p>
        {bowl.reviewedAt && <p className={style.pending}>{t('bowl.pendingPhotos')}</p>}
        <div className={style.actions}>
          {bowl.reviewedAt ? (
            <button type="button" className={style.primary} onClick={uploadPending} disabled={busy}>
              {busy ? t('rev.photoUploading') : t('bowl.uploadPhotos')}
            </button>
          ) : (
            <button type="button" className={style.primary} onClick={() => navigate(`/bowl/${bowl.id}/rate`)}>
              {t('bowl.rate')}
            </button>
          )}
          {!bowl.reviewedAt && bowl.photoCount < MAX_PHOTOS && (
            <button type="button" className={style.ghost} onClick={() => fileRef.current?.click()} disabled={busy}>
              {t('bowl.addPhoto')}
            </button>
          )}
          <button type="button" className={style.text} onClick={remove}>{t('bowl.remove')}</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
        />
      </div>
    </li>
  );
};

/**
 * «Мої миски»: every bowl waiting on this device, in the profile. Renders
 * nothing when there are none, so the profile looks as it did.
 */
export const MyBowls = ({ className = '' }) => {
  const { t } = useI18n();
  const bowls = useBowlDrafts();
  if (!bowls.length) return null;
  return (
    <section className={`${style.card} ${className}`.trim()} aria-labelledby="my-bowls-title">
      <h2 id="my-bowls-title" className={style.title}>{t('bowl.mineTitle')}</h2>
      <p className={style.lead}>{t('bowl.mineLead')}</p>
      <ul className={style.list}>
        {bowls.map((b) => <BowlRow key={b.id} bowl={b} />)}
      </ul>
    </section>
  );
};
