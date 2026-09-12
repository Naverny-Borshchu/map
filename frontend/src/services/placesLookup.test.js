import { resolveVenueAtTap, toPlace, placeLanguage } from './placesLookup';

const venue = (id, name) => ({ id, name, address: `${name} st`, location: { lat: 50, lng: 30 } });

test('a tapped venue icon is taken at its word', async () => {
  const byId = jest.fn().mockResolvedValue(venue('abc', 'Такахулі'));
  const nearby = jest.fn();
  const res = await resolveVenueAtTap({ placeId: 'abc', lat: 50, lng: 30 }, { byId, nearby });

  expect(res.venue.name).toBe('Такахулі');
  expect(res.candidates).toEqual([]);
  // the whole point: no proximity guessing when the tap already said which venue
  expect(nearby).not.toHaveBeenCalled();
  expect(byId).toHaveBeenCalledWith('abc');
});

test('a tap on bare pavement comes back with the whole neighbourhood, not one guess', async () => {
  const list = [venue('1', 'Гільда'), venue('2', 'Канапа'), venue('3', 'Остання Барикада')];
  const res = await resolveVenueAtTap({ lat: 50, lng: 30 }, { byId: jest.fn(), nearby: jest.fn().mockResolvedValue(list) });

  expect(res.venue.name).toBe('Гільда');       // nearest, shown first
  expect(res.candidates).toHaveLength(3);      // and the alternatives travel with it
});

test('an unknown place id falls back to what is nearby instead of failing', async () => {
  const nearby = jest.fn().mockResolvedValue([venue('9', 'Кафе')]);
  const res = await resolveVenueAtTap({ placeId: 'gone', lat: 50, lng: 30 }, { byId: jest.fn().mockResolvedValue(null), nearby });
  expect(res.venue.name).toBe('Кафе');
  expect(nearby).toHaveBeenCalled();
});

test('nothing around means nothing claimed', async () => {
  const res = await resolveVenueAtTap({ lat: 0, lng: 0 }, { byId: jest.fn(), nearby: jest.fn().mockResolvedValue([]) });
  expect(res.venue).toBeNull();
  expect(res.candidates).toEqual([]);
});

test('the API response is mapped onto the shape the sheet reads', () => {
  const mapped = toPlace({
    id: 'x', displayName: { text: 'Канапа' }, formattedAddress: 'Андріївський узвіз, 19',
    location: { latitude: 50.46, longitude: 30.51 }, primaryType: 'restaurant', types: ['restaurant'],
  });
  expect(mapped).toMatchObject({
    id: 'x', name: 'Канапа', address: 'Андріївський узвіз, 19',
    location: { lat: 50.46, lng: 30.51 }, type: 'restaurant',
  });
});

test('venues are asked for in the language the person is reading', () => {
  localStorage.setItem('lang', 'en');
  expect(placeLanguage()).toBe('en');
  localStorage.setItem('lang', 'uk');
  expect(placeLanguage()).toBe('uk');
});

/**
 * The add flow read the city off the tail of `formattedAddress`. That tail is
 * the country for every address outside Ukraine — "Україна" being the single
 * country name the parser knew to drop — so the first Berlin venue was stored
 * with city "Німеччина" and country "Україна". Google labels the parts; ask it.
 */
describe('city and country come from Google labels, not from string position', () => {
  const berlin = {
    id: 'p1',
    displayName: { text: 'Slava Berlin!' },
    formattedAddress: 'Wrangelstraße 43, 10997 Berlin, Німеччина',
    addressComponents: [
      { longText: 'Wrangelstraße', types: ['route'] },
      { longText: '43', types: ['street_number'] },
      { longText: 'Berlin', types: ['locality', 'political'] },
      { longText: '10997', types: ['postal_code'] },
      { longText: 'Німеччина', shortText: 'DE', types: ['country', 'political'] },
    ],
  };

  it('reads the German venue that used to be filed under its country', () => {
    const place = toPlace(berlin);
    expect(place.city).toBe('Berlin');
    expect(place.country).toBe('Німеччина');
  });

  it('still reads a Ukrainian venue correctly', () => {
    const place = toPlace({
      id: 'p2',
      displayName: { text: 'Ватра' },
      formattedAddress: 'вулиця Хрещатик, 1, Київ, Україна, 02000',
      addressComponents: [
        { longText: 'Київ', types: ['locality', 'political'] },
        { longText: 'Україна', shortText: 'UA', types: ['country', 'political'] },
        { longText: '02000', types: ['postal_code'] },
      ],
    });
    expect(place.city).toBe('Київ');
    expect(place.country).toBe('Україна');
  });

  it('falls back to postal_town where Google uses no locality', () => {
    const place = toPlace({
      id: 'p3',
      displayName: { text: 'Borsch & Co' },
      addressComponents: [
        { longText: 'London', types: ['postal_town'] },
        { longText: 'United Kingdom', types: ['country'] },
      ],
    });
    expect(place.city).toBe('London');
  });

  it('an unlabelled address yields empty strings, never a guess', () => {
    const place = toPlace({ id: 'p4', displayName: { text: 'X' }, formattedAddress: 'кудись там' });
    expect(place.city).toBe('');
    expect(place.country).toBe('');
  });

  it('does not mistake the postal code for the city', () => {
    const place = toPlace({
      id: 'p5',
      displayName: { text: 'Y' },
      addressComponents: [
        { longText: '10997', types: ['postal_code'] },
        { longText: 'Deutschland', types: ['country'] },
      ],
    });
    expect(place.city).toBe('');
    expect(place.country).toBe('Deutschland');
  });
});
