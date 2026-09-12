/**
 * One definition of "what is an id", shared by the API mappers and by the
 * write flows that depend on them.
 *
 * The bug this exists to close: `String(undefined)` is the literal string
 * "undefined". It is non-empty and truthy, so it survives every `if (!id)`
 * and every `id || fallback` between the mapper and the network, and arrives
 * at the backend as a UUID. That is exactly how `place: "undefined"` (2026-09-11)
 * and then `borsch: "undefined"` (2026-09-12) both reached production and
 * failed the last step of the add-a-borsch flow with a 400 — after the venue
 * and the borsch had already been created, so the person lost their rating.
 *
 * Guards at individual call sites only ever fixed one caller at a time; the
 * mapper kept manufacturing the poison. So the mapper normalises, and callers
 * that genuinely need an id ask for one out loud.
 */

/**
 * An id as the API gave it, or '' when it gave nothing usable.
 * Callers that only compare ids then simply never match, instead of matching
 * some other record that is also missing its id.
 */
export const normalizeId = (raw) => {
  if (raw === null || raw === undefined) return '';
  const id = String(raw).trim();
  return id === 'undefined' || id === 'null' ? '' : id;
};

/**
 * The id, or a thrown error naming what was missing.
 *
 * Used where continuing without an id would corrupt the next request. Failing
 * here is also *recoverable*: nothing poisoned is written into the caller's
 * progress record, so a retry after the API is fixed picks up where it stopped
 * rather than replaying a bad id forever.
 */
export const requireId = (raw, what) => {
  const id = normalizeId(raw);
  if (!id) throw new Error(`Missing ${what} id in API response.`);
  return id;
};
