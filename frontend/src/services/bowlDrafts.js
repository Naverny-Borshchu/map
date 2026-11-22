import { photoStore } from './bowlPhotoStore';

/**
 * «Миска»: one bowl of borshch between the moment it is brought and the moment
 * it is eaten (Оцінка Борщу 2.0, stage 1).
 *
 * People photograph a borshch when it arrives and can only rate it once it is
 * gone. The app used to want both at once, so the photo showed an empty bowl or
 * the rating described a borshch nobody had tasted yet. A bowl splits that in
 * two: moment 1 keeps the venue, the borshch and the photo; moment 2, after the
 * meal, is the rating, with the photo already in place.
 *
 * A bowl is a draft on this device and needs no account. Its metadata lives in
 * localStorage (small, read by every screen that shows the reminder); its
 * photos live in IndexedDB (see bowlPhotoStore). Several bowls can wait at
 * once, a bowl survives a reload, and one that has waited three days is gone:
 * by then nobody remembers how salty it was.
 */

const KEY = 'nb:bowls';
const VERSION = 1;

export const BOWL_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** The reminder waits this long: a bowl of borshch takes about that to eat. */
export const REMIND_AFTER_MS = 20 * 60 * 1000;
/** «Ще їм» puts the reminder off by this much. */
export const SNOOZE_MS = 15 * 60 * 1000;
/** Fired on this window after every change; the storage event covers other tabs. */
export const BOWLS_EVENT = 'nb:bowls';

const read = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.bowls)) return [];
    return parsed.bowls.filter((b) => b && b.id && Number.isFinite(b.createdAt));
  } catch (e) {
    return [];
  }
};

const write = (bowls) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, bowls }));
  } catch (e) {
    // a full or blocked storage loses the bowl, not the screen
    console.warn('Не вдалося зберегти миску:', e);
  }
  try {
    window.dispatchEvent(new Event(BOWLS_EVENT));
  } catch (e) { /* no window */ }
};

const alive = (bowl, now) => now - bowl.createdAt < BOWL_TTL_MS;

