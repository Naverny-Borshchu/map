/**
 * «Який він»: what a borshch is like, from the answers of Оцінювання 3.0
 * (NAV-216). The API sends it denormalized on every borshch (SPEC «Контракт
 * API»):
 *
 *   profile: {
 *     reviews,                                     scheme-3 ratings that count publicly
 *     meat_amount: { counts: [4], n },             нема, пару волокон, кілька шматків, у кожній ложці
 *     beet_amount: { counts: [3], n },             ледь є, помірно, багато
 *     beet_flavor: { counts: [5], n },             1..5
 *     density:     { mean, n, legacy_n },          1..10, the founders' catalogue included
 *     salt:        { mean, n, legacy_n, low, high },  1..9, low = ≤ 3, high = ≥ 7
 *     sides:       { counts: { code: c }, n, none },
 *     meat_taste / aftertaste / serving_taste: { mean, n }   1..5
 *   }
 *
 * normalizeProfile turns whatever arrived into that shape or null, so the
 * card and the filters never meet a missing field: a backend that does not
 * send `profile` yet, or sends half of it, is a borshch nobody described.
 */
import { SALT_MAX, SIDE_CODES } from '../components/QuestFlow/answers';

const count = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

const dist = (raw, len) => {
  const counts = Array.from({ length: len }, (_, i) => count(raw?.counts?.[i]));
  return { counts, n: count(raw?.n) || sum(counts) };
};

const meanOf = (raw, max) => {
  const m = raw && raw.mean !== null && raw.mean !== undefined ? Number(raw.mean) : NaN;
  return {
    mean: Number.isFinite(m) && m >= 1 && m <= max ? m : null,
    n: count(raw?.n),
    legacy_n: count(raw?.legacy_n),
  };
};

export const normalizeProfile = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sidesRaw = raw.sides && typeof raw.sides === 'object' ? raw.sides : {};
  const sideCounts = Object.fromEntries(SIDE_CODES.map((c) => [c, count(sidesRaw.counts?.[c])]));
  const salt = meanOf(raw.salt, SALT_MAX);
  return {
    reviews: count(raw.reviews),
    meat_amount: dist(raw.meat_amount, 4),
    beet_amount: dist(raw.beet_amount, 3),
    beet_flavor: dist(raw.beet_flavor, 5),
    density: meanOf(raw.density, 10),
    salt: { ...salt, low: count(raw.salt?.low), high: count(raw.salt?.high) },
    sides: { counts: sideCounts, n: count(sidesRaw.n), none: count(sidesRaw.none) },
    meat_taste: meanOf(raw.meat_taste, 5),
    aftertaste: meanOf(raw.aftertaste, 5),
    serving_taste: meanOf(raw.serving_taste, 5),
  };
};

/** The most common answer (a tie goes to the larger amount) and how many gave it. */
export const modeOf = (d) => {
  if (!d || !d.n) return null;
  let best = 0;
  d.counts.forEach((c, i) => { if (c >= d.counts[best]) best = i; });
  return d.counts[best] ? { index: best, count: d.counts[best], total: d.n } : null;
};

/** Mean of a 1..5 distribution, or null. */
export const distMean = (d) => {
  const total = d ? sum(d.counts) : 0;
  if (!total) return null;
  return d.counts.reduce((acc, c, i) => acc + c * (i + 1), 0) / total;
};

/** How many answers stand behind a mean, the founders' catalogue included. */
export const meanCount = (m) => (m ? m.n + m.legacy_n : 0);

export const hasDensity = (p) => Boolean(p && p.density.mean !== null && meanCount(p.density) > 0);
export const hasSalt = (p) => Boolean(p && p.salt.mean !== null && meanCount(p.salt) > 0);
export const hasSides = (p) => Boolean(p && p.sides.n > 0);
const hasTaste = (m) => Boolean(m && m.mean !== null && m.n > 0);

/** Anything at all to show under «Який він». */
export const hasDescription = (p) => Boolean(
  p && (p.meat_amount.n > 0 || p.beet_amount.n > 0 || p.beet_flavor.n > 0 || hasDensity(p) || hasSalt(p) || hasSides(p))
);

/** Anything to show under «Оцінки». */
export const hasTastes = (p) => Boolean(p && (hasTaste(p.meat_taste) || hasTaste(p.aftertaste) || hasTaste(p.serving_taste)));
export const tasteAvailable = hasTaste;

/** Sides that at least half of the answers mention, and the rest that were mentioned. */
export const sidesSplit = (p) => {
  if (!hasSides(p)) return { main: [], rest: [], mostlyNone: false };
  const { counts, n, none } = p.sides;
  const main = SIDE_CODES.filter((c) => counts[c] * 2 >= n && counts[c] > 0);
  const rest = SIDE_CODES.filter((c) => counts[c] > 0 && counts[c] * 2 < n);
  return { main, rest, mostlyNone: !main.length && none * 2 >= n };
};

/** 1..max, for the word of a mean: 7,2 → 7. */
export const roundedStep = (mean, max) => Math.max(1, Math.min(max, Math.round(mean)));

/** One decimal, in the language's own way: 7,2 / 7.2. */
export const formatMean = (mean, lang = 'uk') => {
  const s = (Math.round(mean * 10) / 10).toFixed(1);
  return lang === 'uk' ? s.replace('.', ',') : s;
};

// --- the filters (utils/filtering) ------------------------------------------------

const atLeastHalf = (part, n) => n > 0 && part * 2 >= n;

/**
 * The «Який він» chips of the filter sheet. An unknown borshch matches none
 * of them: a description nobody gave cannot promise «густий».
 */
export const TRAITS = {
  meaty: (p) => atLeastHalf(p.meat_amount.counts[3], p.meat_amount.n),
  beety: (p) => atLeastHalf(p.beet_amount.counts[2], p.beet_amount.n) || (distMean(p.beet_flavor) ?? 0) >= 4,
  thick: (p) => hasDensity(p) && p.density.mean >= 7,
  thin: (p) => hasDensity(p) && p.density.mean <= 4,
  pampushky: (p) => atLeastHalf(p.sides.counts.pampushky, p.sides.n),
  salo: (p) => atLeastHalf(p.sides.counts.salo, p.sides.n),
};

export const TRAIT_KEYS = Object.keys(TRAITS);

export const hasTrait = (profile, key) => Boolean(profile && TRAITS[key] && TRAITS[key](profile));
