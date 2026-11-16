import { useEffect, useRef, useState } from 'react';
import { useGoogleMaps } from '../services/googleMaps';
import { fetchVenueSuggestions, newSessionToken, placesReady } from '../services/googlePlaces';

const DEBOUNCE_MS = 300;

/**
 * Google's suggestions for what is typed, as the screens that show them
 * inline need them: debounced, one billing session per search, the latest
 * answer only. `text` '' (or under two letters) asks nothing.
 *
 * kind   'venue' (somewhere to eat) or 'city' (where to move the map)
 * near   { lat, lng } to bias to, when known
 *
 * state  'idle' | 'searching' | 'ok' | 'empty' | 'error' | 'off' (no Google)
 * ready  the Places library is there to ask (the Maps script loads late)
 * endSession()  after a pick, so the next search starts a new session
 */
export const useGoogleSuggestions = (text, { kind = 'venue', near = null } = {}) => {
  const { isLoaded, loadError } = useGoogleMaps();
  const [list, setList] = useState([]);
  const [state, setState] = useState('idle');
  const token = useRef(null);
  const latest = useRef(0);
  const ready = isLoaded && !loadError && placesReady();
  const lat = near?.lat;
  const lng = near?.lng;

  useEffect(() => {
    const q = String(text || '').trim();
    if (!ready || q.length < 2) {
      latest.current += 1;
      setList([]);
      setState(ready ? 'idle' : 'off');
      return undefined;
    }
    const run = ++latest.current;
    setState('searching');
    const timer = setTimeout(async () => {
      if (!token.current) token.current = newSessionToken();
      try {
        const point = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        const found = await fetchVenueSuggestions(q, { near: point, sessionToken: token.current, kind });
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
  }, [text, ready, kind, lat, lng]);

  return { list, state, ready, endSession: () => { token.current = null; } };
};
