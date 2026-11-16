import { useEffect, useState } from 'react';
import { BowlLoader } from '../EmptyState';
import { IconMapPin, IconSearch } from '../Icons';
import { formatDistanceLocal } from '../../utils/nearestPlaces';
import { distanceMeters } from '../../utils/distance';
import { useI18n, useVenueLabel, useCityLabel } from '../../i18n';
import { useGoogleSuggestions } from '../../hook/useGoogleSuggestions';
import { fetchGoogleNearby, fetchVenueDetails } from '../../services/googlePlaces';
import q from '../QuestFlow/QuestFlow.module.scss';
import style from '../../page/BowlFlow/BowlFlow.module.scss';
import gstyle from '../GooglePlacePicker/GooglePlacePicker.module.scss';

/** One venue as a big card on the quest frame: name, address, distance. */
export const VenueCard = ({ place: p, distance = null, onPick, testId = undefined, disabled = false }) => {
  const { t, lang } = useI18n();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  return (
    <button type="button" className={style.venue} onClick={() => onPick(p)} data-testid={testId} disabled={disabled}>
      <span className={style.venueIcon} aria-hidden="true"><IconMapPin size={22} /></span>
      <span className={style.venueWords}>
        <span className={style.venueName}>{venueLabel(p.name)}</span>
        <span className={style.venueAddr}>
          {[p.address || p.adress, p.city && cityLabel(p.city)].filter(Boolean)[0] || ''}
        </span>
      </span>
      {distance !== null && distance !== undefined && (
        <span className={style.venueDist}>{formatDistanceLocal(distance, t, lang)}</span>
      )}
    </button>
  );
};

/** Google's part of the list: a small heading, the cards, Google's credit. */
const GoogleBlock = ({ title, children }) => {
  const { t } = useI18n();
  return (
    <section className={style.googleBlock} aria-label={title} data-testid="google-inline">
      <h3 className={style.googleTitle}>{title}</h3>
      <div className={style.venues}>{children}</div>
      <p className={gstyle.attribution}>{t('gplace.attribution')}</p>
    </section>
  );
};

/**
 * Google's answer right in the list, for a person whose venue our map does
 * not have (Tokyo, 11.2026: «пише локації не знайдено і Київ», while Google
 * knew the place, two taps away behind «Закладу нема в списку»).
 *
 * text    what was typed, when our own search found nothing ('' otherwise)
 * point   where the phone is, when our map has nothing within reach of it
 */
