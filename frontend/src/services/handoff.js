import { getDraft, importDraft, updateDraft, deleteDraft, draftIsNew } from './bowlDrafts';
import { DRAFT_VERSION, readSessionDraft } from '../components/QuestFlow/sessionDraft';
import { ratingSteps, restoreAnswers } from '../components/QuestFlow/answers';
import { HANDOFF_PARAM } from '../utils/handoffParam';

export { HANDOFF_PARAM };

/**
 * Carrying a half-finished rating from the browser inside Threads/Instagram
 * to a real one.
 *
 * Google does not sign anybody in from an in-app browser (utils/inAppBrowser),
 * and the answers live in that browser's sessionStorage, which Safari or
 * Chrome cannot see. So the «open in browser» link carries them in one query
 * parameter, and the other browser writes them back before the app renders.
 *
 * Photos are files and do not travel; a bowl arrives without its photo.
 *
 * Anybody can write such a link, so what comes in is never trusted:
 *  - one draft only, the rating of the page the link opens (its key comes
 *    from the address, never from the link), so nothing is planted for any
 *    other borshch;
 *  - rebuilt from the known fields, so nothing malformed reaches storage;
 *  - a bowl only for a venue and a borshch the map already has, with their
 *    names read from the map, not from the link (bowlDrafts.importDraft);
 *  - and it never goes out unseen: the comment screen shows every answer
 *    with «Змінити відповіді» before the send (EvaluationsPage, QuestFlow).
 */
const VERSION = 2;
// The whole address, not just the parameter: nginx refuses a request line
// over 8k, and in-app browsers and messengers choke on long links sooner.
export const MAX_URL = 6000;
// what the comment screen lets anybody type (QuestFlow's textarea)
const COMMENT_MAX = 1000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

// UTF-8 by way of percent-encoding: comments are Ukrainian, btoa is Latin-1
const toBase64Url = (text) =>
  btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (value) => {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return decodeURIComponent(Array.from(bin, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
};

const session = () => {
  try {
    return window.sessionStorage;
  } catch (e) {
    return null;
  }
};

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * The rating a page holds: { key, kind, id } for /borsch/<id>/evaluations
 * and /bowl/<id>/rate, otherwise null. The only draft a link to this page
 * may carry or write.
 */
export const pageDraft = (pathname) => {
  let m = /^\/borsch\/([^/]+)\/evaluations\/?$/.exec(pathname || '');
  let kind = 'rate';
  if (!m) {
    m = /^\/bowl\/([^/]+)\/rate\/?$/.exec(pathname || '');
    kind = 'bowl';
  }
  if (!m) return null;
  let id;
  try {
    id = decodeURIComponent(m[1]);
  } catch (e) {
    return null;
  }
  if (!ID.test(id)) return null;
  return { key: `nb:quest-draft:${kind}:${id}`, kind, id };
};

/**
 * In the receiving browser the photos never come along, so the rating there
 * always opens with its photo screen: photo, the rating screens, the comment.
 * EvaluationsPage clamps again for the screens it really has.
 */
const commentStep = () => 1 + ratingSteps().length;

/**
 * A carried draft rebuilt from the fields a rating has, or null when there is
 * nothing in it worth writing. Whatever else the link holds stays behind.
 */
export const sanitizeDraft = (raw) => {
  if (!isPlainObject(raw)) return null;
  const answers = restoreAnswers(isPlainObject(raw.answers) ? raw.answers : null);
  const comment = typeof raw.comment === 'string' ? Array.from(raw.comment).slice(0, COMMENT_MAX).join('') : '';
  const answered = Object.values(answers).some((v) => v !== null && v !== undefined);
  if (!answered && !comment.trim()) return null;
  const step = Number.isInteger(raw.step) ? Math.min(Math.max(raw.step, 0), commentStep()) : 0;
  return { version: DRAFT_VERSION, step, values: { answers, comment }, handoff: true };
};

// only what was answered: the link stays short
const packDraft = (saved) => {
  const answers = Object.fromEntries(
    Object.entries(restoreAnswers(saved?.values?.answers)).filter(([, v]) => v !== null && v !== undefined)
  );
  const comment = typeof saved?.values?.comment === 'string' ? saved.values.comment : '';
  if (!Object.keys(answers).length && !comment.trim()) return null;
  return { step: Number.isInteger(saved.step) ? saved.step : 0, answers, comment };
};

/**
 * What this page would lose by moving to another browser, or null. A bowl of
 * a venue or a borshch the map does not have yet does not travel (the other
 * browser would refuse it), so a bowl page with one has nothing to carry.
 */
export const collectHandoff = (pathname = window.location.pathname) => {
  const target = pageDraft(pathname);
  if (!target) return null;
  const draft = packDraft(readSessionDraft(target.key));
  if (!draft) return null;
  if (target.kind === 'rate') return { v: VERSION, draft };
  const bowl = getDraft(target.id);
  if (!bowl || draftIsNew(bowl)) return null;
  return {
    v: VERSION,
    draft,
    bowl: {
      id: bowl.id,
      createdAt: bowl.createdAt,
      place: { id: bowl.place.id },
      borsch: { id: bowl.borsch.id },
      photoMode: bowl.photoMode,
    },
  };
};

/** Does this page have answers that a link would carry? Drives the in-app panel. */
export const canHandoff = (pathname = window.location.pathname) => {
  try {
    return Boolean(collectHandoff(pathname));
  } catch (e) {
    return false;
  }
};

/**
 * This page's address with its answers in it. Without anything to carry, the
 * plain address: the person still gets to a browser that can sign in.
 *
 * The whole address stays within `maxLength`. A rating never fills that by
 * itself, so what does is somebody else's: the other query parameters go
 * first (an ad click id, say), and only then is the comment cut, from the
 * end. The answers always travel.
 */
export const handoffUrl = (href = window.location.href, { maxLength = MAX_URL } = {}) => {
  const url = new URL(href);
  url.searchParams.delete(HANDOFF_PARAM);
  let payload = null;
  try {
    payload = collectHandoff(url.pathname);
  } catch (e) {
    payload = null;
  }
  if (!payload) return url.toString();

  const build = (base, comment) => {
    const next = new URL(base.toString());
    next.searchParams.set(HANDOFF_PARAM, toBase64Url(JSON.stringify({ ...payload, draft: { ...payload.draft, comment } })));
    return next.toString();
  };
  const fits = (s) => s.length <= maxLength;

  const full = build(url, payload.draft.comment);
  if (fits(full)) return full;

  const bare = new URL(url.toString());
  bare.search = '';
  const plain = build(bare, payload.draft.comment);
  if (fits(plain)) return plain;

  // the longest start of the comment that fits (by characters, not halves of one)
  const chars = Array.from(payload.draft.comment);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(build(bare, chars.slice(0, mid).join('')))) lo = mid;
    else hi = mid - 1;
  }
  return build(bare, chars.slice(0, lo).join(''));
};

