/**
 * One implementation of "does this borsch match the filters", shared by the
 * map, the list and the live result count in the filter sheet. Keeping them on
 * separate code paths is how a filter sheet ends up promising a count it does
 * not deliver.
 *
 * Filter model — EMPTY MEANS NO CONSTRAINT. The old model pre-selected every
 * type and every meat, so "filtering" meant deselecting things, and there was
 * no way to tell a default from a choice.
 */
import { hasRating } from './rating';

export const RATING_CRITERIA = [
  { key: 'meat', field: 'rating_meat', i18n: 'rate.meat' },
  { key: 'beetroot', field: 'rating_beet', i18n: 'rate.beetroot' },
  { key: 'density', field: 'rating_density', i18n: 'rate.density' },
  { key: 'salt', field: 'rating_salt', i18n: 'rate.salt' },
  { key: 'aftertaste', field: 'rating_aftertaste', i18n: 'rate.aftertaste' },
  { key: 'serving', field: 'rating_serving', i18n: 'rate.serving' },
];

export const PLACE_TYPES = ['Ресторан', 'Кафе', 'Бістро', 'Паб'];
export const MEAT_TYPES = ["без м'яса", 'курка', 'свинина', 'телятина', 'інше'];

/** Price buckets in UAH; `null` bounds mean open-ended. */
export const PRICE_BUCKETS = [
  { key: 'p0', min: 0, max: 150 },
  { key: 'p1', min: 150, max: 250 },
  { key: 'p2', min: 250, max: 400 },
  { key: 'p3', min: 400, max: null },
];

export const EMPTY_FILTERS = {
  search: '',
  types: [],
  meats: [],
  price: null, // bucket key
  minOverall: 0,
  criteria: {}, // { meat: 7, … } — only values > 0 constrain
};

// Prices are stored as strings like "≈290 ₴"; 0/empty means unknown.
export const priceToUAH = (raw) => {
  if (!raw) return NaN;
  const n = parseFloat(String(raw).trim().replace(/[^\d.,]/g, '').replace(',', '.'));
  return !Number.isFinite(n) || n <= 0 ? NaN : n;
};

// The DB carries free text ("Свинячі ребра", "на яловичому бульйоні", no_meat…).
// null = unknown, which never excludes a borsch.
export const categorizeMeat = (raw) => {
  const v = String(raw || '').toLowerCase().trim();
  if (!v || v.includes('невідомо') || v.includes('немає')) return null;
  if (v.includes('без м') || v === 'no_meat') return "без м'яса";
  if (v.includes('курк') || v.includes('курч')) return 'курка';
  if (v.includes('теля') || v.includes('телят')) return 'телятина';
  if (v.includes('ялович')) return 'телятина';
  if (v.includes('свин') || v.includes('ребр') || v.includes('ребер')) return 'свинина';
  return 'інше';
};

// type_label is equally free-form, and about a third of it is still Russian —
// both languages are matched here on purpose.
export const categorizePlaceType = (raw) => {
  const v = String(raw || '').toLowerCase().trim();
  if (!v) return null;
  if (v.includes('кафе') || v.includes('кав') || v.includes('пекарн') || v.includes('кондитер')) return 'Кафе';
  if (v.includes('бістро') || v.includes('бистро')) return 'Бістро';
  if (v.includes('паб') || v.includes('pub') || v.includes('бар') || v.includes('коктейль')) return 'Паб';
  if (v.includes('ресторан') || v.includes('стейк') || v.includes('бургер') || v.includes('хаус') ||
      v.includes('піц') || v.includes('пиц')) return 'Ресторан';
  return null;
};

export const countActiveFilters = (f = EMPTY_FILTERS) => {
  let n = 0;
  if (f.types?.length) n += 1;
  if (f.meats?.length) n += 1;
  if (f.price) n += 1;
  if (f.minOverall > 0) n += 1;
  n += Object.values(f.criteria || {}).filter((v) => v > 0).length;
  return n;
};

export const hasAnyFilter = (f) => countActiveFilters(f) > 0;

/**
 * @param borsch  mapped borsch (ratings are one-decimal strings, "—" when unrated)
 * @param place   its place, or undefined
 */
export const borschMatches = (borsch, place, f = EMPTY_FILTERS) => {
  if (!borsch) return false;

  // price — unknown prices cannot satisfy a price filter, so they drop out
  if (f.price) {
    const bucket = PRICE_BUCKETS.find((b) => b.key === f.price);
    if (bucket) {
      const p = priceToUAH(borsch.price);
      if (Number.isNaN(p)) return false;
      if (p < bucket.min) return false;
      if (bucket.max !== null && p >= bucket.max) return false;
    }
  }

  // meat — unknown category never excludes
  if (f.meats?.length) {
    const cat = categorizeMeat(borsch.type_meat);
    if (cat !== null && !f.meats.includes(cat)) return false;
  }

  // overall score
  if (f.minOverall > 0) {
    if (!hasRating(borsch.overall_rating)) return false;
    if (Number(borsch.overall_rating) < f.minOverall) return false;
  }

  // taste criteria
  for (const c of RATING_CRITERIA) {
    const min = f.criteria?.[c.key] || 0;
    if (min > 0) {
      const v = borsch[c.field];
      if (!hasRating(v) || Number(v) < min) return false;
    }
  }

  // venue type — unknown type never excludes
  if (f.types?.length) {
    const cat = categorizePlaceType(place?.type_label || place?.type);
    if (cat !== null && !f.types.includes(cat)) return false;
    if (cat === null && !place) return false;
  }

  return true;
};

/** Borsches passing the filters, given a place lookup. */
export const filterBorsches = (borsches, placeById, f) =>
  (borsches || []).filter((b) => borschMatches(b, placeById(b.place_id), f));

/** Places that have at least one matching borsch. */
export const placesWithMatches = (places, borsches, f) => {
  const byId = new Map((places || []).map((p) => [String(p.id), p]));
  const keep = new Set();
  (borsches || []).forEach((b) => {
    const place = byId.get(String(b.place_id));
    if (place && borschMatches(b, place, f)) keep.add(String(place.id));
  });
  return (places || []).filter((p) => keep.has(String(p.id)));
};
