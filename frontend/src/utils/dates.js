/**
 * Dates and meta lines that never break in the wrong place.
 *
 * «14 листопада» used to wrap as «14» at the end of one line and «листопада»
 * on the next (Мої дегустації, 14.11.2026), and a «·» could start a line.
 * The day and the month are joined by a no-break space, and the separator
 * sticks to what comes before it: a meta line may wrap only after a «·».
 */
export const NBSP = ' ';
export const META_SEP = `${NBSP}· `;

/** «21 листопада» / «21 November», the day and the month on one line. */
export const dayMonth = (date, lang = 'uk') =>
  date.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'long' }).replace(/ /g, NBSP);

/**
 * «Хуторець на Дніпрі · 21 листопада · 3 Борщі», empty parts dropped. A number
 * stays with the word after it («3 Борщі», «12 оцінок»).
 */
export const joinMeta = (parts) =>
  parts.filter(Boolean).map((part) => String(part).replace(/(\d) /g, `$1${NBSP}`)).join(META_SEP);