/**
 * Names of a carried bowl's venue and borshch, from the map by the borshch's
 * id. A borshch the map does not have (404) takes the bowl with it: a link
 * may hand over a bowl only for what is already on the map.
 */
const resolveBowl = async (bowlId, borschId, lookupBorsch) => {
  try {
    const b = await lookupBorsch(borschId);
    if (!b || String(b.id_borsch) !== borschId) return;
    updateDraft(bowlId, {
      place: { id: b.place_id ? String(b.place_id) : getDraft(bowlId)?.place?.id || null, name: b.place_name || '', city: b.place_city || '' },
      borsch: { id: borschId, name: b.name || '' },
    });
  } catch (e) {
    if (e?.status === 404) await deleteDraft(bowlId);
  }
};

/**
 * Run once from src/index.js, before React reads anything: writes the carried
 * rating back and takes the parameter out of the address, so it is neither
 * shared nor recorded. A draft this browser already has wins: it is newer
 * than a link. A value that cannot be read writes nothing.
 *
 * lookupBorsch(id) reads a borshch from the map (borschAPI.getById), for the
 * names of a carried bowl.
 *
 * Returns what was restored, for the analytics event, or null.
 */
export const applyHandoff = ({ lookupBorsch = null, now = Date.now() } = {}) => {
  let url;
  try {
    url = new URL(window.location.href);
  } catch (e) {
    return null;
  }
  const raw = url.searchParams.get(HANDOFF_PARAM);
  if (raw === null) return null;
  url.searchParams.delete(HANDOFF_PARAM);
  try {
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (e) { /* the address keeps the parameter; harmless */ }

  // longer than any link this app makes
  if (raw.length > MAX_URL) return null;
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(raw));
  } catch (e) {
    return null;
  }
  if (!isPlainObject(payload) || payload.v !== VERSION) return null;

  const target = pageDraft(url.pathname);
  const draft = target ? sanitizeDraft(payload.draft) : null;
  const store = session();
  if (!draft || !store) return { drafts: 0, bowl: false };
  if (readSessionDraft(target.key)) return { drafts: 0, bowl: false };

  let bowl = false;
  if (target.kind === 'bowl') {
    const had = getDraft(target.id, now);
    if (!had) {
      const carried = isPlainObject(payload.bowl) && payload.bowl.id === target.id
        ? importDraft(payload.bowl, now)
        : null;
      // answers for a bowl this browser does not have would land nowhere
      if (!carried) return { drafts: 0, bowl: false };
      bowl = true;
      if (lookupBorsch) resolveBowl(carried.id, carried.borsch.id, lookupBorsch);
    }
  }

  try {
    store.setItem(target.key, JSON.stringify(draft));
  } catch (e) {
    return { drafts: 0, bowl };
  }
  return { drafts: 1, bowl };
};
