import {
  cityOf, countryCodeOf, countryOf, fetchNearbyVenues, fetchPlaceById, inUkraineBox, isAbroadCode, placeLanguage,
} from './placesLookup';
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
 * Name, address, city and country are asked in Ukrainian: the map files its
 * cities that way («Київ», «Львів»), and an English UI must not start a second
 * «Kyiv» in the city list. Abroad (Google's country label is not UA) they are
 * asked again in English: in Ukrainian Google names much of the world with
 * Russian forms (Yokohama and Krakow spelt the Russian way), and the map must never show Russian.
 * The suggestions follow the same rule, see fetchVenueSuggestions.
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

// A line of Google's that ends with the country names a Ukrainian place;
// anything else is abroad, or unknown, and is asked again in English.
const UKRAINE_TAIL = /(^|,\s*)(Україна|Ukraine)\s*$/;
// Letters Ukrainian does not have: a Russian form slipped through.
// (the four letters Ukrainian does not have, and their capitals, as code points)
const RUSSIAN_LETTERS = /[\u044B\u044D\u044A\u0451\u042B\u042D\u042A\u0401]/;

const CYRILLIC = /[\u0400-\u04FF]/;

/**
 * A Cyrillic line about a place abroad: Google's Ukrainian there is often
 * Russian (Yokohama, Krakow), so it is shown in English instead.
 */
export const abroadInCyrillic = (s) => wantsEnglish(s) && CYRILLIC.test(`${s?.main || ''} ${s?.secondary || ''}`);

/** Should this suggestion be shown in English instead? */
export const wantsEnglish = (s) => !UKRAINE_TAIL.test(String(s?.secondary || '').trim())
  || RUSSIAN_LETTERS.test(`${s?.main || ''} ${s?.secondary || ''}`);

// What a search is for: a venue to eat at, or a city to move the map to.
const KINDS = {
  venue: { primaryTypes: null, classicTypes: ['establishment'], keep: (types) => isVenueLike(types) },
  city: {
    // Tokyo is Google's region, not its locality; «(cities)» alone misses it
    primaryTypes: ['locality', 'administrative_area_level_1', 'colloquial_area', 'postal_town'],
    classicTypes: ['(cities)'],
    keep: () => true,
  },
  // the add flow's map search: a venue, a street or a city, as typed
  any: { primaryTypes: null, classicTypes: undefined, keep: () => true },
};

const askSuggestions = async (p, q, { language, bias, sessionToken, kind }) => {
  const spec = KINDS[kind] || KINDS.venue;
  if (p.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    const { suggestions = [] } = await p.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: q,
      language,
      ...(spec.primaryTypes ? { includedPrimaryTypes: spec.primaryTypes } : {}),
      ...(sessionToken ? { sessionToken } : {}),
      ...(bias ? { locationBias: bias } : {}),
    });
    return suggestions
      .map((s) => s && s.placePrediction)
      .filter(Boolean)
      .filter((pp) => spec.keep(pp.types))
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
        ...(spec.classicTypes ? { types: spec.classicTypes } : {}),
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

/**
 * Venues (or, with kind 'city', cities) for what was typed, biased to `near`
 * ({ lat, lng }) when known. Each: { placeId, main, secondary, toPlace? }.
 * Throws when the library is not there, so the caller can offer the manual
 * way instead.
 *
 * Asked in the UI's language, except abroad: near a point outside Ukraine at
 * once in English, and otherwise every suggestion that is not Ukrainian is
 * swapped for its English twin (one more request, only when there is one).
 */
export const fetchVenueSuggestions = async (input, {
  near = null, sessionToken = null, language = placeLanguage(), kind = 'venue',
} = {}) => {
  const q = String(input || '').trim();
  if (q.length < 2) return [];
  const p = placesLib();
  if (!p) throw new Error('places_unavailable');

  const known = near && Number.isFinite(near.lat) && Number.isFinite(near.lng);
  const bias = known ? { center: { lat: near.lat, lng: near.lng }, radius: BIAS_RADIUS_M } : null;
  const lang = known && !inUkraineBox(near) ? 'en' : language;

  const list = await askSuggestions(p, q, { language: lang, bias, sessionToken, kind });
  if (lang === 'en' || !list.some(wantsEnglish)) return list;
  const english = new Map(
    (await askSuggestions(p, q, { language: 'en', bias, sessionToken, kind })).map((s) => [s.placeId, s])
  );
  return list.map((s) => (wantsEnglish(s) && english.get(s.placeId)) || s);
};

/** Cities for the city menu: see fetchVenueSuggestions. */
export const fetchCitySuggestions = (input, options = {}) => fetchVenueSuggestions(input, { ...options, kind: 'city' });

const latLngOf = (loc) => {
  if (!loc) return null;
  const lat = typeof loc.lat === 'function' ? loc.lat() : (loc.lat ?? loc.latitude);
  const lng = typeof loc.lng === 'function' ? loc.lng() : (loc.lng ?? loc.longitude);
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
};

const displayNameOf = (place) => (typeof place.displayName === 'string' ? place.displayName : (place.displayName?.text || ''));

/** A Maps JS Place (fetchFields done) → our venue shape. */
export const venueFromJsPlace = (place) => {
  if (!place) return null;
  const location = latLngOf(place.location);
  const name = displayNameOf(place);
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

const abroadJs = (place) => isAbroadCode(countryCodeOf(place?.addressComponents));

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

/** The same place asked again in English; null when that fails. */
const inEnglish = async (p, placeId, fields) => {
  try {
    if (!p?.Place) return null;
    const place = new p.Place({ id: placeId, requestedLanguage: 'en' });
    await place.fetchFields({ fields });
    return place;
  } catch (e) {
    return null;
  }
};

/**
 * The picked suggestion in full, in Ukrainian (see the note on top), or in
 * English when Google says it is abroad. With a Ukrainian UI the new
 * library's prediction carries the search session into the details call (one
 * billed session); otherwise a Place by id asked in Ukrainian, and as the last
 * resort the REST lookup the add flow already uses (abroad in English too).
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
      if (venue && abroadJs(place)) return venueFromJsPlace(await inEnglish(p, suggestion.placeId, FIELDS)) || venue;
      if (venue) return venue;
    }
  } catch (e) {
    // fall through to REST
  }
  return venueFromLookup(await lookup(suggestion.placeId, DATA_LANGUAGE));
};

const CITY_FIELDS = ['id', 'displayName', 'addressComponents', 'location'];

/**
 * A city picked in the city menu: its name (Ukrainian at home, English
 * abroad, as venues are filed) and where to centre the map.
 * { name, location, countryCode } or null.
 */
export const fetchCityDetails = async (suggestion, { lookup = fetchPlaceById } = {}) => {
  const p = placesLib();
  const shape = (name, location, countryCode) => (name && location ? { name, location, countryCode } : null);
  try {
    if (p?.Place) {
      let place = new p.Place({ id: suggestion.placeId, requestedLanguage: DATA_LANGUAGE });
      await place.fetchFields({ fields: CITY_FIELDS });
      if (abroadJs(place)) place = (await inEnglish(p, suggestion.placeId, CITY_FIELDS)) || place;
      const city = shape(displayNameOf(place), latLngOf(place.location), countryCodeOf(place.addressComponents));
      if (city) return city;
    }
  } catch (e) {
    // fall through to REST
  }
  const found = await lookup(suggestion.placeId, DATA_LANGUAGE);
  return found ? shape(found.name, latLngOf(found.location), found.countryCode || '') : null;
};

const NEAR_RADIUS_M = 500;
const NEAR_TYPES = ['restaurant', 'cafe', 'bar', 'meal_takeaway', 'food_court'];

/**
 * Google's eating places around the phone, nearest first, as venues: for a
 * person whose table is somewhere our map has nothing yet (Tokyo, 11.2026).
 * Through the Maps JS library where it has Place.searchNearby, else the REST
 * search the map's tap already uses; [] when Google is not loaded at all.
 * Ukrainian at home, English abroad, like every venue.
 */
export const fetchGoogleNearby = async (point, { radius = NEAR_RADIUS_M, limit = 5 } = {}) => {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return [];
  const p = placesLib();
  if (!p) return [];
  if (p.Place?.searchNearby) {
    const ask = async (language) => {
      const { places = [] } = await p.Place.searchNearby({
        fields: FIELDS,
        locationRestriction: { center: { lat: point.lat, lng: point.lng }, radius },
        includedPrimaryTypes: NEAR_TYPES,
        maxResultCount: 8,
        rankPreference: p.SearchNearbyRankPreference?.DISTANCE || 'DISTANCE',
        language,
      });
      return places;
    };
    const language = inUkraineBox(point) ? DATA_LANGUAGE : 'en';
    let places = await ask(language);
    if (language !== 'en' && places.some(abroadJs)) {
      const english = new Map((await ask('en')).map((pl) => [pl.id, pl]));
      places = places.map((pl) => (abroadJs(pl) && english.get(pl.id)) || pl);
    }
    return places.map(venueFromJsPlace).filter(Boolean).slice(0, limit);
  }
  const list = await fetchNearbyVenues(point.lat, point.lng, radius);
  return list.map(venueFromLookup).filter(Boolean).slice(0, limit);
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
