import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tipsAPI } from '../../api/tips';
import { AUTH_REQUIRED_ERROR } from '../../api';
import { track } from '../../analytics';
import { useUser } from '../../context/UserContext';
import { googleAuth } from '../../services/googleAuth';
import { GoogleAuth } from '../GoogleAuth';
import { IconClose, IconMapPin } from '../Icons';
import { useI18n, useVenueLabel, useCityLabel } from '../../i18n';
import style from './TipSheet.module.scss';
import { dayMonth, joinMeta } from '../../utils/dates';

/** A tip's venue in the shape the bowl's venue screen speaks. */
export const tipPlaceForFlow = (p = {}) => ({
  id: p.id,
  name: p.name || '',
  address: p.address || '',
  city: p.city || '',
  latitude: p.latitude,
  longitude: p.longitude,
});

// a person's own words go in as they are, never through t(): «$&» in a note must stay «$&»
const quote = (note, lang) => (lang === 'en' ? `“${note}”` : `«${note}»`);

const tipDate = (iso, lang) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return dayMonth(d, lang);
};

/**
 * What a grey bowl on the map opens: «Кажуть, тут є Борщ».
 *
 *   Оцінити першим   the bowl, moment 1, at this venue: the first public
 *                    rating turns the tip into an ordinary pin by itself
 *   Так, є           one more person says so: the tip becomes confirmed
 *   Вже нема         two of these and it leaves the map
 *
 * Voting needs an account; a person who is not signed in gets the Google
 * button right there and the vote goes through after it. The author sees no
 * «Так, є» for their own tip (the backend would refuse it), only «Вже нема».
 */
