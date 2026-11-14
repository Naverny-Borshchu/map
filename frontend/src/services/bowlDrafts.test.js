import {
  BOWL_TTL_MS,
  REMIND_AFTER_MS,
  SNOOZE_MS,
  BOWLS_EVENT,
  cleanupDrafts,
  createDraft,
  deleteDraft,
  dueDraft,
  getDraft,
  isDue,
  listDrafts,
  loadDraftPhotos,
  nextDueAt,
  saveDraftPhotos,
  snoozeDraft,
  updateDraft,
} from './bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests, toFile, toRecord } from './bowlPhotoStore';

/**
 * A bowl waits on the device between «принесли» and «поїв». It must survive a
 * reload, several can wait at once, a three-day-old one is gone, and the
 * photos must not go to localStorage (one phone photo would fill it).
 */

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);
const MIN = 60 * 1000;
const VATRA = { id: 'p1', name: 'Ватра', city: 'Київ' };
const UKR = { id: 'b1', name: 'Борщ український' };

const photo = (name = 'bowl.jpg', bytes = [0xff, 0xd8, 0xff, 0xe1, 1, 2, 3]) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/jpeg', lastModified: T0 });

let store;
beforeEach(() => {
  localStorage.clear();
  store = createMemoryPhotoStore();
  setPhotoStoreForTests(store);
});

