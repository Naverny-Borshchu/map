/**
 * What this device remembers about each table it joined (services for
 * page/TablePage): the guest token the API handed out with the first rating,
 * the name typed at the door, and the answers of the borshch being rated right
 * now. A reload, a locked phone or a closed tab then continues at the same
 * borshch, at the same question, under the same name.
 *
 *   nb:table:<CODE>  { token, name, draft: { scheme, position, answers, step }, updatedAt }
 *
 * The token is what makes a guest the same guest. Losing it means the next
 * rating would come from a new guest with the same name, so it is written the
 * moment it arrives and kept for 60 days, long after any table has closed.
 */

const PREFIX = 'nb:table:';
export const TABLE_GUEST_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const keyFor = (code) => `${PREFIX}${String(code || '').toUpperCase()}`;

const parse = (raw) => {
  try {
    const value = JSON.parse(raw || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch (e) {
    return null;
  }
};

/** { token, name, draft } for this table, or an empty record. */
export const readTableGuest = (code, now = Date.now()) => {
  let value = null;
  try {
    value = parse(localStorage.getItem(keyFor(code)));
  } catch (e) {
    value = null;
  }
  if (!value || (value.updatedAt && now - value.updatedAt > TABLE_GUEST_TTL_MS)) {
    return { token: null, name: '', draft: null };
  }
  return {
    token: typeof value.token === 'string' && value.token ? value.token : null,
    name: typeof value.name === 'string' ? value.name : '',
    draft: value.draft && typeof value.draft === 'object' ? value.draft : null,
  };
};

/** Merge `patch` into the record of this table. `draft: null` drops the answers in progress. */
export const saveTableGuest = (code, patch, now = Date.now()) => {
  const current = readTableGuest(code, now);
  const next = { ...current, ...patch, updatedAt: now };
  try {
    localStorage.setItem(keyFor(code), JSON.stringify(next));
  } catch (e) {
    // a full or blocked storage costs the resume, not the rating
  }
  return next;
};

/** Forget the token (the API called it broken), keep the name. */
export const dropTableGuestToken = (code) => saveTableGuest(code, { token: null });

/** Records older than the TTL go once per app load. */
export const cleanupTableGuests = (now = Date.now()) => {
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const value = parse(localStorage.getItem(key));
      if (!value || !value.updatedAt || now - value.updatedAt > TABLE_GUEST_TTL_MS) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
    return stale.length;
  } catch (e) {
    return 0;
  }
};
