import {
  fetchVenueDetails, fetchVenueSuggestions, findOwnPlace, normalizeVenueName, pendingPlace, placesReady, venuePlacePayload,
} from './googlePlaces';

/**
 * «Закладу нема в списку»: Google Places through the Maps JS the app loads.
 * google.maps.places is a stand-in here; nothing reaches Google.
 */

const venue = { googlePlaceId: 'g1', name: 'Криївка', address: 'пл. Ринок, 14, Львів', city: 'Львів', country: 'Україна', location: { lat: 49.8419, lng: 24.0322 } };

afterEach(() => {
  delete window.google;
  localStorage.clear();
});

describe('our catalogue first', () => {
  const places = [
    { id: 'p1', name: 'Ватра', latitude: 49.8417, longitude: 24.0315, google_place_id: 'g-vatra' },
    { id: 'p2', name: '«Криївка»', latitude: 49.84195, longitude: 24.0323 }, // ~10 m, same name in quotes
    { id: 'p3', name: 'Криївка', latitude: 50.45, longitude: 30.52 }, // Kyiv: same name, far away
  ];

  it('the same Place ID is our venue', () => {
    expect(findOwnPlace(places, { ...venue, googlePlaceId: 'g-vatra', name: 'Інша назва' }).id).toBe('p1');
  });

  it('the same name within 50 m is our venue; the same name in another city is not', () => {
    expect(findOwnPlace(places, venue).id).toBe('p2');
    expect(findOwnPlace(places.filter((p) => p.id !== 'p2'), venue)).toBeNull();
  });

  it('names compare without case, quotes and punctuation', () => {
    expect(normalizeVenueName('«Пузата  Хата»!')).toBe(normalizeVenueName('пузата хата'));
    expect(normalizeVenueName("Кав'ярня")).toBe(normalizeVenueName('Кавʼярня'));
  });

  it('a new venue goes to the API with its Place ID; until then it waits as a pending place', () => {
    expect(venuePlacePayload(venue)).toEqual({
      name: 'Криївка', address: 'пл. Ринок, 14, Львів', city: 'Львів', country: 'Україна',
      location_lat: 49.8419, location_lng: 24.0322, google_place_id: 'g1',
    });
    expect(pendingPlace(venue)).toMatchObject({ id: null, name: 'Криївка', latitude: 49.8419, longitude: 24.0322, google: venue });
  });
});

describe('the search', () => {
  it('uses the new AutocompleteSuggestion, biased to where the phone is, venues only', async () => {
    const fetchAutocompleteSuggestions = jest.fn(async () => ({
      suggestions: [
        { placePrediction: { placeId: 'g1', mainText: { text: 'Криївка' }, secondaryText: { text: 'Львів' }, types: ['restaurant', 'establishment'] } },
        { placePrediction: { placeId: 'g2', mainText: { text: 'Криворізька вулиця' }, secondaryText: { text: 'Київ' }, types: ['route', 'geocode'] } },
      ],
    }));
    window.google = { maps: { places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions } } } };
    expect(placesReady()).toBe(true);
    const list = await fetchVenueSuggestions('Крив', { near: { lat: 49.84, lng: 24.03 }, sessionToken: 'tok', language: 'en' });
    expect(list.map((s) => s.main)).toEqual(['Криївка']);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: 'Крив', language: 'en', sessionToken: 'tok', locationBias: { center: { lat: 49.84, lng: 24.03 }, radius: 30000 },
    });
  });

  it('falls back to the classic AutocompleteService', async () => {
    const getPlacePredictions = jest.fn((req, cb) => cb([
      { place_id: 'g1', description: 'Криївка, Львів', structured_formatting: { main_text: 'Криївка', secondary_text: 'Львів' } },
    ], 'OK'));
    window.google = { maps: { places: { AutocompleteService: function Service() { this.getPlacePredictions = getPlacePredictions; } } } };
    const list = await fetchVenueSuggestions('Крив');
    expect(list).toEqual([{ placeId: 'g1', main: 'Криївка', secondary: 'Львів', toPlace: null }]);
    expect(getPlacePredictions.mock.calls[0][0]).toMatchObject({ input: 'Крив', types: ['establishment'] });
  });

  it('one letter asks nothing; no library is an error the screen can show', async () => {
    expect(await fetchVenueSuggestions('К')).toEqual([]);
    await expect(fetchVenueSuggestions('Крив')).rejects.toThrow('places_unavailable');
  });
});

describe('the pick', () => {
  const jsPlace = () => ({
    id: 'g1',
    displayName: 'Криївка',
    formattedAddress: 'пл. Ринок, 14, Львів',
    addressComponents: [{ longText: 'Львів', types: ['locality'] }, { longText: 'Україна', types: ['country'] }],
    location: { lat: () => 49.8419, lng: () => 24.0322 },
    fetchFields: jest.fn(async () => {}),
  });

  it('a Ukrainian UI keeps the search session: the prediction becomes the Place', async () => {
    const place = jsPlace();
    const v = await fetchVenueDetails({ placeId: 'g1', toPlace: () => place }, { language: 'uk' });
    expect(place.fetchFields).toHaveBeenCalledWith({ fields: ['id', 'displayName', 'formattedAddress', 'addressComponents', 'location'] });
    expect(v).toEqual(venue);
  });

  it('an English UI still files the venue in Ukrainian', async () => {
    const made = [];
    window.google = { maps: { places: { Place: function Place(opts) { made.push(opts); return jsPlace(); } } } };
    const v = await fetchVenueDetails({ placeId: 'g1', toPlace: () => { throw new Error('not this'); } }, { language: 'en' });
    expect(made).toEqual([{ id: 'g1', requestedLanguage: 'uk' }]);
    expect(v.city).toBe('Львів');
  });

  it('without the Place class, the REST lookup the add flow uses, in Ukrainian', async () => {
    const lookup = jest.fn(async () => ({ id: 'g1', name: 'Криївка', address: 'пл. Ринок, 14, Львів', city: 'Львів', country: 'Україна', location: { lat: 49.8419, lng: 24.0322 } }));
    expect(await fetchVenueDetails({ placeId: 'g1' }, { lookup, language: 'en' })).toEqual(venue);
    expect(lookup).toHaveBeenCalledWith('g1', 'uk');
  });
});
