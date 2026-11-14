/**
 * What the host's device remembers about a table it created: the borshch the
 * table put on the map for the first time (typed in by name), so that after
 * closing the table the host is asked, once, for a photo of each.
 *
 *   nb:table-host:<CODE>  { newNames: [...], prompted: false, createdAt }
 *
 * The table's API says which borshch is on it, not which of them it created;
 * the device that created it knows.
 */
const PREFIX = 'nb:table-host:';
const keyFor = (code) => `${PREFIX}${String(code || '').toUpperCase()}`;

export const readHostTable = (code) => {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(code)) || 'null');
    if (!value || typeof value !== 'object') return null;
    return {
      newNames: Array.isArray(value.newNames) ? value.newNames.filter((n) => typeof n === 'string' && n) : [],
      prompted: Boolean(value.prompted),
      done: Array.isArray(value.done) ? value.done : [],
      createdAt: value.createdAt || null,
    };
  } catch (e) {
    return null;
  }
};

export const saveHostTable = (code, patch) => {
  const next = { newNames: [], prompted: false, done: [], ...(readHostTable(code) || {}), ...patch };
  try {
    localStorage.setItem(keyFor(code), JSON.stringify(next));
  } catch (e) { /* a full storage costs the prompt, not the table */ }
  return next;
};
