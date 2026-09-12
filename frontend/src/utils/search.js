/**
 * Client-side search over venues and dishes for the topbar autocomplete.
 *
 * Pure functions, no dependencies beyond the i18n transliterator (the SAME
 * romanisation used to display venue names in the English UI, so whatever
 * label a user has seen is also what the index matches against).
 *
 * Matching runs in tiers; a lower tier always outranks a higher one:
 *   0 — exact prefix of a real name (Ukrainian or curated English label);
 *       a word-boundary prefix ("хата" in "Пузата хата") counts too, with a
 *       small penalty so name-start matches sort first
 *   1 — substring anywhere in a real name
 *   2 — synonym / transliteration / keyboard-layout match: the query and the
 *       names are folded to a canonical Latin key (г/g/h, х/kh, ц/ts… collapse)
 *       so «glek», «hlek» and «Глек» all meet; a query typed in the wrong
 *       keyboard layout («uktr» for «глек») is converted and retried
 *   3 — fuzzy fallback: Levenshtein distance ≤1 for short words, ≤2 for long
 *       ones, tried only when nothing above matched for that item
 *
 * Within a tier: earlier match position wins, then higher `boost` (rating),
 * then the alphabet.
 */
import { transliterate } from '../i18n/venueNames';

const CYRILLIC_RE = /[Ѐ-ӿ]/;

/** Lowercase, drop apostrophes, turn punctuation into single spaces. */
export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[’'ʼ`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Collapse the ambiguities of Latin romanisation so different spellings of
 * the same Ukrainian word produce one key: glek/hlek → hlek, kharkiv/harkiv →
 * harkiv, puzata/pusata stay apart (s≠z is a real difference — fuzzy handles
 * typos). Digraphs go first, single letters after, doubled letters collapse.
 */
const FOLD_DIGRAPHS = [
  ['shch', 'ş'],
  ['sch', 'ş'],
  ['sh', 'ş'],
  ['zgh', 'ž'],
  ['zh', 'ž'],
  ['kh', 'h'],
  ['ch', 'č'],
  ['ts', 'c'],
  ['ph', 'f'],
];

export const foldLatin = (s) => {
  let out = s;
  for (const [from, to] of FOLD_DIGRAPHS) out = out.split(from).join(to);
  return out
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(/g/g, 'h')
    .replace(/j/g, 'i')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1');
};

/** Canonical Latin key for any string, Cyrillic or Latin. */
export const translitKey = (s) => {
  const n = normalize(s);
  return foldLatin(CYRILLIC_RE.test(n) ? normalize(transliterate(n)) : n);
};

// QWERTY ↔ ЙЦУКЕН (Ukrainian). Applied to the RAW query before punctuation is
// stripped — [ ; ' , . are letters on the Ukrainian layout.
const LAT_TO_CYR = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ',
  p: 'з', '[': 'х', ']': 'ї', a: 'ф', s: 'і', d: 'в', f: 'а', g: 'п',
  h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'є', z: 'я', x: 'ч',
  c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю',
};
const CYR_TO_LAT = Object.fromEntries(
  Object.entries(LAT_TO_CYR).map(([k, v]) => [v, k])
);

/** Retype the string in the other keyboard layout, char by char. */
export const switchLayout = (s) =>
  [...String(s || '').toLowerCase()]
    .map((ch) => LAT_TO_CYR[ch] || CYR_TO_LAT[ch] || ch)
    .join('');

/**
 * The forms a query is tried in: [0] as typed (drives tiers 0–1), then the
 * other-keyboard-layout reading if it differs (tier 2 only).
 */
export const queryVariants = (query) => {
  const raw = String(query || '').toLowerCase();
  const base = normalize(raw);
  if (!base) return [];
  const variants = [base];
  const switched = normalize(switchLayout(raw));
  if (switched && switched !== base && /\p{L}/u.test(switched)) {
    variants.push(switched);
  }
  return variants;
};

/** Levenshtein distance with an early exit once `max` cannot be met. */
export const levenshtein = (a, b, max = Infinity) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

