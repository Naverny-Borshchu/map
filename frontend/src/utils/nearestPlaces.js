import { distanceMeters, placePoint } from './distance';
import { normalize, queryVariants, translitKey } from './search';

/**
 * «Ти зараз тут?»: the venues of our own catalogue closest to where the phone
 * is, so a person who has just been brought a borshch taps their venue instead
 * of hunting for it on a map.
 *
 * A venue further than NEAR_LIMIT_M is not «here»: GPS indoors is off by a few
 * hundred metres at worst, and asking «are you here?» about a place across
 * town reads as a bug. Beyond it the screen goes straight to search.
 */
export const NEAR_LIMIT_M = 3000;

/** Up to `limit` venues within `maxMeters` of `point`, nearest first. */
export const nearestPlaces = (places, point, { limit = 3, maxMeters = NEAR_LIMIT_M } = {}) => {
  if (!point || !Array.isArray(places)) return [];
  return places
    .map((place) => ({ place, distance: distanceMeters(point, placePoint(place)) }))
    .filter((x) => x.distance !== null && Number.isFinite(x.distance) && x.distance <= maxMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
};

/**
 * Venues whose name (or city) matches what was typed. Same folding as the
 * map's search: «Ватра», «vatra» and a query typed in the wrong layout meet.
 * Name-start matches first, then anywhere in the name, then the city; closer
 * venues first within a group when the position is known.
 */
export const searchPlaces = (places, query, point = null, limit = 8) => {
  const q = normalize(query);
  if (!q || !Array.isArray(places)) return [];
  const qKey = translitKey(query);
  // the query retyped in the other keyboard layout («dfnhf» → «ватра»)
  const switched = queryVariants(query)[1] || null;
  const scored = [];
  places.forEach((place) => {
    const name = normalize(place.name);
    const nameKey = translitKey(place.name);
    const city = normalize(place.city);
    let tier = null;
    if (name.startsWith(q) || nameKey.startsWith(qKey)) tier = 0;
    else if (name.includes(q) || (qKey.length > 1 && nameKey.includes(qKey))) tier = 1;
    else if (switched && name.includes(switched)) tier = 2;
    else if (city.startsWith(q)) tier = 3;
    if (tier === null) return;
    scored.push({ place, tier, distance: point ? distanceMeters(point, placePoint(place)) : null });
  });
  return scored
    .sort((a, b) =>
      a.tier - b.tier
      || (a.distance ?? Infinity) - (b.distance ?? Infinity)
      || String(a.place.name).localeCompare(String(b.place.name)))
    .slice(0, limit)
    .map(({ place, distance }) => ({ place, distance }));
};

/** "120 м" / "1,4 км" in Ukrainian, "120 m" / "1.4 km" in English. */
export const formatDistanceLocal = (m, t, lang = 'uk') => {
  if (m === null || m === undefined || !Number.isFinite(m)) return '';
  if (m < 950) return t('dist.m', { n: Math.max(10, Math.round(m / 10) * 10) });
  const km = (m / 1000).toFixed(m < 9500 ? 1 : 0);
  return t('dist.km', { n: lang === 'uk' ? km.replace('.', ',') : km });
};