const GoogleInline = ({ text, point, near, onPick }) => {
  const { t } = useI18n();
  const venueLabel = useVenueLabel();
  const { list, state, ready, endSession } = useGoogleSuggestions(text, { kind: 'venue', near });
  const [around, setAround] = useState({ key: '', venues: [] });
  const [picking, setPicking] = useState(false);
  const [failed, setFailed] = useState(false);
  const aroundKey = point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : '';

  useEffect(() => {
    // the Maps script may still be loading when this screen opens
    if (!point || text || !ready) return undefined;
    let cancelled = false;
    fetchGoogleNearby(point)
      .then((venues) => { if (!cancelled) setAround({ key: aroundKey, venues }); })
      .catch((e) => {
        console.error('Google не сказав, що поруч:', e);
        if (!cancelled) setAround({ key: aroundKey, venues: [] });
      });
    return () => { cancelled = true; };
    // the point as a key: a new object with the same place asks nothing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aroundKey, text, ready]);

  const pickSuggestion = async (s) => {
    if (picking) return;
    setPicking(true);
    setFailed(false);
    try {
      const venue = await fetchVenueDetails(s);
      endSession();
      if (!venue) throw new Error('no details');
      onPick(venue);
    } catch (e) {
      console.error('Не вдалося взяти заклад з Google:', e);
      setFailed(true);
      setPicking(false);
    }
  };

  const pickVenue = (venue) => {
    if (picking) return;
    setPicking(true);
    onPick(venue);
  };

  if (picking) {
    return <div className={style.loaderRow} role="status"><BowlLoader size={36} label={t('gplace.picking')} /></div>;
  }

  if (text) {
    return (
      <>
        {state === 'searching' && (
          <div className={style.loaderRow} role="status"><BowlLoader size={36} label={t('gplace.searching')} /></div>
        )}
        {failed && <p className={gstyle.problem} role="alert">{t('gplace.error')}</p>}
        {state === 'ok' && list.length > 0 && (
          <GoogleBlock title={t('gplace.foundTitle')}>
            {list.map((s) => (
              <button
                key={s.placeId}
                type="button"
                className={style.venue}
                onClick={() => pickSuggestion(s)}
                data-testid="google-inline-option"
              >
                <span className={style.venueIcon} aria-hidden="true"><IconMapPin size={22} /></span>
                <span className={style.venueWords}>
                  <span className={style.venueName}>{venueLabel(s.main)}</span>
                  {s.secondary && <span className={style.venueAddr}>{s.secondary}</span>}
                </span>
              </button>
            ))}
          </GoogleBlock>
        )}
      </>
    );
  }

  const venues = around.key === aroundKey ? around.venues : [];
  if (!venues.length) return null;
  return (
    <GoogleBlock title={t('gplace.nearTitle')}>
      {venues.map((v) => (
        <VenueCard
          key={v.googlePlaceId}
          place={v}
          distance={distanceMeters(point, v.location)}
          onPick={pickVenue}
          testId="google-near-option"
        />
      ))}
    </GoogleBlock>
  );
};

/**
 * The venue screen of every flow that starts at a table in a venue: the three
 * nearest venues as cards when the phone knows where it is («Ти зараз тут?»),
 * a search field under them, and the matches as the same cards.
 *
 * nearby   the result of hook/useNearbyVenues
 * loading  venues or borshch still loading
 * titles   { here, where }: the heading with and without nearby venues
 * kicker   the line above the heading (flow name and step)
 * google   { near, onPick(venue) }: where our map has nothing (nothing near
 *          the phone, nothing for what was typed), Google's venues inline,
 *          picked the same way as from «Закладу нема в списку»
 */
export const VenuePicker = ({ nearby, loading = false, titles, kicker = null, headingRef = null, onPick, google = null }) => {
  const { t } = useI18n();
  const { geo, nearest, query, setQuery, results } = nearby;
  const askHere = geo.status === 'ok' && nearest.length > 0;
  const noneNear = geo.status === 'ok' && !loading && nearest.length === 0;
  const note = {
    locating: t('bowl.locating'),
    denied: t('bowl.geoDenied'),
    unavailable: t('bowl.geoUnavailable'),
  }[geo.status] || (noneNear ? t('bowl.noneNear') : '');
  const typed = query.trim();
  const ownEmpty = Boolean(typed) && results.length === 0;
  const googleText = google && ownEmpty && typed.length >= 2 ? typed : '';
  const googlePoint = google && noneNear && !typed ? geo.point : null;

  return (
    <>
      {kicker}
      <h2 className={q.question} ref={headingRef} tabIndex={-1}>{askHere ? titles.here : titles.where}</h2>
      {note && <p className={q.hint} role="status">{note}</p>}
      {geo.status === 'locating' && <div className={style.loaderRow}><BowlLoader size={40} /></div>}
      {askHere && (
        <div className={style.venues}>
          {nearest.map(({ place, distance }) => (
            <VenueCard key={place.id} place={place} distance={distance} onPick={onPick} />
          ))}
        </div>
      )}
      {geo.status === 'ok' && loading && <div className={style.loaderRow}><BowlLoader size={40} /></div>}

      <label className={style.search}>
        <span className="nb-sr-only">{t('bowl.searchLabel')}</span>
        <IconSearch size={20} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('bowl.searchPlaceholder')}
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>
      {typed && (
        results.length
          ? (
            <div className={style.venues}>
              {results.map(({ place, distance }) => (
                <VenueCard key={place.id} place={place} distance={distance} onPick={onPick} />
              ))}
            </div>
          )
          : <p className={q.hint}>{t('bowl.searchEmpty')}</p>
      )}
      {google && (googleText || googlePoint) && (
        <GoogleInline text={googleText} point={googlePoint} near={google.near || geo.point} onPick={google.onPick} />
      )}
    </>
  );
};
