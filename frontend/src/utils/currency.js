/**
 * Which price the add-borsch quest suggests, by country.
 *
 * The flow used to hardcode UAH quick-tap values (120/160/200/240/300) for
 * every venue, Ukrainian or not. That was fine while the map only covered
 * Ukraine; it stopped being fine the moment the diaspora started adding
 * venues abroad (first case: Berlin) — a Ukrainian using ₴120 as "cheap" for
 * a bowl of borsch in Germany is off by roughly a factor of ten.
 *
 * The country name comes from the tail of Google's formatted address (see
 * `guessCountryFromAddress` in AddBorsch.jsx) — it is a best-effort guess,
 * same reliability class as the existing city/street parsing in that file.
 * Unrecognised or missing input intentionally falls back to UAH: that is the
 * primary market and the safe default the app has always shipped.
 */

const EUR_COUNTRY_NAMES = [
  'germany', 'deutschland',
  'austria', 'österreich', 'osterreich',
  'france',
  'italy', 'italia',
  'spain', 'españa', 'espana',
  'portugal',
  'netherlands', 'the netherlands', 'nederland',
  'belgium', 'belgië', 'belgie',
  'ireland',
  'finland',
  'greece',
  'slovakia', 'slovensko',
  'slovenia', 'slovenija',
  'estonia', 'eesti',
  'latvia', 'latvija',
  'lithuania', 'lietuva',
  'luxembourg',
  'malta',
  'cyprus',
  'croatia', 'hrvatska',
];

export const PRICE_CHIPS_BY_CURRENCY = {
  UAH: { unit: 'flow.unitUah', chips: [120, 160, 200, 240, 300] },
  // A bowl of borsch at a sit-down place in the eurozone realistically runs
  // 8-18 EUR — nowhere near the UAH numbers once converted.
  EUR: { unit: 'flow.unitEur', chips: [8, 10, 12, 15, 18] },
};

/** Best-effort: turn a guessed country name into a currency's chip set. */
export const getPriceChipsForCountry = (country) => {
  const key = String(country || '').trim().toLowerCase();
  if (EUR_COUNTRY_NAMES.includes(key)) return PRICE_CHIPS_BY_CURRENCY.EUR;
  return PRICE_CHIPS_BY_CURRENCY.UAH;
};

/**
 * Google formats addresses as "street, number, city, postcode, country" —
 * the same shape AddBorsch.jsx already parses for street/city. The country,
 * when Google knows it, is the trailing part; a bare postcode (no country
 * known) is not a country and must not be treated as one.
 */
export const guessCountryFromAddress = (address) => {
  const parts = String(address || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return /^\d{4,6}$/.test(last) ? '' : last;
};
