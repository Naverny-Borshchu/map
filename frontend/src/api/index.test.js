/**
 * Regression tests for the production 429 incident (2026-07-16).
 *
 * Root cause: the map loaded the whole dataset page-by-page at the default
 * page_size=20, firing ~17 requests per load and tripping the API rate limit.
 * Fix: fetchAllPages must request the largest allowed page (page_size=100) so a
 * full listing is collected in as few round-trips as possible.
 */
import { borschAPI, commentsAPI, favoritesAPI, placesAPI, toStoredCoord } from './index';

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

describe('fetchAllPages request fan-out (429 regression)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const urlsFor = async (loader, page) => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(page));
    await loader();
    return fetchMock.mock.calls.map(([url]) => String(url));
  };

  it('places.getAll requests page_size=100', async () => {
    const urls = await urlsFor(
      () => placesAPI.getAll('Київ'),
      { count: 1, next: null, results: [] },
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('page_size=100');
  });

  it('borsch.getAll requests page_size=100', async () => {
    const urls = await urlsFor(
      () => borschAPI.getAll(),
      { count: 1, next: null, results: [] },
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('page_size=100');
  });

  it('comments.getAll requests page_size=100', async () => {
    const urls = await urlsFor(
      () => commentsAPI.getAll(),
      { count: 1, next: null, results: [] },
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('page_size=100');
  });

  it('follows the server-provided next link without duplicating page_size', async () => {
    const pages = [
      {
        count: 2,
        next: 'https://api.navernyborshchu.com/api/places/?page=2&page_size=100',
        results: [{ id: '1' }],
      },
      { count: 2, next: null, results: [{ id: '2' }] },
    ];
    let call = 0;
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => jsonResponse(pages[call++]));

    const result = await placesAPI.getAll('Київ');
    expect(result).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
describe('coordinates the backend can actually store', () => {
  test('Google precision is trimmed to the six decimals the column holds', () => {
    // Place.location_lat is DecimalField(max_digits=9, decimal_places=6); the raw
    // 50.45900719999999 came back as HTTP 400 and killed a finished add-a-borsch run
    expect(toStoredCoord(50.45900719999999)).toBe(50.459007);
    expect(toStoredCoord(30.51361929999999)).toBe(30.513619);
    expect(String(toStoredCoord(50.45900719999999)).replace('-', '').replace('.', '').length)
      .toBeLessThanOrEqual(9);
  });

  test('already-short values are left alone, and rubbish becomes 0', () => {
    expect(toStoredCoord(50.4501)).toBe(50.4501);
    expect(toStoredCoord('30.5234')).toBe(30.5234);
    expect(toStoredCoord(undefined)).toBe(0);
    expect(toStoredCoord(NaN)).toBe(0);
    expect(toStoredCoord(null)).toBe(0);
  });

  test('negative coordinates keep their sign', () => {
    expect(toStoredCoord(-33.86881999999999)).toBe(-33.86882);
  });
});

describe('authenticated server-backed favorites', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('sends authenticated favorite mutations to the API', async () => {
    localStorage.setItem('access', 'favorite-access-token');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      id: 'favorite-1',
      user: 42,
      borsch: 'borsch-1',
    }));

    await favoritesAPI.create('borsch-1');

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/favorites/');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer favorite-access-token');
    expect(JSON.parse(options.body)).toEqual({ borsch: 'borsch-1' });
  });

  it('reloads favorites from the server on every device/session load', async () => {
    localStorage.setItem('access', 'favorite-access-token');
    const page = {
      count: 1,
      next: null,
      results: [{ id: 'favorite-1', user: 42, borsch: 'borsch-1' }],
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(page));

    const firstDevice = await favoritesAPI.getAll();
    const secondDevice = await favoritesAPI.getAll();

    expect(firstDevice).toEqual(page.results);
    expect(secondDevice).toEqual(page.results);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer favorite-access-token');
    }
  });

  it('refreshes an expired access token and retries the favorite write once', async () => {
    localStorage.setItem('access', 'expired-access-token');
    localStorage.setItem('refresh', 'valid-refresh-token');
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Token is invalid or expired' }),
      })
      .mockResolvedValueOnce(jsonResponse({
        access: 'fresh-access-token',
        refresh: 'rotated-refresh-token',
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'favorite-1',
        user: 42,
        borsch: 'borsch-1',
      }));

    await favoritesAPI.create('borsch-1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/token/refresh/');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refresh: 'valid-refresh-token' });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh-access-token');
    expect(localStorage.getItem('refresh')).toBe('rotated-refresh-token');
  });

  it('uses a refresh token when the access token is missing', async () => {
    localStorage.setItem('refresh', 'valid-refresh-token');
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access: 'fresh-access-token' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'favorite-1',
        user: 42,
        borsch: 'borsch-1',
      }));

    await favoritesAPI.create('borsch-1');

    expect(fetchMock.mock.calls[0][0]).toContain('/auth/token/refresh/');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-access-token');
  });

  it('refreshes and retries an expired authenticated favorites page load', async () => {
    localStorage.setItem('access', 'expired-access-token');
    localStorage.setItem('refresh', 'valid-refresh-token');
    const page = {
      count: 1,
      next: null,
      results: [{ id: 'favorite-1', user: 42, borsch: 'borsch-1' }],
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'expired' }) })
      .mockResolvedValueOnce(jsonResponse({ access: 'fresh-access-token' }))
      .mockResolvedValueOnce(jsonResponse(page));

    await expect(favoritesAPI.getAll()).resolves.toEqual(page.results);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh-access-token');
  });
});

