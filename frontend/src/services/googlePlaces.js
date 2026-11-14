import { cityOf, countryOf, fetchPlaceById, placeLanguage } from './placesLookup';
import { distanceMeters, placePoint } from '../utils/distance';
import { toStoredCoord } from '../api';

/**
 * «Закладу нема в списку»: Google Places for a venue our map does not have
 * yet, through the Maps JavaScript API the app already loads (the places
 * library, services/googleMaps). The key is referrer-bound and allows both
 * Places and Places (New), so the new AutocompleteSuggestion is used where the
 * browser has it and the classic AutocompleteService otherwise.
 *
 * A picked venue comes back as
 *   { googlePlaceId, name, address, city, country, location: { lat, lng } }
 * and is created on our side with its Place ID (POST /places/ or a tip's
 * new_place). The backend answers with the venue it already has when the ID,
 * or the same name within 50 m, is there (200, reused), so a second pin for
 * the same restaurant does not appear.
 *
 * Name, address, city and country are always asked in Ukrainian: the map
 * files its cities that way («Київ», «Львів»), and an English UI must not
 * start a second «Kyiv» in the city list.
 */

const DATA_LANGUAGE = 'uk';
const BIAS_RADIUS_M = 30000;
// Streets, cities and regions are not venues: «Хрещатик» is no place to eat.
const VENUE_TYPES = ['establishment', 'point_of_interest', 'food', 'restaurant', 'cafe', 'bar', 'meal_takeaway', 'bakery', 'food_court'];

const placesLib = () => (typeof window !== 'undefined' && window.google?.maps?.places) || null;

/** Is google.maps.places there to ask? */
export const placesReady = () => {
  const p = placesLib();
  return Boolean(p && (p.AutocompleteSuggestion?.fetchAutocompleteSuggestions || p.AutocompleteService));
};

/** One token per search: Google bills the typing and the pick as one session. */
export const newSessionToken = () => {
  const p = placesLib();
  try {
    return p?.AutocompleteSessionToken ? new p.AutocompleteSessionToken() : null;
  } catch (e) {
    return null;
  }
};

const isVenueLike = (types) => {
  if (!Array.isArray(types) || !types.length) return true;
  return types.some((t) => VENUE_TYPES.includes(t));
};

/**
 * Venues for what was typed, biased to `near` ({ lat, lng }) when known.
 * Each: { placeId, main, secondary, toPlace? }. Throws when the library is not
 * there, so the caller can offer the manual way instead.
 */
export const fetchVenueSuggestions = async (input, { near = null, sessionToken = null, language = placeLanguage() } = {}) => {
  const q = String(input || '').trim();
  if (q.length < 2) return [];
  const p = placesLib();
  if (!p) throw new Error('places_unavailable');

  const bias = near && Number.isFinite(near.lat) && Number.isFinite(near.lng)
    ? { center: { lat: near.lat, lng: near.lng }, radius: BIAS_RADIUS_M }
    : null;

  if (p.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    const { suggestions = [] } = await p.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: q,
      language,
      ...(sessionToken ? { sessionToken } : {}),
      ...(bias ? { locationBias: bias } : {}),
    });
    return suggestions
      .map((s) => s && s.placePrediction)
      .filter(Boolean)
      .filter((pp) => isVenueLike(pp.types))
      .map((pp) => ({
        placeId: pp.placeId,
        main: pp.mainText?.text || pp.text?.text || '',
        secondary: pp.secondaryText?.text || '',
        toPlace: typeof pp.toPlace === 'function' ? () => pp.toPlace() : null,
      }))
      .filter((s) => s.placeId && s.main);
  }

  const service = new p.AutocompleteService();
  const predictions = await new Promise((resolve, reject) => {
    service.getPlacePredictions(
      {
        input: q,
        language,
        types: ['establishment'],
        ...(sessionToken ? { sessionToken } : {}),
        ...(bias ? { locationBias: bias } : {}),
      },
      (list, status) => {
        if (status === 'OK' || status === p.PlacesServiceStatus?.OK) resolve(list || []);
        else if (status === 'ZERO_RESULTS' || status === p.PlacesServiceStatus?.ZERO_RESULTS) resolve([]);
        else reject(new Error(`places_${status}`));
      }
    );
  });
  return predictions
    .map((pr) => ({
      placeId: pr.place_id,
      main: pr.structured_formatting?.main_text || pr.description || '',
      secondary: pr.structured_formatting?.secondary_text || '',
      toPlace: null,
    }))
    .filter((s) => s.placeId && s.main);
};

