import { useEffect, useMemo, useState } from 'react';
import { usePlaces } from '../context/PlacesContext';
import { publishLocation } from '../utils/distance';
import { nearestPlaces, searchPlaces } from '../utils/nearestPlaces';

/**
 * «Ти зараз тут?»: where the phone is, the venues of our catalogue nearest to
 * it, and a search over the rest. Shared by the bowl (moment 1), the rating's
 * venue picker and the table a host sets up, so all three ask the same way.
 *
 * skip  true when the venue is already known (opened from a borshch card):
 *       no location prompt at all then.
 *
 * geo.status  'locating' | 'ok' | 'denied' | 'unavailable' | 'skipped'
 */
export const useNearbyVenues = ({ skip = false } = {}) => {
  const { allPlaces, loading } = usePlaces();
  const [geo, setGeo] = useState({ status: skip ? 'skipped' : 'locating', point: null });
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (skip) return undefined;
    if (!navigator.geolocation) {
      setGeo({ status: 'unavailable', point: null });
      return undefined;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        publishLocation(point);
        setGeo({ status: 'ok', point });
      },
      (err) => {
        if (cancelled) return;
        setGeo({ status: err?.code === 1 ? 'denied' : 'unavailable', point: null });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
    return () => { cancelled = true; };
  }, [skip]);

  const nearest = useMemo(
    () => (geo.status === 'ok' ? nearestPlaces(allPlaces, geo.point) : []),
    [allPlaces, geo]
  );
  const results = useMemo(
    () => searchPlaces(allPlaces, query, geo.point),
    [allPlaces, query, geo.point]
  );

  return { geo, nearest, query, setQuery, results, placesLoading: loading };
};
