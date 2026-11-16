import {
  abroadInCyrillic, fetchCityDetails, fetchCitySuggestions, fetchGoogleNearby, fetchVenueDetails, fetchVenueSuggestions,
  findOwnPlace, normalizeVenueName, pendingPlace, placesReady, venuePlacePayload, wantsEnglish,
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

// --- abroad (11.2026): a co-founder in Tokyo, «пише локації не знайдено і Київ» ---

describe('abroad: never a Russian form, English instead', () => {
  const prediction = (placeId, main, secondary) => ({
    placePrediction: { placeId, mainText: { text: main }, secondaryText: { text: secondary }, types: ['restaurant', 'establishment'] },
  });

  it('a suggestion that is not Ukrainian is swapped for its English twin; a Ukrainian one stays', async () => {
    const fetchAutocompleteSuggestions = jest.fn(async ({ language }) => ({
      suggestions: language === 'en'
        ? [prediction('g-jp', 'Shin-Yokohama Ramen Museum', 'Shinyokohama, Kohoku Ward, Yokohama, Japan'), prediction('g-ua', 'Puzata Khata', 'Kyiv, Ukraine')]
        : [prediction('g-jp', 'Musée du Rāmen de Shin-Yokohama', 'Синъёкохама, Иокогама, Префектура Канаґава, Японія'), prediction('g-ua', 'Пузата Хата', 'Вокзальна площа, Київ, Україна')], // lang-check: allow
    }));
    window.google = { maps: { places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions } } } };
    const list = await fetchVenueSuggestions('ramen', { language: 'uk' });
    expect(list.map((s) => [s.main, s.secondary])).toEqual([
      ['Shin-Yokohama Ramen Museum', 'Shinyokohama, Kohoku Ward, Yokohama, Japan'],
      ['Пузата Хата', 'Вокзальна площа, Київ, Україна'],
    ]);
    expect(fetchAutocompleteSuggestions.mock.calls.map(([r]) => r.language)).toEqual(['uk', 'en']);
  });

  it('only Ukrainian suggestions: one request, in the language of the UI', async () => {
    const fetchAutocompleteSuggestions = jest.fn(async () => ({
      suggestions: [prediction('g1', 'Криївка', 'площа Ринок, Львів, Львівська область, Україна')],
    }));
    window.google = { maps: { places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions } } } };
    expect((await fetchVenueSuggestions('Крив', { language: 'uk' })).map((s) => s.main)).toEqual(['Криївка']);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
  });

  it('near a point outside Ukraine it asks in English at once', async () => {
    const fetchAutocompleteSuggestions = jest.fn(async () => ({
      suggestions: [prediction('g-jp', 'ICHIRAN Shibuya', 'Jinnan, Shibuya, Tokyo, Japan')],
    }));
    window.google = { maps: { places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions } } } };
    await fetchVenueSuggestions('Ichiran', { near: { lat: 35.6617, lng: 139.7041 }, language: 'uk' });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(fetchAutocompleteSuggestions.mock.calls[0][0].language).toBe('en');
  });

  it('a Russian letter in a Ukrainian-looking line is a reason too', () => {
    expect(wantsEnglish({ main: 'Пузата Хата', secondary: 'Київ, Україна' })).toBe(false);
    expect(wantsEnglish({ main: 'Синъёкохама', secondary: 'Україна' })).toBe(true); // lang-check: allow
    expect(wantsEnglish({ main: 'ICHIRAN', secondary: 'Tokyo, Japan' })).toBe(true);
    expect(abroadInCyrillic({ main: 'ICHIRAN', secondary: 'Tokyo, Japan' })).toBe(false);
    expect(abroadInCyrillic({ main: 'Краков', secondary: 'Польща' })).toBe(true); // lang-check: allow
  });

  const jsJapan = (lang) => ({
    id: 'g-jp',
    displayName: 'ICHIRAN Shibuya',
    formattedAddress: `${lang === 'en' ? 'Japan' : 'Японія'}, 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme−22−７`,
    addressComponents: [
      { longText: 'Shibuya', shortText: 'Shibuya', types: ['locality', 'political'] },
      { longText: 'Tokyo', shortText: 'Tokyo', types: ['administrative_area_level_1', 'political'] },
      { longText: lang === 'en' ? 'Japan' : 'Японія', shortText: 'JP', types: ['country', 'political'] },
    ],
    location: { lat: () => 35.6617, lng: () => 139.7041 },
    fetchFields: jest.fn(async () => {}),
  });

  it('a venue abroad is filed in English, Tokyo as its city, not the ward', async () => {
    const made = [];
    window.google = { maps: { places: { Place: function Place(opts) { made.push(opts); return jsJapan(opts.requestedLanguage); } } } };
    const v = await fetchVenueDetails({ placeId: 'g-jp' }, { language: 'en' });
    expect(made.map((o) => o.requestedLanguage)).toEqual(['uk', 'en']);
    expect(v).toEqual({
      googlePlaceId: 'g-jp',
      name: 'ICHIRAN Shibuya',
      address: 'Japan, 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme−22−７',
      city: 'Tokyo',
      country: 'Japan',
      location: { lat: 35.6617, lng: 139.7041 },
    });
    expect(venuePlacePayload(v)).toMatchObject({ city: 'Tokyo', country: 'Japan', google_place_id: 'g-jp' });
  });

  it('a Ukrainian venue is asked once, in Ukrainian', async () => {
    const made = [];
    const ua = () => ({
      id: 'g1', displayName: 'Криївка', formattedAddress: 'пл. Ринок, 14, Львів',
      addressComponents: [{ longText: 'Львів', types: ['locality'] }, { longText: 'Україна', shortText: 'UA', types: ['country'] }],
      location: { lat: () => 49.8419, lng: () => 24.0322 }, fetchFields: jest.fn(async () => {}),
    });
    window.google = { maps: { places: { Place: function Place(opts) { made.push(opts); return ua(); } } } };
    expect((await fetchVenueDetails({ placeId: 'g1' }, { language: 'en' })).city).toBe('Львів');
    expect(made).toEqual([{ id: 'g1', requestedLanguage: 'uk' }]);
  });

  it('cities: Google types for a city, Tokyo included, and the city in English abroad', async () => {
    const fetchAutocompleteSuggestions = jest.fn(async () => ({
      suggestions: [{ placePrediction: { placeId: 'c-tokyo', mainText: { text: 'Tokyo' }, secondaryText: { text: 'Japan' }, types: ['administrative_area_level_1'] } }],
    }));
    window.google = { maps: { places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions } } } };
    const list = await fetchCitySuggestions('Tokyo', { language: 'en' });
    expect(list.map((s) => s.main)).toEqual(['Tokyo']);
    expect(fetchAutocompleteSuggestions.mock.calls[0][0].includedPrimaryTypes)
      .toEqual(['locality', 'administrative_area_level_1', 'colloquial_area', 'postal_town']);

    const made = [];
    const city = (lang) => ({
      id: 'c-tokyo', displayName: lang === 'en' ? 'Tokyo' : 'Токіо',
      addressComponents: [{ longText: lang === 'en' ? 'Japan' : 'Японія', shortText: 'JP', types: ['country'] }],
      location: { lat: () => 35.6764, lng: () => 139.65 }, fetchFields: jest.fn(async () => {}),
    });
    window.google = { maps: { places: { Place: function Place(opts) { made.push(opts.requestedLanguage); return city(opts.requestedLanguage); } } } };
    expect(await fetchCityDetails({ placeId: 'c-tokyo' })).toEqual({ name: 'Tokyo', location: { lat: 35.6764, lng: 139.65 }, countryCode: 'JP' });
    expect(made).toEqual(['uk', 'en']);
  });

  it('a Ukrainian city keeps its Ukrainian name', async () => {
    const city = { id: 'c-br', displayName: 'Бровари', addressComponents: [{ longText: 'Україна', shortText: 'UA', types: ['country'] }], location: { lat: () => 50.51, lng: () => 30.79 }, fetchFields: jest.fn(async () => {}) };
    window.google = { maps: { places: { Place: function Place() { return city; } } } };
    expect(await fetchCityDetails({ placeId: 'c-br' })).toEqual({ name: 'Бровари', location: { lat: 50.51, lng: 30.79 }, countryCode: 'UA' });
  });

  it('Google nearby: in English outside Ukraine, as venues, nearest first', async () => {
    const searchNearby = jest.fn(async () => ({ places: [jsJapan('en')] }));
    window.google = { maps: { places: { Place: { searchNearby } } } };
    const venues = await fetchGoogleNearby({ lat: 35.6617, lng: 139.7041 });
    expect(venues).toEqual([expect.objectContaining({ googlePlaceId: 'g-jp', city: 'Tokyo', country: 'Japan' })]);
    expect(searchNearby).toHaveBeenCalledWith(expect.objectContaining({
      language: 'en',
      locationRestriction: { center: { lat: 35.6617, lng: 139.7041 }, radius: 500 },
      includedPrimaryTypes: ['restaurant', 'cafe', 'bar', 'meal_takeaway', 'food_court'],
    }));
  });

  it('Google nearby inside Ukraine: Ukrainian; nothing at all without Google', async () => {
    const searchNearby = jest.fn(async () => ({ places: [] }));
    window.google = { maps: { places: { Place: { searchNearby } } } };
    await fetchGoogleNearby({ lat: 50.45, lng: 30.52 });
    expect(searchNearby.mock.calls[0][0].language).toBe('uk');
    delete window.google;
    expect(await fetchGoogleNearby({ lat: 35.66, lng: 139.7 })).toEqual([]);
    expect(await fetchGoogleNearby(null)).toEqual([]);
  });
});
