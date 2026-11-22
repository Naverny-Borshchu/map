import { getDraft, importDraft } from './bowlDrafts';

/**
 * Carrying a half-finished rating from the browser inside Threads/Instagram
 * to a real one.
 *
 * Google does not sign anybody in from an in-app browser (utils/inAppBrowser),
 * and the answers live in that browser's sessionStorage, which Safari or
 * Chrome cannot see. So the «open in browser» link carries them: every quest
 * draft of this tab, and the bowl being rated, go into one query parameter,
 * and the other browser writes them back before the app renders — the person
 * lands on the same step with the same answers and only has to sign in.
 *
 * Photos are files and do not travel; a bowl arrives without its photo.
 */
export const HANDOFF_PARAM = 'nb_handoff';
const VERSION = 1;
const DRAFT_PREFIX = 'nb:quest-draft:';
// A query string this long still opens everywhere; a comment longer than that
// is not worth a link that some app refuses to open.
const MAX_ENCODED = 8000;

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

const bowlIdFromPath = (pathname) => {
  const m = /^\/bowl\/([^/]+)\/rate\/?$/.exec(pathname || '');
  return m ? decodeURIComponent(m[1]) : null;
};

/** What this tab would lose by moving to another browser, or null. */
export const collectHandoff = (pathname = window.location.pathname) => {
  const drafts = {};
  const store = session();
  if (store) {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) drafts[key] = store.getItem(key);
    }
  }
  const bowlId = bowlIdFromPath(pathname);
  const bowl = bowlId ? getDraft(bowlId) : null;
  if (!Object.keys(drafts).length && !bowl) return null;
  return { v: VERSION, drafts, ...(bowl ? { bowl } : {}) };
};

/**
 * This page's address with the drafts in it. Without anything to carry, or
 * with too much, the plain address: the person still gets to a browser that
 * can sign in, which is worth more than the answers.
 */
export const handoffUrl = (href = window.location.href) => {
  const url = new URL(href);
  url.searchParams.delete(HANDOFF_PARAM);
  let payload = null;
  try {
    payload = collectHandoff(url.pathname);
  } catch (e) {
    payload = null;
  }
  if (payload) {
    const encoded = toBase64Url(JSON.stringify(payload));
    if (encoded.length <= MAX_ENCODED) url.searchParams.set(HANDOFF_PARAM, encoded);
  }
  return url.toString();
};

/**
 * Run once from src/index.js, before React reads anything: writes the carried
 * drafts back and takes the parameter out of the address, so it is neither
 * shared nor recorded as a page view. A draft this browser already has wins:
 * it is newer than a link.
 *
 * Returns what was restored, for the analytics event.
 */
export const applyHandoff = () => {
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

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(raw));
  } catch (e) {
    return null;
  }
  if (!payload || payload.v !== VERSION) return null;

  let drafts = 0;
  const store = session();
  if (store && payload.drafts && typeof payload.drafts === 'object') {
    Object.entries(payload.drafts).forEach(([key, value]) => {
      if (!key.startsWith(DRAFT_PREFIX) || typeof value !== 'string' || store.getItem(key) !== null) return;
      try {
        const draft = JSON.parse(value);
        if (!draft || typeof draft !== 'object') return;
        // a send that was under way in the other browser is not under way here
        delete draft.submissionState;
        store.setItem(key, JSON.stringify(draft));
        drafts += 1;
      } catch (e) { /* one broken draft does not stop the others */ }
    });
  }
  const bowl = payload.bowl ? importDraft(payload.bowl) : null;
  return { drafts, bowl: Boolean(bowl) };
};