describe('authenticated server-backed reviews', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('creates a review with bearer auth and no anonymous device fields', async () => {
    localStorage.setItem('access', 'review-access-token');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      id: 'review-1',
      borsch: 'borsch-1',
      user: 42,
      rating_salt: '8.0',
      rating_meat: '8.0',
      rating_beet: '8.0',
      rating_density: '8.0',
      rating_aftertaste: '8.0',
      rating_serving: '8.0',
      overall_rating: '8.0',
    }));

    await commentsAPI.createByBorschId('borsch-1', {
      rating_salt: 8,
      rating_meat: 8,
      rating_beet: 8,
      rating_density: 8,
      rating_aftertaste: 8,
      rating_serving: 8,
      overall_rating: 8,
      message: 'Смачно',
    });

    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(options.headers.Authorization).toBe('Bearer review-access-token');
    expect(payload).not.toHaveProperty('temp_user_id');
    expect(options.headers).not.toHaveProperty('X-Device-ID');
  });

  it('uses the serializer aggregate fields instead of recalculating from reviews', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      count: 1,
      next: null,
      results: [{
        id: 'borsch-1',
        name: 'Борщ',
        overall_rating: '7.5',
        rating_salt: '7.0',
        rating_meat: '7.1',
        rating_beet: '7.2',
        rating_density: '7.3',
        rating_aftertaste: '7.4',
        rating_serving: '7.5',
        rating_count: 4,
        ratings: [{ overall_rating: '1.0', rating_salt: '1.0' }],
      }],
    }));

    const [borsch] = await borschAPI.getAll();
    expect(borsch.overall_rating).toBe('7.5');
    expect(borsch.rating_salt).toBe('7.0');
    expect(borsch.rating_count).toBe(4);
  });
});

/**
 * The mappers used to build ids with `String(apiThing.id)`. When the backend
 * omitted the field — which two create serializers did, on 2026-09-11 and
 * 2026-09-12 — that produced the literal string "undefined": truthy, non-empty,
 * and therefore invisible to every guard between here and the network. It then
 * travelled back to the API as `place: "undefined"` and `borsch: "undefined"`
 * and was rejected as an invalid UUID at the last step of the add-a-borsch
 * flow, after the venue and the borsch had already been written.
 *
 * A missing id must read as missing, in every mapper, not just the one that
 * happened to break last.
 */