/** ≤1 edit for short words, ≤2 for long; nothing under 3 letters. */
export const maxEditsFor = (len) => {
  if (len < 3) return 0;
  if (len < 6) return 1;
  return 2;
};

/**
 * Build the searchable index.
 * @param items [{ id, kind, label, texts: [ukName, enLabel, …], boost, … }]
 *   `texts` are the item's real names in both languages — that is the whole
 *   synonym mechanism: every text is indexed as a first-class name.
 */
export const buildIndex = (items) =>
  (items || [])
    .filter((it) => it && (it.texts || []).some((t) => normalize(t)))
    .map((it) => {
      const texts = (it.texts || []).filter(Boolean);
      const norm = [...new Set(texts.map(normalize).filter(Boolean))];
      const keys = [...new Set(texts.map(translitKey).filter(Boolean))];
      const words = [
        ...new Set([...norm, ...keys].flatMap((t) => t.split(' '))),
      ];
      return { ...it, _norm: norm, _keys: keys, _words: words };
    });

// tier → base score; smaller is better. Position/penalty offsets stay < 100.
const TIER = { PREFIX: 0, SUBSTRING: 100, TRANSLIT: 200, FUZZY: 300 };

const matchAgainst = (texts, needle) => {
  let best = null;
  for (const t of texts) {
    if (t.startsWith(needle)) return { tier: 'PREFIX', offset: 0 };
    const idx = t.indexOf(` ${needle}`);
    if (idx !== -1) {
      best = pickBest(best, { tier: 'PREFIX', offset: 5 });
      continue;
    }
    const at = t.indexOf(needle);
    if (at !== -1) {
      best = pickBest(best, { tier: 'SUBSTRING', offset: Math.min(at, 50) });
    }
  }
  return best;
};

const pickBest = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const sa = TIER[a.tier] + a.offset;
  const sb = TIER[b.tier] + b.offset;
  return sb < sa ? b : a;
};

const scoreOf = (m) => TIER[m.tier] + m.offset;

/** Best match of one indexed entry against the query variants, or null. */
export const matchEntry = (entry, variants) => {
  const typed = variants[0];

  // tiers 0–1: the query as typed, against real names in both languages
  let best = matchAgainst(entry._norm, typed);
  if (best && best.tier === 'PREFIX') return best;

  // tier 2: canonical-Latin keys — covers translit spellings, the synonym
  // reached via romanisation, and wrong-keyboard-layout queries
  for (const v of variants) {
    const key = translitKey(v);
    if (!key) continue;
    const m = matchAgainst(entry._keys, key);
    if (m) {
      best = pickBest(best, {
        tier: 'TRANSLIT',
        offset: (TIER[m.tier] + m.offset) / 10,
      });
    }
  }
  if (best) return best;

  // tier 3: fuzzy fallback, only when nothing above matched
  const candidates = [typed, translitKey(typed)].filter(Boolean);
  let bestDist = Infinity;
  for (const q of candidates) {
    const max = maxEditsFor(q.length);
    if (max === 0) continue;
    for (const w of entry._words) {
      const d = Math.min(
        levenshtein(q, w, max),
        // fuzzy prefix: a query that is the beginning of a longer word,
        // give or take a typo ("puzta" → "puzata hata")
        w.length > q.length ? levenshtein(q, w.slice(0, q.length), max) : Infinity
      );
      if (d <= max && d < bestDist) bestDist = d;
    }
  }
  if (bestDist !== Infinity) return { tier: 'FUZZY', offset: bestDist * 10 };

  return null;
};

/**
 * Search the index. Returns [{ item, tier, score }] sorted best-first.
 */
export const search = (index, query, { limit = 8 } = {}) => {
  const variants = queryVariants(query);
  if (!variants.length) return [];

  const out = [];
  for (const entry of index) {
    const m = matchEntry(entry, variants);
    if (m) out.push({ item: entry, tier: m.tier, score: scoreOf(m) });
  }

  out.sort(
    (a, b) =>
      a.score - b.score ||
      (b.item.boost || 0) - (a.item.boost || 0) ||
      String(a.item.label).localeCompare(String(b.item.label), 'uk')
  );

  return out.slice(0, limit);
};
