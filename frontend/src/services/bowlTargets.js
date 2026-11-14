import { borschAPI, placesAPI } from '../api';
import { requireId } from '../utils/ids';
import { normalizeVenueName } from './googlePlaces';
import { updateDraft } from './bowlDrafts';

/**
 * Our venue id for a venue a flow picked: as it is when the venue is ours,
 * created from its Google Places data otherwise. The backend answers a known
 * Place ID (or the same name within 50 m) with the venue it already has
 * (200, reused: true); that is a success like any other and its id is used.
 *
 * place  { id } | { id: null, google: { googlePlaceId, name, address, city, country, location } }
 * via    where it came from, for place_from_google ('bowl', 'table', 'add')
 */
export const ensurePlace = async (place, { api = placesAPI, via = null } = {}) => {
  if (place?.id) return { id: String(place.id), created: false, reused: false };
  const g = place?.google;
  if (!g?.googlePlaceId) throw new Error('ensurePlace: no venue to create');
  const created = await api.create({
    name: g.name,
    address: g.address || '',
    city: g.city || '',
    country: g.country || 'Україна',
    location: g.location,
    google_place_id: g.googlePlaceId,
    via,
  });
  return { id: requireId(created?.id, 'created place'), created: !created?.reused, reused: Boolean(created?.reused) };
};

/** Same borshch name, the way a menu writes it: case, quotes and spaces aside. */
export const sameBorschName = (a, b) => normalizeVenueName(a) === normalizeVenueName(b);

/**
 * A bowl whose venue or borshch is new (picked from Google Places, or typed
 * in as «Інший Борщ») gets both created right before its rating is sent, when
 * the person is signed in. Each id goes back into the bowl as soon as it
 * exists, so a failed rating retried later does not create them again.
 *
 * A venue the backend already had may already serve a borshch by this name:
 * that one is rated instead of a twin.
 *
 * Returns { placeId, borschId, borsch } where `borsch` is the created
 * borshch (mapped), or null when nothing had to be created.
 */
export const ensureBowlTargets = async (bowl, { places = placesAPI, borsches = borschAPI } = {}) => {
  let placeId = bowl?.place?.id || null;
  let borschId = bowl?.borsch?.id || null;
  let created = null;

  if (!placeId) {
    ({ id: placeId } = await ensurePlace(bowl.place, { api: places, via: 'bowl' }));
    updateDraft(bowl.id, { place: { ...bowl.place, id: placeId } });
  }

  if (!borschId) {
    const name = String(bowl?.borsch?.name || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('ensureBowlTargets: the new borshch has no name');
    const here = await borsches.getByPlaceId(placeId).catch(() => []);
    const twin = (here || []).find((b) => sameBorschName(b.name, name));
    if (twin) {
      borschId = String(twin.id_borsch);
    } else {
      // no price, no weight: «невідомо» until the facts question after the meal
      created = await borsches.create({ name, place_id: placeId, type_meat: 'other' });
      borschId = requireId(created?.id_borsch ?? created?.id, 'created borsch');
    }
    // `created`: this device put the borshch on the map, so the closing screen
    // may ask its meat type (the API lets its creator set it once, while it is
    // «other»). Kept in the draft for a retry after a failed rating.
    updateDraft(bowl.id, { borsch: { ...bowl.borsch, id: borschId, ...(created ? { created: true } : {}) } });
  }

  return { placeId, borschId, borsch: created };
};