describe('saving a bowl', () => {
  it('keeps venue, borshch and photo mode in localStorage and the photos elsewhere', async () => {
    const draft = await createDraft({ place: VATRA, borsch: UKR, photoMode: 'now', photos: [photo()] }, T0);

    expect(draft).toMatchObject({
      createdAt: T0,
      place: { id: 'p1', name: 'Ватра', city: 'Київ' },
      borsch: { id: 'b1', name: 'Борщ український' },
      photoMode: 'now',
      photoCount: 1,
      reviewedAt: null,
    });
    const raw = localStorage.getItem('nb:bowls');
    expect(raw).toContain('Ватра');
    // no photo bytes and no data URL in localStorage
    expect(raw).not.toMatch(/data:|base64|bowl\.jpg/);
    expect(await store.keys()).toEqual([draft.id]);
    const files = await loadDraftPhotos(draft.id);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('bowl.jpg');
  });

  it('announces every change, so the banner and «Мої миски» update', async () => {
    const seen = jest.fn();
    window.addEventListener(BOWLS_EVENT, seen);
    const d = await createDraft({ place: VATRA, borsch: UKR }, T0);
    snoozeDraft(d.id, T0);
    await deleteDraft(d.id);
    window.removeEventListener(BOWLS_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(3);
  });

  it('survives a reload: a fresh copy of the module reads the same bowls', async () => {
    const d = await createDraft({ place: VATRA, borsch: UKR, photoMode: 'later' }, T0);
    let reloaded;
    jest.isolateModules(() => {
      reloaded = require('./bowlDrafts');
    });
    expect(reloaded.listDrafts(T0 + MIN).map((b) => b.id)).toEqual([d.id]);
    expect(reloaded.getDraft(d.id, T0 + MIN).place.name).toBe('Ватра');
  });

  it('keeps several bowls, newest first, and deletes one without the others', async () => {
    const a = await createDraft({ place: VATRA, borsch: UKR, photos: [photo('a.jpg')] }, T0);
    const b = await createDraft({ place: { id: 'p2', name: 'Пузата хата' }, borsch: { id: 'b2', name: 'Борщ' } }, T0 + 5 * MIN);

    expect(listDrafts(T0 + 6 * MIN).map((x) => x.id)).toEqual([b.id, a.id]);
    await deleteDraft(a.id);
    expect(listDrafts(T0 + 6 * MIN).map((x) => x.id)).toEqual([b.id]);
    expect(await store.keys()).toEqual([]);
  });

  it('adds a photo to a bowl later («Фото пізніше»)', async () => {
    const d = await createDraft({ place: VATRA, borsch: UKR, photoMode: 'later' }, T0);
    expect(d.photoCount).toBe(0);
    await saveDraftPhotos(d.id, [photo('late.jpg')]);
    expect(getDraft(d.id, T0).photoCount).toBe(1);
    expect((await loadDraftPhotos(d.id))[0].name).toBe('late.jpg');
  });

  it('still keeps the bowl when the photo store fails', async () => {
    setPhotoStoreForTests({ ...store, put: () => Promise.reject(new Error('quota')) });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const d = await createDraft({ place: VATRA, borsch: UKR, photos: [photo()] }, T0);
    expect(d.photoCount).toBe(0);
    expect(listDrafts(T0)).toHaveLength(1);
    console.warn.mockRestore();
  });

  it('ignores storage it cannot read', () => {
    localStorage.setItem('nb:bowls', '{not json');
    expect(listDrafts(T0)).toEqual([]);
    localStorage.setItem('nb:bowls', JSON.stringify({ version: 99, bowls: [{ id: 'x', createdAt: T0 }] }));
    expect(listDrafts(T0)).toEqual([]);
  });
});

describe('three days, then gone', () => {
  it('hides a bowl at three days and removes it with its photos on load', async () => {
    const old = await createDraft({ place: VATRA, borsch: UKR, photos: [photo()] }, T0);
    const fresh = await createDraft({ place: VATRA, borsch: UKR, photos: [photo()] }, T0 + BOWL_TTL_MS - MIN);
    const later = T0 + BOWL_TTL_MS;

    expect(listDrafts(later - 1).map((b) => b.id)).toEqual([fresh.id, old.id]);
    expect(listDrafts(later).map((b) => b.id)).toEqual([fresh.id]);

    const removed = await cleanupDrafts(later);
    expect(removed).toBe(1);
    expect(JSON.parse(localStorage.getItem('nb:bowls')).bowls.map((b) => b.id)).toEqual([fresh.id]);
    expect(await store.keys()).toEqual([fresh.id]);
  });

  it('sweeps photos whose bowl is gone', async () => {
    await store.put('bowl_orphan', [photo()]);
    const d = await createDraft({ place: VATRA, borsch: UKR, photos: [photo()] }, T0);
    await cleanupDrafts(T0 + MIN);
    expect(await store.keys()).toEqual([d.id]);
  });
});

describe('when to remind', () => {
  const at = (createdAt, extra = {}) => ({ id: `b${createdAt}`, createdAt, snoozedUntil: 0, reviewedAt: null, ...extra });

  it('waits 20 minutes after the bowl was brought', () => {
    const b = at(T0);
    expect(isDue(b, T0 + REMIND_AFTER_MS - 1)).toBe(false);
    expect(isDue(b, T0 + REMIND_AFTER_MS)).toBe(true);
    // and still asks when the app is opened hours later
    expect(isDue(b, T0 + 5 * 60 * MIN)).toBe(true);
  });

  it('«Ще їм» puts it off by 15 minutes', async () => {
    const d = await createDraft({ place: VATRA, borsch: UKR }, T0);
    const now = T0 + 30 * MIN;
    snoozeDraft(d.id, now);
    const snoozed = getDraft(d.id, now);
    expect(snoozed.snoozedUntil).toBe(now + SNOOZE_MS);
    expect(isDue(snoozed, now + SNOOZE_MS - 1)).toBe(false);
    expect(isDue(snoozed, now + SNOOZE_MS)).toBe(true);
  });

  it('never asks about a rated bowl or an expired one', () => {
    expect(isDue(at(T0, { reviewedAt: T0 + MIN }), T0 + 30 * MIN)).toBe(false);
    expect(isDue(at(T0), T0 + BOWL_TTL_MS)).toBe(false);
  });

  it('asks about the newest due bowl first', () => {
    const older = at(T0);
    const newer = at(T0 + 10 * MIN);
    const notYet = at(T0 + 50 * MIN);
    expect(dueDraft([older, newer, notYet], T0 + 55 * MIN)).toBe(newer);
    expect(dueDraft([notYet], T0 + 55 * MIN)).toBe(null);
  });

  it('knows when the next bowl becomes due', () => {
    const a = at(T0);
    const b = at(T0 + 10 * MIN, { snoozedUntil: T0 + 60 * MIN });
    expect(nextDueAt([a, b], T0)).toBe(T0 + REMIND_AFTER_MS);
    expect(nextDueAt([a, b], T0 + 25 * MIN)).toBe(T0 + 60 * MIN);
    expect(nextDueAt([at(T0, { reviewedAt: 1 })], T0)).toBe(null);
  });

  it('updateDraft marks a bowl as rated', async () => {
    const d = await createDraft({ place: VATRA, borsch: UKR }, T0);
    updateDraft(d.id, { reviewedAt: T0 + 40 * MIN });
    expect(getDraft(d.id, T0 + 41 * MIN).reviewedAt).toBe(T0 + 40 * MIN);
    expect(updateDraft('nope', {})).toBe(null);
  });
});

describe('photo bytes for IndexedDB', () => {
  it('turns a File into plain bytes and back without losing anything', async () => {
    const original = photo('exif.jpg', [0xff, 0xd8, 0xff, 0xe1, 0x45, 0x78, 0x69, 0x66]);
    const record = await toRecord(original);
    expect(record.buffer).toBeInstanceOf(ArrayBuffer);
    expect(record).toMatchObject({ name: 'exif.jpg', type: 'image/jpeg', lastModified: T0 });
    const back = toFile(record);
    expect(back.name).toBe('exif.jpg');
    expect(back.type).toBe('image/jpeg');
    expect(back.size).toBe(original.size);
  });
});
