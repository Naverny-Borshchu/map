/**
 * Price and portion weight are facts about a borshch, not about one review, so
 * they are asked only where the card has none (on 14.11.2026: 183 of 282
 * borshch had no weight, 207 no price), and an answer only ever fills an empty
 * field. A value somebody already gave is never overwritten from here: a
 * second person who misremembers the portion must not erase the first.
 *
 * The borshch objects are the app's mapped ones (api/index.js mapBorsch):
 * `weight` is '' or "350 g.", `price` is '' or "≈185 ₴"; both are '' exactly
 * when the API holds 0.
 */

/** Quick taps for the portion, shared with the add flow. No bare 200 or 300:
 *  the brand kit rules them out as a sign. */
export const WEIGHT_CHIPS = [250, 280, 350, 400, 500];

// Outside these bounds an answer is a typo, not a portion or a price.
const WEIGHT_RANGE = [50, 2000];
const PRICE_RANGE = [1, 10000];

export const hasWeight = (borsch) => Boolean(borsch && borsch.weight);
export const hasPrice = (borsch) => Boolean(borsch && borsch.price);

/** Which of the two facts the card is missing. */
export const missingFacts = (borsch) => ({
  weight: !!borsch && !hasWeight(borsch),
  price: !!borsch && !hasPrice(borsch),
});

const number = (value, [min, max]) => {
  // the sign stays, so «-10» is out of range rather than read as 10
  const n = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * The PATCH body: only the answered fields that are STILL empty on `fresh`,
 * the borshch as the server has it right now. Everything else is left out, so
 * an existing value is never sent back, not even unchanged.
 */
export const factsPatch = (fresh, answers = {}) => {
  const patch = {};
  const weight = number(answers.weight, WEIGHT_RANGE);
  if (weight !== null && !hasWeight(fresh)) patch.weight = Math.round(weight);
  const price = number(answers.price, PRICE_RANGE);
  if (price !== null && !hasPrice(fresh)) patch.price = price;
  return patch;
};

/**
 * Read the borshch again, then write only what is still missing.
 *
 * The question was drawn from the list loaded when the app opened, and someone
 * else may have filled the field since; reading right before the write keeps
 * «never overwrite» true in that case too.
 *
 * api: { getById(id) → mapped borshch, update(id, patch) }
 */
export async function saveMissingFacts({ borschId, answers, api }) {
  const fresh = await api.getById(borschId);
  const patch = factsPatch(fresh, answers);
  if (!Object.keys(patch).length) return { saved: {} };
  await api.update(borschId, patch);
  return { saved: patch };
}

/**
 * Everything the closing screen of a rating may ask about the facts, at most
 * two questions in all:
 *
 *   missing   the existing «only if missing» question, for each fact the card
 *             does not have (weight, price)
 *   confirm   ONE «Ціна досі 330 грн?» about a value the card has but has not
 *             had confirmed for half a year (price_needs_confirmation from the
 *             API), price first, else weight; only while fewer than two
 *             missing questions are asked already
 *
 * A borshch from a backend without the confirmation flags asks no «досі?».
 */
export const factsToAsk = (borsch) => {
  const missing = missingFacts(borsch);
  if (!borsch) return { missing, confirm: null };
  const missingCount = (missing.weight ? 1 : 0) + (missing.price ? 1 : 0);
  let confirm = null;
  if (missingCount < 2) {
    if (!missing.price && borsch.price_needs_confirmation && Number(borsch.price_value) > 0) confirm = 'price';
    else if (!missing.weight && borsch.weight_needs_confirmation && Number(borsch.weight_value) > 0) confirm = 'weight';
  }
  return { missing, confirm };
};

/** A «Ні, інша» answer as the number confirm_facts takes, or null when it cannot be right. */
export const factAnswer = (kind, value) => {
  const n = number(value, kind === 'weight' ? WEIGHT_RANGE : PRICE_RANGE);
  if (n === null) return null;
  return kind === 'weight' ? Math.round(n) : Math.round(n * 100) / 100;
};
