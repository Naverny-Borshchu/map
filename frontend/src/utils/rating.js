/**
 * Borsch scores live on a 1–10 scale, so anything outside 1..10 — 0, a
 * negative, NaN, or the "—" placeholder — is NOT a real score. It means "no
 * valid rating yet" and must never be shown as a number.
 *
 * This matters because the backend leaves overall_rating at 0 for some
 * reviewed borsches (old reviews carried overall_rating: 0), and the API
 * mapping then averages that to "0.0" — a truthy string that slips past its
 * own "—" fallback. Treating <1 as unrated here fixes it at every display
 * site at once.
 */
export const hasRating = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 10;
};

/**
 * A whole score reads better without the dangling zero — "8" not "8.0" — while
 * halves keep their decimal ("7.5"). Unrated values return '' so callers can
 * render their own "no ratings yet" state.
 */
export const formatGrade = (value) => {
  if (!hasRating(value)) return '';
  return String(Number(Number(value).toFixed(1)));
};

/** Average only the borsches that actually carry a valid rating. */
export const averageRating = (values) => {
  const real = values.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 10);
  if (!real.length) return null;
  return (real.reduce((a, b) => a + b, 0) / real.length).toFixed(1);
};
