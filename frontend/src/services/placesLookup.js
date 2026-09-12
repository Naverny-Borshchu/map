/**
 * Looking a venue up in Google Places, the way this app needs it.
 *
 * Three callers want the same thing in different words: the map (you tapped a
 * restaurant icon), the search field (you typed its name), and the fallback
 * (you tapped an empty pavement and we have to ask what is around). Keeping the
 * field mask, the language and the response shape in one place is what stops
 * them drifting apart — the drift is how the sheet ended up naming a venue that
 * had closed.
 */

const KEY = process.env.REACT_APP_API_KEY_MAP;

const FIELDS =
  'id,displayName,formattedAddress,location,primaryType,types,photos,regularOpeningHours';

/** Google answers in whatever language it likes unless asked; ask for the UI's. */
export const placeLanguage = () => {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'uk';
  } catch (e) {
    return 'uk';
  }
};

/** Places API v1 → the shape the sheet and the add flow already speak. */
export const toPlace = (raw) =>
  raw && {
    id: raw.id,
    name: raw.displayName?.text || '',
    address: raw.formattedAddress || '',
    location: { lat: raw.location?.latitude, lng: raw.location?.longitude },
    type: raw.primaryType || null,
    types: raw.types || [],
    photos: raw.photos || [],
    hours: raw.regularOpeningHours || null,
  };

/** Exactly the venue that was tapped or picked — no proximity guessing. */
export const fetchPlaceById = async (placeId) => {
  if (!placeId) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=${placeLanguage()}`,
      { headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS } }
    );
    if (!res.ok) return null;
    return toPlace(await res.json());
  } catch (err) {
    console.error('❌ fetchPlaceById:', err);
    return null;
  }
};

/**
 * Everything eatable within `radius` metres of a point, nearest first.
 * Returns a list on purpose: the caller shows it, instead of presenting the
 * first hit as the answer.
 */
export const fetchNearbyVenues = async (lat, lng, radius = 60) => {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': FIELDS.split(',').map((f) => `places.${f}`).join(','),
      },
      body: JSON.stringify({
        languageCode: placeLanguage(),
        includedTypes: ['restaurant', 'cafe', 'bar', 'meal_takeaway', 'food_court'],
        rankPreference: 'DISTANCE',
        maxResultCount: 8,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      }),
    });
    const data = await res.json();
    return (data.places || []).map(toPlace).filter((p) => p && p.name);
  } catch (err) {
    console.error('❌ fetchNearbyVenues:', err);
    return [];
  }
};

/**
 * What the person meant by that tap.
 *
 * Tapping a venue's own icon is unambiguous — Google hands us its place id, and
 * that is the answer. Tapping bare pavement is not, so we come back with the
 * list of what is around instead of promoting the first hit to "the venue".
 */
export const resolveVenueAtTap = async (
  { placeId, lat, lng },
  { byId = fetchPlaceById, nearby = fetchNearbyVenues } = {}
) => {
  if (placeId) {
    const exact = await byId(placeId);
    if (exact) return { venue: exact, candidates: [] };
  }
  const list = await nearby(lat, lng);
  return { venue: list[0] || null, candidates: list };
};
