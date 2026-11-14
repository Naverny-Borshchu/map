/**
 * Small readings of a table as the API returns it (api/tables.js), shared by
 * the host screen, the guest flow, the results and the story image.
 */

/** The API's criterion names → the app's own labels (rate.* in i18n). */
export const CRITERION_LABEL = {
  rating_meat: 'rate.meat',
  rating_beet: 'rate.beetroot',
  rating_density: 'rate.density',
  rating_salt: 'rate.salt',
  rating_aftertaste: 'rate.aftertaste',
  rating_serving: 'rate.serving',
  overall_rating: 'rate.overall',
};

/** In the order the rating asks them (QuestFlow/answers SCALE_KEYS). */
export const CRITERIA_ORDER = [
  'rating_meat', 'rating_beet', 'rating_density', 'rating_salt', 'rating_aftertaste', 'rating_serving',
];

/**
 * How a borshch on the table is called on screen. While a blind table is open
 * a guest knows it only by its number; the name, once the API gives it, is the
 * dish name (translated for the English UI).
 */
export const borschTitle = (entry, t, dishLabel = (n) => n) => {
  const name = entry?.borsch?.name;
  return name ? dishLabel(name) : t('table.borschN', { n: entry?.position ?? '' });
};

/** The first borshch this person has not rated yet, or null when all are done. */
export const nextUnrated = (borsches = [], rated = []) => {
  const done = new Set((rated || []).map(Number));
  const left = (borsches || []).map((b) => b.position).filter((p) => !done.has(Number(p)));
  return left.length ? Math.min(...left) : null;
};

/** 7.4 → "7.4", 8 → "8", null → "". One decimal at most, as on the borshch card. */
export const formatAverage = (value) => {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '';
  return String(Math.round(n * 10) / 10);
};

/**
 * The table's most divisive criterion as words: «Солоність» and, on a table of
 * several borshch, which one. null when everybody agreed (or too few rated).
 */
export const divisiveLabel = (results, t, dishLabel = (n) => n) => {
  const d = results?.most_divisive;
  if (!d || !CRITERION_LABEL[d.criterion]) return null;
  const criterion = t(CRITERION_LABEL[d.criterion]);
  const several = (results?.borsches || []).length > 1;
  if (!several) return { criterion, borsch: null };
  const entry = (results.borsches || []).find((b) => b.position === d.position);
  return { criterion, borsch: entry ? borschTitle(entry, t, dishLabel) : t('table.borschN', { n: d.position }) };
};

/** A date the way the app writes dates: «21 листопада», «21 November». */
export const tableDate = (iso, lang = 'uk') => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'long' });
};

/**
 * The venue's address line. Google's addresses usually carry the city already
 * («…, 10А, Київ, 04070»), so the city is added only when it is missing.
 */
export const addressLine = (place, cityLabel = (c) => c) => {
  const address = String(place?.address || '').trim();
  const city = String(place?.city || '').trim();
  if (!address) return city ? cityLabel(city) : '';
  if (!city || address.includes(city)) return address;
  return `${address}, ${cityLabel(city)}`;
};
