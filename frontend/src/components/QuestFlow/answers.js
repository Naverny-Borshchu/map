/**
 * Оцінювання 3.0 (NAV-216, approved by Andrii 16.11.2026): two questions per
 * part of the borshch instead of one score.
 *
 *   «скільки / яка»  describes the borshch, there is no good or bad in it:
 *                    concrete answers with a drawn bowl, or a 1..10 scale with
 *                    Pasha's word for every number (density, salt);
 *   «смак»           how good that part was: five words, no numbers.
 *
 * Six parts, one screen each (Мʼясо, Буряк, Густина, Сіль, Подача, Післясмак),
 * then «Загалом» 1..10, the only required answer and the only one the map's
 * rating is made of. Nothing advances by itself: «Далі» wakes up with the
 * first answer of a screen, «Пропустити» skips a part.
 *
 * The answers keep the API's own names (the contract in SPEC.md, «Контракт
 * API»), so the payload is the state minus the bookkeeping:
 *
 *   meat_amount   0..3  (0 = нема: the taste question goes away)
 *   meat_taste    1..5
 *   beet_amount   1..3
 *   beet_flavor   1..5  (how strongly it is felt, not «tasty»)
 *   density       1..10
 *   salt          1..9  (5 = саме те, exactly in the middle: four steps each way)
 *   sides         null = not answered, [] = «Нічого», or some of SIDE_CODES
 *   serving_taste 1..5
 *   aftertaste    1..5
 *   overall       1..10 (sent as overall_rating)
 */

export const RATING_SCHEME = 3;

export const SIDE_CODES = [
  'sour_cream', 'pampushky', 'garlic', 'salo', 'bread', 'croutons', 'greens', 'onion', 'horseradish', 'chili',
];

/**
 * Salt runs 1..9 so that «саме те» is the middle stop (Pasha, 16.11: on 1..10
 * the 5 sat left of centre), density keeps the 1..10 of Pasha's template.
 */
export const SALT_MAX = 9;
export const SALT_BEST = 5;
export const DENSITY_MAX = 10;

/** Ten density numbers onto the four hand-drawn broth bowls (bowlArt). */
export const DENSITY_LEVEL = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4];

const RANGES = {
  meat_amount: [0, 3],
  meat_taste: [1, 5],
  beet_amount: [1, 3],
  beet_flavor: [1, 5],
  density: [1, 10],
  salt: [1, SALT_MAX],
  serving_taste: [1, 5],
  aftertaste: [1, 5],
  overall: [1, 10],
};

export const ANSWER_KEYS = [...Object.keys(RANGES), 'sides'];

export const emptyAnswers = () => ({
  meat_amount: null,
  meat_taste: null,
  beet_amount: null,
  beet_flavor: null,
  density: null,
  salt: null,
  sides: null,
  serving_taste: null,
  aftertaste: null,
  overall: null,
});

const inRange = (key, v) => {
  const [lo, hi] = RANGES[key];
  return Number.isInteger(v) && v >= lo && v <= hi;
};

/**
 * Answers read back from a draft: anything out of range or of the wrong
 * shape is dropped, so a stale or hand-edited draft can only lose answers,
 * never send nonsense.
 */
export const restoreAnswers = (raw) => {
  const out = emptyAnswers();
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(RANGES).forEach((key) => {
    if (inRange(key, raw[key])) out[key] = raw[key];
  });
  if (Array.isArray(raw.sides)) out.sides = SIDE_CODES.filter((c) => raw.sides.includes(c));
  if (out.meat_amount === 0) out.meat_taste = null;
  return out;
};

// --- the screens ----------------------------------------------------------------

/**
 * One part of the borshch per screen. `kind` picks the control:
 *   amount  big cards with a top-view bowl (bowlArt), one per value
 *   taste   five word pills, 1..5
 *   scale   a 1..10 slider of ten stops with a word under the chosen number
 *   sides   check chips, several at once, «Нічого» clears them
 */
