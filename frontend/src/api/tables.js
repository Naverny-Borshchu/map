import { apiRequest } from './index';
import { gradesToReview } from '../components/QuestFlow/answers';
import { track } from '../analytics';

/**
 * «Стіл» (Оцінка Борщу 2.0, stage 2): one host, one venue, one to ten borshch,
 * a QR code, and every guest rates only the taste.
 *
 *   GET  /tables/                 my tables (host), signed in
 *   POST /tables/                 create, signed in
 *   GET  /tables/{code}/          public; the host sees names and raters
 *   POST /tables/{code}/reviews/  rate one borshch by its number, as yourself or as a named guest
 *   POST /tables/{code}/close/    host only
 *   GET  /tables/{code}/results/  host any time, everyone once closed
 *
 * A guest has no account. The first rating carries their name and returns a
 * token; every later request of theirs carries that token in a header, so the
 * same person can rate the next borshch, or change a rating, without typing the
 * name again. The token is kept per table on the device (services/tableGuest).
 */

export const GUEST_TOKEN_HEADER = 'X-Table-Guest-Token';

/** The code alphabet: no 0/O, 1/I/L, because codes are read aloud and copied off a screen. */
export const TABLE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE = new RegExp(`^[${TABLE_CODE_ALPHABET}]{6,8}$`);

/** The guest's name on the backend: up to 40 characters, no links. */
export const GUEST_NAME_MAX = 40;
export const TITLE_MAX = 120;
export const MAX_TABLE_BORSCHES = 10;

/**
 * A code as typed or as it came in a link: trimmed, upper case, and only if it
 * can be a code at all. Anything else is null, and is shown as an unknown table
 * without asking the API.
 */
export const normalizeTableCode = (raw) => {
  const code = String(raw ?? '').trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
};

/**
 * The link a QR code and a share sheet carry. On our own sites it points at the
 * site the host is looking at, so a table made on one build opens on the same
 * build; anywhere else the API's own share_url.
 */
export const tableLink = (code, shareUrl = '') => {
  const loc = typeof window !== 'undefined' ? window.location : null;
  if (loc && /(^|\.)navernyborshchu\.com$/.test(loc.hostname)) return `${loc.origin}/t/${code}`;
  return shareUrl || (loc ? `${loc.origin}/t/${code}` : `/t/${code}`);
};

const guestHeaders = (guestToken) => (guestToken ? { [GUEST_TOKEN_HEADER]: guestToken } : null);

/**
 * Who a request speaks for. A guest token wins over a sign-in: a person who
 * began a table as a guest stays that guest at this table, or a later sign-in
 * would let them rate every borshch a second time.
 */
const readOptions = (guestToken) => (guestToken
  ? { headers: guestHeaders(guestToken) }
  : { authOptional: true });

export const tablesAPI = {
  /** The tables I host, newest first. */
  listMine: async () => {
    const data = await apiRequest('/tables/', { authRequired: true, query: { page_size: 50 } });
    return Array.isArray(data) ? data : (data?.results || []);
  },

  /**
   * place     venue id
   * borsches  [{ id } | { name }] each with optional price_uah / weight_grams
   * blind     names hidden from guests until the table is closed
   * title     optional
   */
  create: async ({ place, borsches, blind = false, title = '' }, context = {}) => {
    const body = { place, borsches, blind: Boolean(blind), title: String(title || '').trim() };
    const table = await apiRequest('/tables/', { method: 'POST', body, authRequired: true });
    track('table_created', {
      code: table?.code,
      place_id: place,
      borsch_count: borsches.length,
      new_borsches: borsches.filter((b) => !b.id).length,
      with_price: borsches.filter((b) => b.price_uah).length,
      with_weight: borsches.filter((b) => b.weight_grams).length,
      blind: body.blind,
      has_title: Boolean(body.title),
      ...context,
    });
    return table;
  },

  get: (code, { guestToken = null } = {}) =>
    apiRequest(`/tables/${encodeURIComponent(code)}/`, readOptions(guestToken)),

  results: (code, { guestToken = null } = {}) =>
    apiRequest(`/tables/${encodeURIComponent(code)}/results/`, readOptions(guestToken)),

  /**
   * One borshch, by its number on the table.
   *
   * as         'user' (signed in) or 'guest'
   * guestName  a guest's first rating only
   * guestToken a guest's later ratings
   */
  rate: async (code, { position, grades, comment = '', as = 'guest', guestName = '', guestToken = null }) => {
    const body = { position, ...gradesToReview(grades, comment) };
    const asUser = as === 'user';
    // The name rides along with the token too: a token the table does not
    // know (cleared on the server, or never used) then simply starts that
    // guest again under the same name instead of asking for it.
    if (!asUser && String(guestName || '').trim()) body.guest_name = String(guestName).trim();
    const result = await apiRequest(`/tables/${encodeURIComponent(code)}/reviews/`, asUser
      ? { method: 'POST', body, authRequired: true }
      : { method: 'POST', body, headers: guestHeaders(guestToken) });
    track('table_review', {
      code,
      position,
      as: asUser ? 'user' : 'guest',
      created: Boolean(result?.created),
      overall_rating: body.overall_rating,
      rated: (result?.rated_positions || []).length,
    });
    return result;
  },

  close: async (code, context = {}) => {
    const table = await apiRequest(`/tables/${encodeURIComponent(code)}/close/`, { method: 'POST', authRequired: true });
    track('table_closed', {
      code,
      raters_total: table?.progress?.raters_total ?? null,
      raters_complete: table?.progress?.raters_complete ?? null,
      borsch_count: (table?.borsches || []).length,
      blind: Boolean(table?.blind),
      ...context,
    });
    return table;
  },
};

export default tablesAPI;