const latLngOf = (loc) => {
  if (!loc) return null;
  const lat = typeof loc.lat === 'function' ? loc.lat() : (loc.lat ?? loc.latitude);
  const lng = typeof loc.lng === 'function' ? loc.lng() : (loc.lng ?? loc.longitude);
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
};

/** A Maps JS Place (fetchFields done) → our venue shape. */
export const venueFromJsPlace = (place) => {
  if (!place) return null;
  const location = latLngOf(place.location);
  const name = typeof place.displayName === 'string' ? place.displayName : (place.displayName?.text || '');
  if (!place.id || !name || !location) return null;
  return {
    googlePlaceId: place.id,
    name,
    address: place.formattedAddress || '',
    city: cityOf(place.addressComponents),
    country: countryOf(place.addressComponents),
    location,
  };
};

/** The REST lookup (services/placesLookup toPlace) → our venue shape. */
export const venueFromLookup = (p) => {
  if (!p || !p.id || !p.name) return null;
  const location = latLngOf(p.location);
  if (!location) return null;
  return {
    googlePlaceId: p.id,
    name: p.name,
    address: p.address || '',
    city: p.city || '',
    country: p.country || '',
    location,
  };
};

const FIELDS = ['id', 'displayName', 'formattedAddress', 'addressComponents', 'location'];

/**
 * The picked suggestion in full, in Ukrainian (see the note on top). With a
 * Ukrainian UI the new library's prediction carries the search session into
 * the details call (one billed session); otherwise a Place by id asked in
 * Ukrainian, and as the last resort the REST lookup the add flow already uses.
 */
export const fetchVenueDetails = async (suggestion, { lookup = fetchPlaceById, language = placeLanguage() } = {}) => {
  const p = placesLib();
  try {
    let place = null;
    if (suggestion?.toPlace && language === DATA_LANGUAGE) place = suggestion.toPlace();
    else if (p?.Place) place = new p.Place({ id: suggestion.placeId, requestedLanguage: DATA_LANGUAGE });
    if (place?.fetchFields) {
      await place.fetchFields({ fields: FIELDS });
      const venue = venueFromJsPlace(place);
      if (venue) return venue;
    }
  } catch (e) {
    // fall through to REST
  }
  return venueFromLookup(await lookup(suggestion.placeId, DATA_LANGUAGE));
};

// --- our catalogue -----------------------------------------------------------

/** Names compared the way the backend compares them: no case, quotes, punctuation. */
export const normalizeVenueName = (name) =>
  String(name || '')
    .toLocaleLowerCase('uk')
    .replace(/[ʼ'`’"«»“”„]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const SAME_VENUE_M = 50;

/**
 * Do we already have this Google venue? The same Place ID, or the same name
 * within 50 m (the backend's own rule), so the person is taken to our venue
 * and its borshch instead of starting a duplicate.
 */
export const findOwnPlace = (places, venue) => {
  if (!venue || !Array.isArray(places)) return null;
  const byId = places.find((p) => p?.google_place_id && p.google_place_id === venue.googlePlaceId);
  if (byId) return byId;
  const name = normalizeVenueName(venue.name);
  if (!name) return null;
  return places.find((p) => {
    if (normalizeVenueName(p?.name) !== name) return false;
    const d = distanceMeters(venue.location, placePoint(p));
    return d !== null && d <= SAME_VENUE_M;
  }) || null;
};

/** The body of POST /places/ (and a tip's new_place) for a Google venue. */
export const venuePlacePayload = (venue) => ({
  name: venue.name,
  address: venue.address || '',
  city: venue.city || '',
  country: venue.country || 'Україна',
  location_lat: toStoredCoord(venue.location?.lat),
  location_lng: toStoredCoord(venue.location?.lng),
  google_place_id: venue.googlePlaceId,
});

/**
 * A venue not in our catalogue yet, in the shape the flows carry around until
 * it is created (bowl drafts keep it, the table creates it on «Створити»).
 */
export const pendingPlace = (venue) => ({
  id: null,
  name: venue.name,
  address: venue.address || '',
  city: venue.city || '',
  country: venue.country || '',
  latitude: venue.location?.lat,
  longitude: venue.location?.lng,
  google: {
    googlePlaceId: venue.googlePlaceId,
    name: venue.name,
    address: venue.address || '',
    city: venue.city || '',
    country: venue.country || '',
    location: venue.location,
  },
});