const newId = (now) => `bowl_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Every bowl still waiting, newest first. */
export const listDrafts = (now = Date.now()) =>
  read()
    .filter((b) => alive(b, now))
    .sort((a, b) => b.createdAt - a.createdAt);

export const getDraft = (id, now = Date.now()) =>
  listDrafts(now).find((b) => b.id === id) || null;

/**
 * Moment 1 is over: keep the bowl.
 *
 * place  { id, name, city }      a venue from our own catalogue, or
 *        { id: null, name, city, google: {...} }  a venue picked from Google
 *        Places that the map does not have yet (services/googlePlaces)
 * borsch { id, name }            the borshch at that venue, or
 *        { id: null, name }      «Інший Борщ»: a new one, by its name
 * photoMode 'now' | 'camera_roll' | 'later'
 * photoTakenAt  when the photo says it was taken (EXIF), 'YYYY-MM-DDTHH:MM'
 *
 * A new venue or borshch is created only when the bowl is rated (moment 2,
 * services/bowlTargets): moment 1 needs no account, and a bowl that is
 * dropped leaves no empty borshch on the map.
 */
export const createDraft = async ({ place, borsch, photoMode = 'later', photos = [], photoTakenAt = null }, now = Date.now()) => {
  const id = newId(now);
  let photoCount = 0;
  if (photos.length) {
    try {
      await photoStore().put(id, photos);
      photoCount = photos.length;
    } catch (e) {
      console.warn('Не вдалося зберегти фото миски:', e);
    }
  }
  const draft = {
    id,
    createdAt: now,
    place: place
      ? {
        id: place.id ? String(place.id) : null,
        name: place.name || '',
        city: place.city || '',
        ...(!place.id && place.google ? { google: place.google } : {}),
      }
      : null,
    borsch: borsch ? { id: borsch.id ? String(borsch.id) : null, name: borsch.name || '' } : null,
    photoMode,
    photoCount,
    ...(photoTakenAt ? { photoTakenAt } : {}),
    snoozedUntil: 0,
    reviewedAt: null,
  };
  write([...read(), draft]);
  return draft;
};

/**
 * A bowl carried over from another browser on the same phone (services/
 * handoff): the browser inside Threads cannot sign in, so its bowl travels
 * to Safari in the link. The photos stay behind in the other browser's
 * IndexedDB, so the bowl arrives without them and the rating asks for one.
 * A bowl already here is left alone. A bowl of a new venue or borshch stays
 * behind too (see below); its answers still travel with the link.
 */
export const importDraft = (bowl, now = Date.now()) => {
  if (!bowl || typeof bowl.id !== 'string' || !/^bowl_[a-z0-9_]+$/.test(bowl.id)) return null;
  if (!Number.isFinite(bowl.createdAt) || !alive(bowl, now)) return null;
  // It came in a link, and anybody can write a link. Only a bowl of a venue
  // and a borshch the map already has is taken, and only the fields that
  // name them: a bowl that would create a venue or a borshch on the server
  // in this person's name is not something a link may hand them.
  const id = (v) => (typeof v === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(v) ? v : null);
  const text = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
  const placeId = id(bowl.place?.id);
  const borschId = id(bowl.borsch?.id);
  if (!placeId || !borschId) return null;
  const bowls = read();
  const existing = bowls.find((b) => b.id === bowl.id);
  if (existing) return existing;
  const draft = {
    id: bowl.id,
    createdAt: bowl.createdAt,
    place: { id: placeId, name: text(bowl.place.name), city: text(bowl.place.city) },
    borsch: { id: borschId, name: text(bowl.borsch.name) },
    photoMode: ['now', 'camera_roll', 'later'].includes(bowl.photoMode) ? bowl.photoMode : 'later',
    photoCount: 0,
    ...(typeof bowl.photoTakenAt === 'string' ? { photoTakenAt: bowl.photoTakenAt.slice(0, 16) } : {}),
    snoozedUntil: 0,
    reviewedAt: null,
  };
  write([...bowls, draft]);
  return draft;
};

/** Does rating this bowl first put a new venue or borshch on the map? */
export const draftIsNew = (bowl) => Boolean(bowl && (!bowl.borsch?.id || !bowl.place?.id));

export const updateDraft = (id, patch) => {
  const bowls = read();
  const i = bowls.findIndex((b) => b.id === id);
  if (i < 0) return null;
  const next = { ...bowls[i], ...patch, id };
  bowls[i] = next;
  write(bowls);
  return next;
};

export const deleteDraft = async (id) => {
  write(read().filter((b) => b.id !== id));
  try {
    await photoStore().remove(id);
  } catch (e) { /* the orphan is swept on the next load */ }
};

export const snoozeDraft = (id, now = Date.now()) =>
  updateDraft(id, { snoozedUntil: now + SNOOZE_MS });

export const loadDraftPhotos = async (id) => {
  try {
    return await photoStore().get(id);
  } catch (e) {
    return [];
  }
};

/** Replace the bowl's photos (adding one later goes through here too). */
export const saveDraftPhotos = async (id, photos) => {
  await photoStore().put(id, photos);
  return updateDraft(id, { photoCount: photos.length });
};

/**
 * Called once per app load: drop bowls older than three days and any photos
 * whose bowl is gone (a tab closed mid-delete leaves those behind).
 */
export const cleanupDrafts = async (now = Date.now()) => {
  const bowls = read();
  const keep = bowls.filter((b) => alive(b, now));
  if (keep.length !== bowls.length) write(keep);
  const ids = new Set(keep.map((b) => b.id));
  const removed = bowls.length - keep.length;
  try {
    const keys = await photoStore().keys();
    await Promise.all(keys.filter((k) => !ids.has(k)).map((k) => photoStore().remove(k)));
  } catch (e) { /* nothing to sweep, or nowhere to sweep it from */ }
  return removed;
};

/** Is it time to ask about this bowl? */
export const isDue = (bowl, now = Date.now()) =>
  !!bowl
  && !bowl.reviewedAt
  && alive(bowl, now)
  && now - bowl.createdAt >= REMIND_AFTER_MS
  && (bowl.snoozedUntil || 0) <= now;

/**
 * The bowl the reminder asks about: the newest one that is due. The newest,
 * because a bowl from yesterday should not stand in front of today's.
 */
export const dueDraft = (bowls, now = Date.now()) =>
  [...bowls].sort((a, b) => b.createdAt - a.createdAt).find((b) => isDue(b, now)) || null;

/** When the next bowl becomes due, so the reminder can wake up exactly then. */
export const nextDueAt = (bowls, now = Date.now()) => {
  const times = bowls
    .filter((b) => !b.reviewedAt && alive(b, now))
    .map((b) => Math.max(b.createdAt + REMIND_AFTER_MS, b.snoozedUntil || 0))
    .filter((t) => t > now);
  return times.length ? Math.min(...times) : null;
};