export const RATING_COMPONENTS = [
  {
    key: 'meat',
    illu: 'meat',
    questions: [
      { key: 'meat_amount', kind: 'amount', draw: 'meat', values: [0, 1, 2, 3] },
      { key: 'meat_taste', kind: 'taste', hideIf: (a) => a.meat_amount === 0, note: 'r3.meatNone' },
    ],
  },
  {
    key: 'beet',
    illu: 'beet',
    questions: [
      { key: 'beet_amount', kind: 'amount', draw: 'beet', values: [1, 2, 3] },
      { key: 'beet_flavor', kind: 'taste', layout: 'pairs' },
    ],
  },
  { key: 'density', illu: 'broth', questions: [{ key: 'density', kind: 'scale', max: DENSITY_MAX }] },
  { key: 'salt', illu: 'salt', questions: [{ key: 'salt', kind: 'scale', max: SALT_MAX, best: SALT_BEST }] },
  {
    key: 'serving',
    illu: 'serving',
    questions: [
      { key: 'sides', kind: 'sides' },
      { key: 'serving_taste', kind: 'taste' },
    ],
  },
  { key: 'aftertaste', illu: 'aftertaste', questions: [{ key: 'aftertaste', kind: 'taste', layout: 'pairs' }] },
];

/** The rating half of every journey: six parts, then «Загалом». */
export const ratingSteps = () => [
  ...RATING_COMPONENTS.map((c, i) => ({
    type: 'component',
    key: c.key,
    i18n: `r3.${c.key}.title`,
    illu: c.illu,
    index: i + 1,
    of: RATING_COMPONENTS.length,
    questions: c.questions,
  })),
  { type: 'overall', key: 'overall', i18n: 'r3.overall.title', illu: 'overall' },
];

/** The questions of a screen that are on it right now («Нема» hides the meat taste). */
export const visibleQuestions = (step, answers) =>
  (step?.questions || []).filter((q) => !(q.hideIf && q.hideIf(answers || {})));

export const isAnswered = (key, answers) => {
  const v = (answers || {})[key];
  if (key === 'sides') return Array.isArray(v);
  return v !== null && v !== undefined;
};

/**
 * How much of a screen is answered, 0..1: drives the progress segment, the
 * coins and the «Пропустити» link (gone once the screen is complete).
 */
export const stepShare = (step, values) => {
  if (!step) return 0;
  if (step.type === 'component') {
    const qs = visibleQuestions(step, values);
    if (!qs.length) return 0;
    return qs.filter((q) => isAnswered(q.key, values)).length / qs.length;
  }
  if (step.type === 'overall') return isAnswered('overall', values) ? 1 : 0;
  if (step.type === 'comment') return (values?.comment || '').trim() ? 1 : 0;
  return 0;
};

/**
 * Test БорщКоіни for a set of answers: every rating screen is worth the same,
 * paid in proportion to how much of it was answered, and a comment is worth
 * one screen too (the prototype's rule). The multiplier (Першовар ×3, a seed
 * score confirmed ×2) is the caller's.
 */
export const coinsEarned = (steps, values, perStep = 10) =>
  (steps || []).reduce((sum, s) => sum + Math.round(perStep * stepShare(s, values)), 0);

// --- the payload --------------------------------------------------------------------

const TASTE_10 = [null, 2, 4, 6, 8, 10];
const MEAT_AMOUNT_10 = [null, 4, 7, 10];
const BEET_AMOUNT_10 = [null, 3, 6, 10];

const mean = (...xs) => {
  const vals = xs.filter((x) => x !== null && x !== undefined);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
};

/**
 * The seven old 1..10 fields, as the server fills them for scheme 3 («Як це
 * стає рейтингом»). The server ignores them for scheme 3; they ride along so
 * an API that does not know the scheme yet still stores sensible numbers.
 * An unanswered part is null, and «Нема» leaves the meat empty instead of
 * sinking a borshch without meat.
 */