describe('a response with no id never becomes the string "undefined"', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const respondWith = (body) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(body));
  };

  it('mapPlace: a place create/read response without id yields no id', async () => {
    respondWith({ name: 'Заклад без id', address: 'вул. Тестова, 1' });
    const place = await placesAPI.getById('whatever');
    expect(place.id).toBe('');
    expect(place.id).not.toBe('undefined');
  });

  it('mapPlace: a real id still survives untouched', async () => {
    respondWith({ id: '0299159b-ade2-4017-902b-f2c0a0ece3f8', name: 'Заклад' });
    const place = await placesAPI.getById('0299159b-ade2-4017-902b-f2c0a0ece3f8');
    expect(place.id).toBe('0299159b-ade2-4017-902b-f2c0a0ece3f8');
  });

  it('mapBorsch: a borsch create response without id yields no id', async () => {
    // the exact body BorschCreateSerializer returned before the fix
    respondWith({ place: '0299159b-ade2-4017-902b-f2c0a0ece3f8', name: 'Борщ', price_uah: 120 });
    const borsch = await borschAPI.getById('whatever');
    expect(borsch.id_borsch).toBe('');
    expect(borsch.id_borsch).not.toBe('undefined');
  });

  it('mapBorsch: a borsch whose place is missing does not invent one either', async () => {
    respondWith({ id: 'borsch-1', name: 'Борщ' });
    const borsch = await borschAPI.getById('borsch-1');
    expect(borsch.id_borsch).toBe('borsch-1');
    expect(borsch.place_id).toBe('');
  });

  it('mapReview: a review without id, and without a borsch, yields neither', async () => {
    respondWith({ count: 1, next: null, results: [{ message: 'смачно', rating_salt: '8' }] });
    const [review] = await commentsAPI.getAll();
    expect(review.id).toBe('');
    expect(review.id_borsch).toBe('');
  });

  it('mapReview: a real borsch id survives', async () => {
    respondWith({
      count: 1,
      next: null,
      results: [{ id: 'r-1', borsch: 'e76e07dc-9d6f-453f-8792-8534facf04a4', message: '' }],
    });
    const [review] = await commentsAPI.getAll();
    expect(review.id).toBe('r-1');
    expect(review.id_borsch).toBe('e76e07dc-9d6f-453f-8792-8534facf04a4');
  });
});

describe('stage 3: venues from Google, facts that want confirming', () => {
  const signIn = () => {
    localStorage.setItem('auth', 'true');
    localStorage.setItem('access', 'a-token');
    localStorage.setItem('refresh', 'r-token');
  };
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  const created = (extra) => ({
    ok: true,
    status: extra.reused ? 200 : 201,
    json: async () => ({ id: 'p7', name: 'Криївка', address: 'пл. Ринок, 14', latitude: 49.8419, longitude: 24.0322, city: 'Львів', country: 'Україна', ...extra }),
  });

  it('a venue from Google is sent with its Place ID, and a reused one is a success with its id', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(created({ reused: true, google_place_id: 'ChIJ' }));
    const place = await placesAPI.create({
      name: 'Криївка', address: 'пл. Ринок, 14', city: 'Львів', country: 'Україна',
      location: { lat: 49.84190123, lng: 24.03220456 }, google_place_id: 'ChIJ',
    });
    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body).toEqual({
      name: 'Криївка', address: 'пл. Ринок, 14', city: 'Львів', country: 'Україна',
      location_lat: 49.841901, location_lng: 24.032205, google_place_id: 'ChIJ',
    });
    expect(place).toMatchObject({ id: 'p7', reused: true, google_place_id: 'ChIJ' });
  });

  it('a venue typed by hand is sent as before, without a Place ID', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(created({ reused: false }));
    await placesAPI.create({ name: 'Хата', city: 'Київ', latitude: 50.1, longitude: 30.1 });
    expect(JSON.parse(spy.mock.calls[0][1].body)).not.toHaveProperty('google_place_id');
  });

  it('a borshch carries its facts as numbers and whether they want confirming', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'b1', place: 'p1', name: 'Борщ', price_uah: '330.00', price: '330.00', weight_grams: 0, grams: 0,
        price_needs_confirmation: true, weight_needs_confirmation: true,
      }),
    });
    const b = await borschAPI.getById('b1');
    expect(b).toMatchObject({ price: '≈330 ₴', weight: '', price_value: 330, weight_value: 0, price_needs_confirmation: true, weight_needs_confirmation: true });
  });

  it('«Ціна досі?» goes to confirm_facts, signed in', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b1', price_uah: '330.00' }) });
    await borschAPI.confirmFacts('b1', { confirm: ['price'] });
    const [url, options] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/borsches\/b1\/confirm_facts\/$/);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer a-token');
    expect(JSON.parse(options.body)).toEqual({ confirm: ['price'] });
  });
});
