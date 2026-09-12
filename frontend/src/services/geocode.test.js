import { reverseGeocodeCity, cityFromGeocoderResults } from './geocode';

const component = (long_name, ...types) => ({ long_name, types });

afterEach(() => {
  delete window.google;
  jest.restoreAllMocks();
});

describe('cityFromGeocoderResults', () => {
  it('бере locality', () => {
    const results = [{ address_components: [component('Київ', 'locality')] }];
    expect(cityFromGeocoderResults(results)).toBe('Київ');
  });

  it('місто виграє в області, навіть коли область стоїть у відповіді першою', () => {
    const results = [
      { address_components: [component('Київська область', 'administrative_area_level_1')] },
      { address_components: [component('Бровари', 'locality')] },
    ];
    expect(cityFromGeocoderResults(results)).toBe('Бровари');
  });

  it('падає до області, коли міста немає', () => {
    const results = [{ address_components: [component('Закарпаття', 'administrative_area_level_1')] }];
    expect(cityFromGeocoderResults(results)).toBe('Закарпаття');
  });

  it('порожня або крива відповідь — null, не виняток', () => {
    expect(cityFromGeocoderResults(null)).toBeNull();
    expect(cityFromGeocoderResults([])).toBeNull();
    expect(cityFromGeocoderResults([{}])).toBeNull();
  });
});

describe('reverseGeocodeCity', () => {
  it('без завантаженої бібліотеки Maps JS повертає null і нічого не кидає', async () => {
    await expect(reverseGeocodeCity(50.45, 30.52)).resolves.toBeNull();
  });

  it('питає геокодер бібліотеки, а не REST-ендпоінт', async () => {
    const geocode = jest.fn().mockResolvedValue({
      results: [{ address_components: [component('Львів', 'locality')] }],
    });
    window.google = { maps: { Geocoder: function () { this.geocode = geocode; } } };
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('REST-геокодер більше не має викликатися');
    });

    await expect(reverseGeocodeCity(49.84, 24.03)).resolves.toBe('Львів');
    expect(geocode).toHaveBeenCalledWith({ location: { lat: 49.84, lng: 24.03 }, language: 'uk' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('помилка геокодера не валить виклик', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    window.google = {
      maps: { Geocoder: function () { this.geocode = () => Promise.reject(new Error('ZERO_RESULTS')); } },
    };
    await expect(reverseGeocodeCity(0, 0)).resolves.toBeNull();
  });
});
