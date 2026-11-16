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
  'id,displayName,formattedAddress,addressComponents,location,primaryType,types,photos,regularOpeningHours';

/** Google answers in whatever language it likes unless asked; ask for the UI's. */
export const placeLanguage = () => {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'uk';
  } catch (e) {
    return 'uk';
  }
};

/**
 * The city and the country as Google actually labelled them.
 *
 * The add flow used to read both off the tail of `formattedAddress`: the city
 * was "the last comma-segment" and so was the country, which works only while
 * every venue is Ukrainian, because "Україна" was the one country name the
 * parser knew to skip. The first Berlin venue was therefore filed with
 * city "Німеччина" and country "Україна" — a country in the city column, and
 * the wrong country at that. `addressComponents` says which is which instead
 * of inferring it from position.
 *
 * `postal_town` is the fallback Google uses where there is no `locality`,
 * notably in the UK. Everything stays best-effort: an unlabelled address
 * simply yields '' and the caller keeps its existing fallbacks.
 */
const componentText = (components, type) => {
  const hit = (components || []).find((c) => (c.types || []).includes(type));
  return hit ? (hit.longText || hit.shortText || '') : '';
};

const componentCode = (components, type) => {
  const hit = (components || []).find((c) => (c.types || []).includes(type));
  return hit ? String(hit.shortText || hit.short_name || '').toUpperCase() : '';
};

/** «UA», «JP», … as Google labels the country; '' when it does not. */
export const countryCodeOf = (components) => componentCode(components, 'country');

/**
 * Outside Ukraine a venue's data is taken in English (abroad, 11.2026): in
 * Ukrainian Google names much of the world with Russian forms (Yokohama,
 * Shin-Yokohama and Krakow spelt the Russian way), and the map must never
 * show Russian. A venue
 * whose country Google did not label is not called abroad.
 */
export const isAbroadCode = (code) => Boolean(code) && code !== 'UA';

// Tokyo's 23 wards are Google's localities («Shibuya»), and the city menu
// would split one city into 23. The metropolis is the city people mean.
const METROPOLIS_AS_CITY = { JP: ['Tokyo', 'Токіо', '東京都'] };

export const cityOf = (components) => {
  const region = componentText(components, 'administrative_area_level_1');
  if ((METROPOLIS_AS_CITY[countryCodeOf(components)] || []).includes(region)) return region;
  return componentText(components, 'locality') || componentText(components, 'postal_town');
};

export const countryOf = (components) => componentText(components, 'country');

/** Places API v1 → the shape the sheet and the add flow already speak. */
export const toPlace = (raw) =>
  raw && {
    id: raw.id,
    // said out loud: `id` here is Google's, not ours, and the add flow sends
    // it as google_place_id so the backend can return the venue it has
    googlePlaceId: raw.id,
    name: raw.displayName?.text || '',
    address: raw.formattedAddress || '',
    // '' when Google did not label it; the add flow falls back to its own
    // parsing and then to the city being browsed, exactly as before.
    city: cityOf(raw.addressComponents),
    country: countryOf(raw.addressComponents),
    countryCode: countryCodeOf(raw.addressComponents),
    location: { lat: raw.location?.latitude, lng: raw.location?.longitude },
    type: raw.primaryType || null,
    types: raw.types || [],
    photos: raw.photos || [],
    hours: raw.regularOpeningHours || null,
  };

const fetchOne = async (placeId, language) => {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?languageCode=${language}`,
    { headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS } }
  );
  if (!res.ok) return null;
  return toPlace(await res.json());
};

/**
 * Exactly the venue that was tapped or picked — no proximity guessing.
 * A venue abroad comes back in English whatever was asked (see isAbroadCode).
 */
export const fetchPlaceById = async (placeId, language = placeLanguage()) => {
  if (!placeId) return null;
  try {
    const place = await fetchOne(placeId, language);
    if (place && language !== 'en' && isAbroadCode(place.countryCode)) {
      return (await fetchOne(placeId, 'en')) || place;
    }
    return place;
  } catch (err) {
    console.error('❌ fetchPlaceById:', err);
    return null;
  }
};

// Roughly Ukraine: a point outside it is certainly abroad, so its venues are
// asked in English at once. Inside, Google's own country label decides.
const UA_BOX = { south: 44.3, north: 52.4, west: 22.1, east: 40.3 };
export const inUkraineBox = (point) => Boolean(point)
  && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))
  && point.lat >= UA_BOX.south && point.lat <= UA_BOX.north
  && point.lng >= UA_BOX.west && point.lng <= UA_BOX.east;

/** One Places API v1 nearby search in one language. */
const searchNearby = async (lat, lng, radius, language) => {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': FIELDS.split(',').map((f) => `places.${f}`).join(','),
    },
    body: JSON.stringify({
      languageCode: language,
      includedTypes: ['restaurant', 'cafe', 'bar', 'meal_takeaway', 'food_court'],
      rankPreference: 'DISTANCE',
      maxResultCount: 8,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    }),
  });
  const data = await res.json();
  return (data.places || []).map(toPlace).filter((p) => p && p.name);
};

/**
 * Everything eatable within `radius` metres of a point, nearest first.
 * Returns a list on purpose: the caller shows it, instead of presenting the
 * first hit as the answer. Abroad, in English (see isAbroadCode).
 */
export const fetchNearbyVenues = async (lat, lng, radius = 60) => {
  try {
    const language = inUkraineBox({ lat, lng }) ? placeLanguage() : 'en';
    const list = await searchNearby(lat, lng, radius, language);
    if (language === 'en' || !list.some((p) => isAbroadCode(p.countryCode))) return list;
    const english = new Map((await searchNearby(lat, lng, radius, 'en')).map((p) => [p.id, p]));
    return list.map((p) => (isAbroadCode(p.countryCode) && english.get(p.id)) || p);
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
