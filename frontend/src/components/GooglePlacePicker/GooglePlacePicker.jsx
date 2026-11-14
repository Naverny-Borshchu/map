import { useEffect, useRef, useState } from 'react';
import { BowlLoader } from '../EmptyState';
import { IconMapPin, IconSearch } from '../Icons';
import { useGoogleMaps } from '../../services/googleMaps';
import { fetchVenueDetails, fetchVenueSuggestions, newSessionToken, placesReady } from '../../services/googlePlaces';
import { useI18n } from '../../i18n';
import q from '../QuestFlow/QuestFlow.module.scss';
import bowl from '../../page/BowlFlow/BowlFlow.module.scss';
import style from './GooglePlacePicker.module.scss';

const DEBOUNCE_MS = 300;

/**
 * «Закладу нема в списку»: the venue from Google Places, so it lands on the
 * map with Google's name, address and coordinates and its Place ID (no
 * duplicates). Shared by the bowl, the tip and the table; the add flow has had
 * Google search on its map all along.
 *
 * near      { lat, lng } to bias the search to (the phone, or the photo)
 * onPick    (venue) => void, venue as services/googlePlaces describes it
 * onManual  the old way, kept for when Google is not there: the map
 *
 * The Maps script is loaded the way the map loads it (services/googleMaps), so
 * a person who never opened the map gets it here too.
 */
export const GooglePlacePicker = ({
  near = null,
  title,
  kicker = null,
  headingRef = null,
  onPick,
  onManual = null,
  busy = false,
}) => {
  const { t } = useI18n();
  const { isLoaded, loadError } = useGoogleMaps();
  const [query, setQuery] = useState('');
  const [list, setList] = useState([]);
  const [state, setState] = useState('idle'); // idle | searching | ok | empty | error | picking
  const token = useRef(null);
  const latest = useRef(0);

  const ready = isLoaded && !loadError && placesReady();
  const broken = Boolean(loadError) || (isLoaded && !placesReady());

  useEffect(() => {
    const text = query.trim();
    if (!ready || text.length < 2) {
      setList([]);
      setState('idle');
      return undefined;
    }
    const run = ++latest.current;
    setState('searching');
    const timer = setTimeout(async () => {
      if (!token.current) token.current = newSessionToken();
      try {
        const found = await fetchVenueSuggestions(text, { near, sessionToken: token.current });
        if (run !== latest.current) return;
        setList(found);
        setState(found.length ? 'ok' : 'empty');
      } catch (e) {
        if (run !== latest.current) return;
        console.error('Пошук Google не відповів:', e);
        setList([]);
        setState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, ready, near]);

  const pick = async (suggestion) => {
    if (state === 'picking' || busy) return;
    setState('picking');
    try {
      const venue = await fetchVenueDetails(suggestion);
      token.current = null;
      if (!venue) throw new Error('no details');
      onPick(venue);
    } catch (e) {
      console.error('Не вдалося взяти заклад з Google:', e);
      setState('error');
    }
  };

  return (
    <>
      {kicker}
      <h2 className={q.question} ref={headingRef} tabIndex={-1}>{title || t('gplace.title')}</h2>
      <p className={q.hint}>{t('gplace.hint')}</p>

      {broken ? (
        <p className={style.problem} role="alert">{t('gplace.unavailable')}</p>
      ) : (
        <label className={bowl.search}>
          <span className="nb-sr-only">{t('gplace.searchLabel')}</span>
          <IconSearch size={20} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('gplace.placeholder')}
            autoComplete="off"
            enterKeyHint="search"
            disabled={!ready}
            data-testid="google-place-search"
          />
        </label>
      )}

      {!ready && !broken && <div className={bowl.loaderRow}><BowlLoader size={40} label={t('gplace.loading')} /></div>}
      {(state === 'searching' || state === 'picking' || busy) && (
        <div className={bowl.loaderRow} role="status"><BowlLoader size={36} label={t(state === 'searching' ? 'gplace.searching' : 'gplace.picking')} /></div>
      )}
      {state === 'empty' && <p className={q.hint} role="status">{t('gplace.empty')}</p>}
      {state === 'error' && <p className={style.problem} role="alert">{t('gplace.error')}</p>}

      {list.length > 0 && state !== 'picking' && (
        <>
          <div className={bowl.venues}>
            {list.map((s) => (
              <button
                key={s.placeId}
                type="button"
                className={bowl.venue}
                onClick={() => pick(s)}
                disabled={busy}
                data-testid="google-place-option"
              >
                <span className={bowl.venueIcon} aria-hidden="true"><IconMapPin size={22} /></span>
                <span className={bowl.venueWords}>
                  <span className={bowl.venueName}>{s.main}</span>
                  {s.secondary && <span className={bowl.venueAddr}>{s.secondary}</span>}
                </span>
              </button>
            ))}
          </div>
          <p className={style.attribution}>{t('gplace.attribution')}</p>
        </>
      )}

      {onManual && (
        <button type="button" className={style.manual} onClick={onManual}>
          {t('gplace.manual')}
        </button>
      )}
    </>
  );
};
