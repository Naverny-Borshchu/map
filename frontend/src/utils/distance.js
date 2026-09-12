/** Great-circle distance in metres. */
export const distanceMeters = (a, b) => {
  if (!a || !b) return null;
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** The visitor's last known position, as stored by the geolocation button. */
export const getUserLocation = () => {
  try {
    const raw = localStorage.getItem('user_location');
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? p : null;
  } catch (e) {
    return null;
  }
};

export const formatDistance = (m) => {
  if (m === null || m === undefined) return null;
  if (m < 950) return `${Math.round(m / 10) * 10} м`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} км`;
};

/** Fired by the geolocation button once a position is stored. */
export const LOCATION_EVENT = 'nb:location';

export const publishLocation = (coords) => {
  try { localStorage.setItem('user_location', JSON.stringify(coords)); } catch (e) { /* ignore */ }
  window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: coords }));
};

/**
 * A place's coordinates, taken from the shape the app actually uses.
 *
 * Places arrive from the API as `latitude`/`longitude` strings and reach every
 * consumer that way (the map's markers, the list's distances). One caller read
 * `place.location` instead, which is undefined on these objects, so every
 * distance came out null and the suggestions relying on it silently showed
 * nothing. `location` is still accepted for callers that pass a mapped place.
 */
export const placePoint = (place) => {
  const lat = Number(place?.latitude ?? place?.location?.lat);
  const lng = Number(place?.longitude ?? place?.location?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};
