/**
 * The query parameter that carries a rating from the browser inside
 * Threads/Instagram to a real one (services/handoff). Kept apart from that
 * module so analytics can scrub it without importing the drafts code.
 */
export const HANDOFF_PARAM = 'nb_handoff';

const PARAM_RE = new RegExp(`([?&])${HANDOFF_PARAM}=[^&#]*(&?)`, 'g');

/**
 * The same address without the parameter. While the in-app panel is on
 * screen the parameter sits in the address (so the app's own ⋯ «Open in
 * browser» carries it), and it holds the person's answers and comment: it is
 * not for analytics, bug reports or anybody's logs.
 */
export const withoutHandoff = (value) => {
  if (typeof value !== 'string' || !value.includes(`${HANDOFF_PARAM}=`)) return value;
  return value
    .replace(PARAM_RE, (_, lead, tail) => (tail ? lead : ''))
    .replace(/\?(#|$)/, '$1');
};
