/**
 * Filters ⇄ query string.
 *
 * A filtered view was previously unshareable: "the 9+ borsches in Lviv" existed
 * only inside one tab's memory, and a reload threw it away. Putting the state
 * in the URL makes it linkable, bookmarkable and survivable across reloads —
 * and the browser's Back button starts meaning something on the map.
 *
 * The encoding is deliberately short and human-legible:
 *   ?q=борщ&city=Львів&score=8&meat=курка,свинина&type=Кафе&price=p1&trait=thick,pampushky&sort=near
 *
 * `c=meat:9` (the minimum per criterion before Оцінювання 3.0) is no longer
 * written, and an old link that carries it opens without it.
 */
import { EMPTY_FILTERS, EXCLUSIVE_TRAITS, MEAT_TYPES, PLACE_TYPES, PRICE_BUCKETS, TRAITS } from './filtering';

export const SORTS = ['best', 'near', 'cheapest', 'expensive'];

const BUCKET_KEYS = PRICE_BUCKETS.map((b) => b.key);

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

/** Build the params for a filter state. Only non-default values are written. */
export const filtersToParams = (filters = {}, { city, sort } = {}) => {
  const p = new URLSearchParams();
  const f = { ...EMPTY_FILTERS, ...filters };

  if (f.search) p.set('q', f.search);
  if (city) p.set('city', city);
  if (f.minOverall > 0) p.set('score', String(f.minOverall));
  if (f.meats?.length) p.set('meat', f.meats.join(','));
  if (f.types?.length) p.set('type', f.types.join(','));
  if (f.price) p.set('price', f.price);

  const traits = TRAITS.filter((k) => (f.traits || []).includes(k));
  if (traits.length) p.set('trait', traits.join(','));

  if (sort && sort !== 'best' && SORTS.includes(sort)) p.set('sort', sort);

  return p;
};

/**
 * Read a filter state back. Unknown values are dropped rather than trusted —
 * a URL is user input, and a bogus `meat=steak` must not silently produce an
 * empty map with no explanation.
 */
export const paramsToFilters = (params) => {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
  const filters = { ...EMPTY_FILTERS };
  let touched = false;
  const mark = (v) => { touched = touched || v; return v; };

  const q = p.get('q');
  if (q) { filters.search = q; mark(true); }

  const score = Number(p.get('score'));
  if (Number.isFinite(score) && score >= 1 && score <= 10) { filters.minOverall = score; mark(true); }

  const meats = list(p.get('meat')).filter((m) => MEAT_TYPES.includes(m));
  if (meats.length) { filters.meats = meats; mark(true); }

  const types = list(p.get('type')).filter((t) => PLACE_TYPES.includes(t));
  if (types.length) { filters.types = types; mark(true); }

  const price = p.get('price');
  if (price && BUCKET_KEYS.includes(price)) { filters.price = price; mark(true); }

  const traits = [];
  list(p.get('trait')).forEach((k) => {
    // «густий» and «рідкий» together match nothing: the first one wins
    if (TRAITS.includes(k) && !traits.includes(k) && !traits.includes(EXCLUSIVE_TRAITS[k])) traits.push(k);
  });
  if (traits.length) { filters.traits = TRAITS.filter((k) => traits.includes(k)); mark(true); }

  const city = p.get('city') || null;
  const sortRaw = p.get('sort');
  const sort = SORTS.includes(sortRaw) ? sortRaw : null;

  return { filters, city, sort, hasAny: touched || !!city || !!sort };
};

/** True when two param sets carry the same view — avoids pointless history churn. */
export const sameParams = (a, b) => {
  const norm = (p) => [...p.entries()].sort(([x], [y]) => x.localeCompare(y))
    .map(([k, v]) => `${k}=${v}`).join('&');
  return norm(a) === norm(b);
};
