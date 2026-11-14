import { NEAR_LIMIT_M, formatDistanceLocal, nearestPlaces, searchPlaces } from './nearestPlaces';

// Places as the API hands them to PlacesContext: numbers in latitude/longitude,
// strings in location_lat/location_lng.
const KHRESHCHATYK = { lat: 50.4501, lng: 30.5234 };
const place = (id, name, lat, lng, extra = {}) => ({ id, name, latitude: lat, longitude: lng, city: 'Київ', ...extra });

const PLACES = [
  place('far', 'Далекий', 50.4501, 30.5834),       // ~4.3 km east
  place('mid', 'Пузата хата', 50.4501, 30.5334),   // ~710 m
  place('near', 'Ватра', 50.4505, 30.5236),        // ~47 m
  place('next', 'Кафе 24', 50.4511, 30.5234),      // ~111 m
  place('also', 'Хата', 50.4521, 30.5234),         // ~222 m
  place('nocoords', 'Без координат', null, null),
  { id: 'str', name: 'Рядки', latitude: '50.4503', longitude: '30.5234', city: 'Київ' }, // ~22 m
];

describe('«Ти зараз тут?»: the nearest venues', () => {
  it('orders by distance and keeps three', () => {
    const got = nearestPlaces(PLACES, KHRESHCHATYK);
    expect(got.map((x) => x.place.id)).toEqual(['str', 'near', 'next']);
    expect(got[0].distance).toBeLessThan(got[1].distance);
    expect(got[1].distance).toBeLessThan(got[2].distance);
    expect(Math.round(got[1].distance)).toBeGreaterThan(40);
    expect(Math.round(got[1].distance)).toBeLessThan(55);
  });

  it('does not offer a venue across town as «here»', () => {
    const got = nearestPlaces(PLACES, KHRESHCHATYK, { limit: 10 });
    expect(got.map((x) => x.place.id)).not.toContain('far');
    expect(got.every((x) => x.distance <= NEAR_LIMIT_M)).toBe(true);
    expect(nearestPlaces([PLACES[0]], KHRESHCHATYK)).toEqual([]);
  });

  it('skips venues without coordinates and copes with no position', () => {
    expect(nearestPlaces(PLACES, KHRESHCHATYK, { limit: 10 }).map((x) => x.place.id)).not.toContain('nocoords');
    expect(nearestPlaces(PLACES, null)).toEqual([]);
    expect(nearestPlaces(null, KHRESHCHATYK)).toEqual([]);
  });

  it('reads the mapped shape (location.lat/lng) too', () => {
    const mapped = [{ id: 'm', name: 'Мапнутий', location: { lat: 50.4502, lng: 30.5234 } }];
    expect(nearestPlaces(mapped, KHRESHCHATYK)[0].place.id).toBe('m');
  });
});

describe('venue search', () => {
  it('puts name-start matches before matches inside a name', () => {
    const got = searchPlaces(PLACES, 'хата');
    expect(got.map((x) => x.place.id)).toEqual(['also', 'mid']);
  });

  it('meets a Latin spelling and a wrong keyboard layout', () => {
    expect(searchPlaces(PLACES, 'vatra')[0].place.id).toBe('near');
    // «Ватра» typed on a Latin layout
    expect(searchPlaces(PLACES, 'dfnhf')[0]?.place.id).toBe('near');
  });

  it('breaks ties by distance when the position is known', () => {
    const twins = [place('a', 'Борщ-бар', 50.47, 30.52), place('b', 'Борщ-бар', 50.4502, 30.5234)];
    expect(searchPlaces(twins, 'борщ', KHRESHCHATYK).map((x) => x.place.id)).toEqual(['b', 'a']);
  });

  it('finds nothing for an empty query', () => {
    expect(searchPlaces(PLACES, '   ')).toEqual([]);
  });
});

describe('distance labels', () => {
  const t = (key, vars) => ({ 'dist.m': `${vars.n} м`, 'dist.km': `${vars.n} км` }[key]);
  const en = (key, vars) => ({ 'dist.m': `${vars.n} m`, 'dist.km': `${vars.n} km` }[key]);

  it('rounds metres and writes kilometres the local way', () => {
    expect(formatDistanceLocal(47, t, 'uk')).toBe('50 м');
    expect(formatDistanceLocal(3, t, 'uk')).toBe('10 м');
    expect(formatDistanceLocal(1440, t, 'uk')).toBe('1,4 км');
    expect(formatDistanceLocal(1440, en, 'en')).toBe('1.4 km');
    expect(formatDistanceLocal(12400, en, 'en')).toBe('12 km');
    expect(formatDistanceLocal(null, t, 'uk')).toBe('');
  });
});
