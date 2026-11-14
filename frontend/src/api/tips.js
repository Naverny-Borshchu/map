import { apiRequest } from './index';
import { track } from '../analytics';

/**
 * «Я знаю, тут є Борщ» (Оцінка Борщу 2.0, stage 3): the shortest way to put a
 * borshch on the map. No rating, no price: a venue, and a note if you like.
 * On the map it is a grey bowl, «Кажуть, тут є Борщ», until somebody rates it.
 *
 *   GET  /tips/?bbox=s,w,n,e      public: open and confirmed tips in the view
 *   GET  /tips/?mine=true         signed in: my tips, in any state
 *   GET  /tips/{id}/              public, any state (my_vote, is_author with a token)
 *   POST /tips/                   signed in: { place } or { new_place }, note ≤140
 *   POST /tips/{id}/confirm/      signed in, not the author: «Так, є»
 *   POST /tips/{id}/gone/         signed in, the author too: «Вже нема»
 *
 * Statuses: open → confirmed (one other person said yes) → converted (the
 * first public rating at the venue, set by the backend); gone after two «вже
 * нема». A repeat «Тут є Борщ» at the same venue returns the tip that is there
 * (200, reused) and counts as a «так, є»; a venue whose borshch is already
 * rated answers 409 already_rated with the venue's id.
 */

export const TIP_NOTE_MAX = 140;
export const TIP_STATUSES = ['open', 'confirmed', 'gone', 'converted'];
/** Only these are on the map. */
export const LIVE_TIP_STATUSES = ['open', 'confirmed'];

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ua|io|me|ru|info|biz|link|ly)\b)/i;

/** Why a note cannot go, or null: '' is fine, the note is optional. */
export const tipNoteError = (note) => {
  const clean = String(note ?? '').trim();
  if (!clean) return null;
  if (clean.length > TIP_NOTE_MAX) return 'long';
  if (LINK_RE.test(clean)) return 'link';
  return null;
};

const listOf = (data) => (Array.isArray(data) ? data : (data?.results || []));

/** Coordinates of a tip's venue as numbers, or null. */
export const tipPoint = (tip) => {
  const raw = [tip?.place?.latitude, tip?.place?.longitude];
  if (raw.some((v) => v === null || v === undefined || v === '')) return null;
  const lat = Number(tip?.place?.latitude);
  const lng = Number(tip?.place?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
};

export const tipsAPI = {
  /**
   * Tips in the visible part of the map. `bbox` is exactly
   * google.maps.LatLngBounds#toUrlValue(): south,west,north,east. One page of
   * 100 is plenty: production starts with none, and a view that holds more
   * than a hundred grey bowls is zoomed out past the city markers anyway.
   */
  inView: async (bbox, { signal } = {}) => {
    const data = await apiRequest('/tips/', { query: { bbox, page_size: 100 }, signal });
    return listOf(data).filter((tip) => LIVE_TIP_STATUSES.includes(tip?.status) && tipPoint(tip));
  },

  mine: async () => {
    const data = await apiRequest('/tips/', { query: { mine: 'true', page_size: 100 }, authRequired: true });
    return listOf(data);
  },

  /** One tip; with a sign-in it says whether it is mine and how I voted. */
  get: (id) => apiRequest(`/tips/${encodeURIComponent(id)}/`, { authOptional: true }),

  /**
   * place     our venue id, or
   * newPlace  a venue from Google Places, as for POST /places/ (with google_place_id)
   * note      optional, ≤140, no links
   * context   extra analytics properties (from, ...)
   */
  create: async ({ place = null, newPlace = null, note = '' }, context = {}) => {
    const body = {
      ...(place ? { place: String(place) } : { new_place: newPlace }),
      note: String(note || '').trim(),
    };
    const tip = await apiRequest('/tips/', { method: 'POST', body, authRequired: true });
    track('tip_created', {
      tip_id: tip?.id,
      place_id: tip?.place?.id || place || null,
      reused: tip?.reused === true,
      new_place: !place,
      has_note: Boolean(body.note),
      status: tip?.status || null,
      ...context,
    });
    if (!place) {
      track('place_from_google', { reused: tip?.place_reused === true, place_id: tip?.place?.id || null, via: 'tip' });
    }
    return tip;
  },

  confirm: async (id, context = {}) => {
    const tip = await apiRequest(`/tips/${encodeURIComponent(id)}/confirm/`, { method: 'POST', authRequired: true });
    track('tip_vote', { vote: 'confirm', tip_id: id, status: tip?.status || null, ...context });
    return tip;
  },

  gone: async (id, context = {}) => {
    const tip = await apiRequest(`/tips/${encodeURIComponent(id)}/gone/`, { method: 'POST', authRequired: true });
    track('tip_vote', { vote: 'gone', tip_id: id, status: tip?.status || null, ...context });
    return tip;
  },
};

export default tipsAPI;