export const TipSheet = ({ tip: initial, onClose, onChanged, from = 'map' }) => {
  const { t, lang } = useI18n();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  const navigate = useNavigate();
  const { isAuthenticated, completeGoogleSignIn } = useUser();
  const [tip, setTip] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingVote, setPendingVote] = useState(null);
  const reported = useRef(false);

  useEffect(() => {
    if (!reported.current) {
      reported.current = true;
      track('tip_open', { tip_id: initial.id, status: initial.status, from });
    }
    let cancelled = false;
    // the list was read without the account: ask again for is_author / my_vote
    tipsAPI.get(initial.id).then((fresh) => { if (!cancelled && fresh) setTip(fresh); }).catch(() => {});
    return () => { cancelled = true; };
  }, [initial.id, initial.status, from]);

  const place = tip.place || {};
  const venue = venueLabel(place.name || '');
  const address = [place.address, place.city && !String(place.address || '').includes(place.city) ? cityLabel(place.city) : null]
    .filter(Boolean).join(', ');
  const live = tip.status === 'open' || tip.status === 'confirmed';

  const vote = useCallback(async (kind) => {
    setBusy(true);
    setError('');
    try {
      const fresh = await (kind === 'confirm' ? tipsAPI.confirm(tip.id, { from }) : tipsAPI.gone(tip.id, { from }));
      setTip(fresh);
      onChanged?.(fresh);
      if (kind === 'confirm') setMessage(t('tip.thanksConfirm'));
      else setMessage(t(fresh?.status === 'gone' ? 'tip.thanksGoneRemoved' : 'tip.thanksGone'));
    } catch (e) {
      if (e?.message === AUTH_REQUIRED_ERROR || e?.status === 401) {
        setPendingVote(kind);
      } else if (e?.code === 'own_tip') {
        setError(t('tip.errOwn'));
      } else if (e?.code === 'tip_closed') {
        setError(t('tip.errClosed'));
        tipsAPI.get(tip.id).then((fresh) => { setTip(fresh); onChanged?.(fresh); }).catch(() => {});
      } else if (e?.status === 429) {
        setError(t('tip.errBusy'));
      } else {
        console.error('Не вдалося проголосувати за підказку:', e);
        setError(t('tip.errVote'));
      }
    } finally {
      setBusy(false);
    }
  }, [tip.id, from, onChanged, t]);

  const ask = (kind) => {
    if (!isAuthenticated) {
      setPendingVote(kind);
      return;
    }
    vote(kind);
  };

  const signIn = useCallback(async (credentialResponse) => {
    try {
      const data = await googleAuth(credentialResponse.credential);
      completeGoogleSignIn(data);
      const kind = pendingVote;
      setPendingVote(null);
      if (kind) await vote(kind);
    } catch (e) {
      setError(t('tip.errSignIn'));
    }
  }, [completeGoogleSignIn, pendingVote, vote, t]);

  const rateFirst = () => {
    track('tip_rate_first', { tip_id: tip.id, from });
    onClose?.();
    navigate(`/bowl/new?place=${encodeURIComponent(place.id)}&tip=${encodeURIComponent(tip.id)}&from=tip`, {
      state: { place: tipPlaceForFlow(place) },
    });
  };

  const author = tip.author_name ? t('tip.by', { name: tip.author_name }) : t('tip.byNobody');
  const when = tipDate(tip.created_at, lang);
  const voted = tip.my_vote;

  return (
    <div className={style.sheet} role="dialog" aria-modal="true" aria-labelledby="tip-sheet-title" data-testid="tip-sheet">
      <div className={style.top}>
        <p className={style.kicker}>{t('tip.kicker')}</p>
        <button type="button" className={style.close} onClick={onClose} aria-label={t('card.close')}>
          <IconClose size={22} />
        </button>
      </div>
      <h2 id="tip-sheet-title" className={style.title}>{t('tip.sheetTitle')}</h2>

      <div className={style.venue}>
        <span className={style.venueIcon} aria-hidden="true"><IconMapPin size={22} /></span>
        <span className={style.venueWords}>
          <span className={style.venueName}>{venue}</span>
          {address && <span className={style.venueAddr}>{address}</span>}
        </span>
      </div>

      {tip.note && <blockquote className={style.note}>{quote(tip.note, lang)}</blockquote>}

      <p className={style.meta}>
        {joinMeta([author, when])}
      </p>
      <p className={style.status}>
        <span className={`${style.badge} ${tip.status === 'confirmed' ? style.badgeOn : ''}`}>
          {t(`tip.status.${tip.status}`)}
        </span>
        {tip.confirmations > 0 && <span className={style.count}>{t('tip.confirmations', { count: tip.confirmations })}</span>}
      </p>

      {live && <p className={style.lead}>{t('tip.lead')}</p>}

      {live && (
        <button type="button" className={style.primary} onClick={rateFirst}>{t('tip.rateFirst')}</button>
      )}

      {live && !message && (
        <div className={style.votes} role="group" aria-label={t('tip.voteAria')}>
          {!tip.is_author && (
            <button
              type="button"
              className={`${style.vote} ${voted === 'confirm' ? style.voteOn : ''}`}
              onClick={() => ask('confirm')}
              disabled={busy || voted === 'confirm'}
              aria-pressed={voted === 'confirm'}
            >
              {t('tip.yes')}
            </button>
          )}
          <button
            type="button"
            className={`${style.vote} ${voted === 'gone' ? style.voteOn : ''}`}
            onClick={() => ask('gone')}
            disabled={busy || voted === 'gone'}
            aria-pressed={voted === 'gone'}
          >
            {t('tip.gone')}
          </button>
        </div>
      )}
      {tip.is_author && live && !message && <p className={style.hint}>{t('tip.yours')}</p>}
      {voted && !message && <p className={style.hint}>{t(voted === 'confirm' ? 'tip.votedYes' : 'tip.votedGone')}</p>}

      {pendingVote && !isAuthenticated && (
        <div className={style.signin}>
          <p className={style.hint}>{t('tip.signinToVote')}</p>
          <GoogleAuth onSuccess={signIn} />
        </div>
      )}

      {message && <p className={style.thanks} role="status">{message}</p>}
      {error && <p className={style.error} role="alert">{error}</p>}
      {!live && !message && <p className={style.hint}>{t(`tip.closed.${tip.status}`)}</p>}
    </div>
  );
};
