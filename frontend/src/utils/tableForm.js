/**
 * The host's form for a new table (page/TableCreate), as plain functions: what
 * may go on the table, which numbers count as a price or a portion, and the
 * exact body POST /api/tables/ gets. The screen only shows what these return.
 *
 * An item on the table:
 *   { key, id, name }        a borshch the venue already has (id from the map)
 *   { key, id: null, name }  a new one the host typed in
 * Its price and weight live apart, in facts[key] = { price, weight }, as typed.
 */
import { MAX_TABLE_BORSCHES, TITLE_MAX } from '../api/tables';

// The same sanity bounds the rating's facts question uses (utils/borschFacts):
// outside them an answer is a typo, not a portion or a price.
export const PRICE_RANGE = [1, 10000];
export const WEIGHT_RANGE = [50, 2000];
export const NEW_NAME_MAX = 120;

const fold = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk');

/** '185', '185,50', ' 350 г' → a number; '' or rubbish → null. */
export const parseAmount = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw.replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && raw.replace(/[\s\D]/g, '') !== '' ? n : null;
};

/** null when the field is fine (empty is fine: «не знаю»), 'range' when it cannot be right. */
export const factError = (kind, value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = parseAmount(raw);
  const [min, max] = kind === 'weight' ? WEIGHT_RANGE : PRICE_RANGE;
  return n !== null && n >= min && n <= max ? null : 'range';
};

/** What the map already knows: "≈185 ₴" → 185, "350 g." → 350, '' → null. */
export const knownFacts = (borsch) => ({
  price: parseAmount(String(borsch?.price || '').replace(/^≈/, '')) || null,
  weight: parseAmount(borsch?.weight) || null,
});

/** Why a new borshch's name cannot go on the table yet, or null. */
export const newNameError = (name, items = []) => {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'empty';
  if (clean.length > NEW_NAME_MAX) return 'long';
  if (items.some((it) => fold(it.name) === fold(clean))) return 'duplicate';
  if (items.length >= MAX_TABLE_BORSCHES) return 'tooMany';
  return null;
};

/**
 * Everything that stops the host from creating the table.
 * { items: 'none' | 'tooMany' | null, facts: { [key]: { price, weight } }, title: 'long' | null }
 */
export const validateTable = ({ items = [], facts = {}, title = '' }) => {
  const errors = { items: null, facts: {}, title: null };
  if (!items.length) errors.items = 'none';
  else if (items.length > MAX_TABLE_BORSCHES) errors.items = 'tooMany';
  items.forEach((it) => {
    const f = facts[it.key] || {};
    const price = factError('price', f.price);
    const weight = factError('weight', f.weight);
    if (price || weight) errors.facts[it.key] = { price, weight };
  });
  if (String(title || '').trim().length > TITLE_MAX) errors.title = 'long';
  return errors;
};

export const isTableValid = (errors) =>
  !errors.items && !errors.title && Object.keys(errors.facts).length === 0;

/**
 * The POST /api/tables/ body. Only numbers the host typed are sent: an empty
 * field means «не знаю» and leaves the borshch card as it is, and the value
 * the card already shows is not sent back unasked (sending it would mark it
 * as confirmed today).
 */
export const buildTablePayload = ({ place, items = [], facts = {}, blind = false, title = '' }) => ({
  place,
  blind: Boolean(blind),
  title: String(title || '').trim().replace(/\s+/g, ' '),
  borsches: items.map((it) => {
    const f = facts[it.key] || {};
    const price = factError('price', f.price) ? null : parseAmount(f.price);
    const weight = factError('weight', f.weight) ? null : parseAmount(f.weight);
    return {
      ...(it.id ? { id: it.id } : { name: String(it.name).trim().replace(/\s+/g, ' ') }),
      ...(price !== null ? { price_uah: Math.round(price * 100) / 100 } : {}),
      ...(weight !== null ? { weight_grams: Math.round(weight) } : {}),
    };
  }),
});