export const legacyRatings = (a) => {
  const meatAmount = a.meat_amount;
  return {
    rating_meat: meatAmount === 0
      ? null
      : mean(MEAT_AMOUNT_10[meatAmount] ?? null, TASTE_10[a.meat_taste] ?? null),
    rating_beet: mean(BEET_AMOUNT_10[a.beet_amount] ?? null, TASTE_10[a.beet_flavor] ?? null),
    rating_density: a.density ?? null,
    // the old field is 1..10 with 5 = норм: 1..8 as is, «сіль!» (9) is its 10
    rating_salt: a.salt === null || a.salt === undefined ? null : (a.salt === SALT_MAX ? 10 : a.salt),
    rating_serving: TASTE_10[a.serving_taste] ?? null,
    rating_aftertaste: TASTE_10[a.aftertaste] ?? null,
  };
};

/**
 * Answers → the body of POST /reviews/ (and a tasting guest's rating), scheme 3.
 * A skipped part is null; sides: null skipped, [] «Нічого».
 */
export const answersToReview = (answers, comment = '') => {
  const a = restoreAnswers(answers);
  return {
    scheme: RATING_SCHEME,
    meat_amount: a.meat_amount,
    meat_taste: a.meat_amount === 0 ? null : a.meat_taste,
    beet_amount: a.beet_amount,
    beet_flavor: a.beet_flavor,
    density: a.density,
    salt: a.salt,
    sides: a.sides,
    serving_taste: a.serving_taste,
    aftertaste: a.aftertaste,
    overall_rating: a.overall,
    message: (comment || '').trim(),
    ...legacyRatings(a),
  };
};

// --- «Твій Борщ у двох словах» ------------------------------------------------------

/**
 * Sides as one phrase: «Зі сметаною й пампушками», «With sour cream and salo».
 * Ukrainian picks з / зі / із for the first word and і / й before the last,
 * by the sounds around them, as the prototype does.
 */
export const sidesPhrase = (codes, t, lang = 'uk') => {
  const list = SIDE_CODES.filter((c) => (codes || []).includes(c));
  if (!list.length) return '';
  const words = list.map((c) => t(`r3.sideWith.${c}`));
  if (lang !== 'uk') {
    const head = words.length > 1 ? `${words.slice(0, -1).join(', ')} ${t('r3.and')} ${words[words.length - 1]}` : words[0];
    return `${t('r3.withPrefix')} ${head}`;
  }
  let out = `${t(`r3.sidePre.${list[0]}`)} ${words[0]}`;
  for (let k = 1; k < words.length; k += 1) {
    if (k < words.length - 1) {
      out += `, ${words[k]}`;
    } else {
      const prev = words[k - 1];
      const next = words[k];
      const afterVowel = /[аеєиіїоуюяь]$/i.test(prev) && !/^[йвєїюяі]/i.test(next);
      out += `${afterVowel ? ' й ' : ' і '}${next}`;
    }
  }
  return out;
};

const beetPhrase = (a, t) => {
  const am = a.beet_amount;
  const fl = a.beet_flavor;
  if (am && fl) return `${t(`r3.sum.beetAmount.${am}`)}, ${t(`r3.sum.beetFlavorTail.${fl}`)}`;
  if (am) return t(`r3.sum.beetAmount.${am}`);
  if (fl) return t(`r3.sum.beetFlavor.${fl}`);
  return '';
};

/** The tags of the closing screen, in the order of the screens. */
export const summaryPhrases = (answers, t, lang = 'uk') => {
  const a = restoreAnswers(answers);
  const out = [];
  if (a.meat_amount !== null) out.push(t(`r3.sum.meat.${a.meat_amount}`));
  const beet = beetPhrase(a, t);
  if (beet) out.push(beet);
  if (a.density) out.push(t(`r3.sum.density.${a.density}`));
  if (a.salt) out.push(t(`r3.sum.salt.${a.salt}`));
  if (Array.isArray(a.sides)) out.push(a.sides.length ? sidesPhrase(a.sides, t, lang) : t('r3.sum.noSides'));
  return out;
};
