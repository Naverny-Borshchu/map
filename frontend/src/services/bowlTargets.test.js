import { ensureBowlTargets, ensurePlace } from './bowlTargets';
import { createDraft, getDraft } from './bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from './bowlPhotoStore';

/**
 * A bowl's new venue (Google) and new borshch («Інший Борщ») are created right
 * before its rating, each id kept in the bowl at once.
 */

const GOOGLE = { googlePlaceId: 'g1', name: 'Криївка', address: 'пл. Ринок, 14', city: 'Львів', country: 'Україна', location: { lat: 49.8419, lng: 24.0322 } };

beforeEach(() => {
  localStorage.clear();
  setPhotoStoreForTests(createMemoryPhotoStore());
});

const apis = ({ reused = false, existing = [] } = {}) => ({
  places: { create: jest.fn(async () => ({ id: 'p-new', reused })) },
  borsches: {
    getByPlaceId: jest.fn(async () => existing),
    create: jest.fn(async (b) => ({ id_borsch: 'b-new', name: b.name, place_id: b.place_id })),
  },
});

test('ours as it is; a Google venue is created with its Place ID, reused or not', async () => {
  const api = { create: jest.fn(async () => ({ id: 'p9', reused: true })) };
  expect(await ensurePlace({ id: 'p1' }, { api })).toEqual({ id: 'p1', created: false, reused: false });
  expect(api.create).not.toHaveBeenCalled();
  expect(await ensurePlace({ id: null, google: GOOGLE }, { api, via: 'table' })).toEqual({ id: 'p9', created: false, reused: true });
  expect(api.create).toHaveBeenCalledWith({
    name: 'Криївка', address: 'пл. Ринок, 14', city: 'Львів', country: 'Україна',
    location: GOOGLE.location, google_place_id: 'g1', via: 'table',
  });
  await expect(ensurePlace({ id: null }, { api })).rejects.toThrow();
});

test('a new venue and a new borshch: both created, both ids kept in the bowl', async () => {
  const bowl = await createDraft({ place: { id: null, name: 'Криївка', city: 'Львів', google: GOOGLE }, borsch: { id: null, name: 'Борщ з квасолею' } });
  const api = apis();
  const res = await ensureBowlTargets(bowl, api);
  expect(res).toMatchObject({ placeId: 'p-new', borschId: 'b-new' });
  expect(api.borsches.create).toHaveBeenCalledWith({ name: 'Борщ з квасолею', place_id: 'p-new', type_meat: 'other' });
  // `created`: the closing screen may ask its meat type, also after a retry
  expect(getDraft(bowl.id)).toMatchObject({ place: { id: 'p-new' }, borsch: { id: 'b-new', name: 'Борщ з квасолею', created: true } });

  // a retry after a failed rating creates nothing again
  const again = apis();
  expect(await ensureBowlTargets(getDraft(bowl.id), again)).toEqual({ placeId: 'p-new', borschId: 'b-new', borsch: null });
  expect(again.places.create).not.toHaveBeenCalled();
  expect(again.borsches.create).not.toHaveBeenCalled();
});

test('a venue the backend already had may already serve this borshch: that one is rated, no twin', async () => {
  const bowl = await createDraft({ place: { id: null, name: 'Криївка', google: GOOGLE }, borsch: { id: null, name: 'борщ  ЧЕРВОНИЙ' } });
  const api = apis({ reused: true, existing: [{ id_borsch: 'b-old', name: 'Борщ червоний' }] });
  expect(await ensureBowlTargets(bowl, api)).toMatchObject({ placeId: 'p-new', borschId: 'b-old', borsch: null });
  expect(api.borsches.create).not.toHaveBeenCalled();
  // somebody else's borshch: its meat is not this person's to set
  expect(getDraft(bowl.id).borsch.created).toBeUndefined();
});

test('our venue with a new borshch creates only the borshch', async () => {
  const bowl = await createDraft({ place: { id: 'p1', name: 'Ватра' }, borsch: { id: null, name: 'Борщ дня' } });
  const api = apis();
  await ensureBowlTargets(bowl, api);
  expect(api.places.create).not.toHaveBeenCalled();
  expect(api.borsches.create).toHaveBeenCalledWith({ name: 'Борщ дня', place_id: 'p1', type_meat: 'other' });
});
