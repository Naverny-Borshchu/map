import { GUEST_TOKEN_HEADER, normalizeTableCode, tableLink, tablesAPI } from './tables';
import { track } from '../analytics';

jest.mock('../analytics', () => ({ ...jest.requireActual('../analytics'), track: jest.fn() }));

/**
 * The table client (api/tables.js): who a request speaks for (a guest token,
 * a sign-in, or nobody), what goes in the body, and the API's own error codes
 * surviving to the screen. No request here reaches a server: fetch is a spy.
 */

const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body });

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'host-access');
  localStorage.setItem('refresh', 'host-refresh');
};

const GRADES = { meat: 8, beetroot: 10, density: 6, salt: 6, aftertaste: 8, serving: 4, overall: 8 };

beforeEach(() => {
  localStorage.clear();
  track.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const lastCall = (spy) => {
  const [url, options = {}] = spy.mock.calls[spy.mock.calls.length - 1];
  return { url: String(url), options, headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : null };
};

describe('table codes', () => {
  it('reads a code the way people type it: any case, spaces around', () => {
    expect(normalizeTableCode('k7m2qx')).toBe('K7M2QX');
    expect(normalizeTableCode('  K7M2QX ')).toBe('K7M2QX');
    expect(normalizeTableCode('K7M2QXAB')).toBe('K7M2QXAB');
  });

  it('refuses what cannot be a code, so no request is made for it', () => {
    // 0/O and 1/I/L are left out of the alphabet: they are confused aloud and on screens
    ['K7M2Q0', 'K7M2QO', 'K7M2Q1', 'K7M2QI', 'K7M2QL', 'K7M2Q', 'K7M2QXABC', 'K7M-2Q', '', null, undefined]
      .forEach((raw) => expect(normalizeTableCode(raw)).toBeNull());
  });

  it('links to the site the host is on when that is ours, otherwise to the API share_url', () => {
    // jsdom is http://localhost: not ours
    expect(tableLink('K7M2QX', 'https://map.navernyborshchu.com/t/K7M2QX')).toBe('https://map.navernyborshchu.com/t/K7M2QX');
    expect(tableLink('K7M2QX', '')).toBe('http://localhost/t/K7M2QX');
  });
});

describe('reading a table', () => {
  it('a guest with a token sends the token and never a sign-in, even when signed in', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ code: 'K7M2QX' }));
    await tablesAPI.get('K7M2QX', { guestToken: 'guest-token-123456789012345' });
    const { url, headers } = lastCall(spy);
    expect(url).toMatch(/\/tables\/K7M2QX\/$/);
    expect(headers[GUEST_TOKEN_HEADER]).toBe('guest-token-123456789012345');
    expect(headers.Authorization).toBeUndefined();
  });

  it('a signed-in person is recognised (the host sees names and raters)', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ code: 'K7M2QX', is_host: true }));
    await tablesAPI.get('K7M2QX');
    expect(lastCall(spy).headers.Authorization).toBe('Bearer host-access');
  });

  it('nobody signed in: a plain public GET', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ code: 'K7M2QX' }));
    await tablesAPI.get('K7M2QX');
    const { headers } = lastCall(spy);
    expect(headers.Authorization).toBeUndefined();
    expect(headers[GUEST_TOKEN_HEADER]).toBeUndefined();
  });

  it('an expired sign-in that cannot be refreshed does not break the public table', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(fail(401, { detail: 'expired' }))      // GET with the old token
      .mockResolvedValueOnce(fail(401, { detail: 'bad refresh' }))  // refresh refused
      .mockResolvedValueOnce(ok({ code: 'K7M2QX', is_host: false })); // GET again, anonymous
    const table = await tablesAPI.get('K7M2QX');
    expect(table.code).toBe('K7M2QX');
    expect(String(spy.mock.calls[1][0])).toMatch(/auth\/token\/refresh/);
    expect(lastCall(spy).headers.Authorization).toBeUndefined();
  });

  it('results go with the guest token too', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ code: 'K7M2QX' }));
    await tablesAPI.results('K7M2QX', { guestToken: 'guest-token-123456789012345' });
    const { url, headers } = lastCall(spy);
    expect(url).toMatch(/\/tables\/K7M2QX\/results\/$/);
    expect(headers[GUEST_TOKEN_HEADER]).toBe('guest-token-123456789012345');
  });
});

describe('rating at a table', () => {
  it('a new guest sends the name and the seven scores by position, no token, no sign-in', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ created: true, rated_positions: [1], guest_token: 'new-token-xxxxxxxxxxxxxxxx' }, 201));
    const res = await tablesAPI.rate('K7M2QX', { position: 1, grades: GRADES, as: 'guest', guestName: '  Оля ' });
    const { url, options, headers, body } = lastCall(spy);
    expect(url).toMatch(/\/tables\/K7M2QX\/reviews\/$/);
    expect(options.method).toBe('POST');
    expect(headers.Authorization).toBeUndefined();
    expect(headers[GUEST_TOKEN_HEADER]).toBeUndefined();
    expect(body).toEqual({
      position: 1,
      guest_name: 'Оля',
      rating_meat: 8,
      rating_beet: 10,
      rating_density: 6,
      rating_salt: 6,
      rating_aftertaste: 8,
      rating_serving: 4,
      overall_rating: 8,
      message: '',
    });
    expect(res.guest_token).toBe('new-token-xxxxxxxxxxxxxxxx');
    expect(track).toHaveBeenCalledWith('table_review', expect.objectContaining({ code: 'K7M2QX', position: 1, as: 'guest', created: true }));
  });

  it('a returning guest sends the token in the header; the name rides along for a token the table lost', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ created: true, rated_positions: [1, 2] }, 201));
    await tablesAPI.rate('K7M2QX', { position: 2, grades: GRADES, as: 'guest', guestName: 'Оля', guestToken: 'guest-token-123456789012345' });
    const { headers, body } = lastCall(spy);
    expect(headers[GUEST_TOKEN_HEADER]).toBe('guest-token-123456789012345');
    expect(headers.Authorization).toBeUndefined();
    expect(body.guest_name).toBe('Оля');
    expect(body.position).toBe(2);
  });

  it('a signed-in person rates as themselves: a Bearer token, no guest fields', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ created: true, rated_positions: [1], guest_token: null }, 201));
    await tablesAPI.rate('K7M2QX', { position: 1, grades: GRADES, as: 'user', guestName: 'Оля' });
    const { headers, body } = lastCall(spy);
    expect(headers.Authorization).toBe('Bearer host-access');
    expect(headers[GUEST_TOKEN_HEADER]).toBeUndefined();
    expect(body.guest_name).toBeUndefined();
  });

  it('keeps the API reason, so the screen can react to a closed table or a full one', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(fail(409, { error: 'Стіл уже закрито, оцінки більше не приймаються.', code: 'table_closed' }));
    await expect(tablesAPI.rate('K7M2QX', { position: 1, grades: GRADES, guestName: 'Оля' }))
      .rejects.toMatchObject({ status: 409, code: 'table_closed', message: 'Стіл уже закрито, оцінки більше не приймаються.' });
  });
});

describe('the host', () => {
  it('creates a table with a sign-in and counts it', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ code: 'K7M2QX', share_url: 'https://map.navernyborshchu.com/t/K7M2QX' }, 201));
    const payload = {
      place: 'p1',
      blind: true,
      title: ' День Борщу ',
      borsches: [{ id: 'b1', price_uah: 185 }, { name: 'Борщ з чорносливом', weight_grams: 350 }],
    };
    const table = await tablesAPI.create(payload, { entry: 'chooser' });
    const { url, options, headers, body } = lastCall(spy);
    expect(url).toMatch(/\/tables\/$/);
    expect(options.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer host-access');
    expect(body).toEqual({ ...payload, title: 'День Борщу' });
    expect(table.code).toBe('K7M2QX');
    expect(track).toHaveBeenCalledWith('table_created', expect.objectContaining({
      code: 'K7M2QX', borsch_count: 2, new_borsches: 1, blind: true, has_title: true, entry: 'chooser',
    }));
  });

  it('cannot create without an account: refused on the device, nothing sent', async () => {
    const spy = jest.spyOn(global, 'fetch');
    await expect(tablesAPI.create({ place: 'p1', borsches: [{ id: 'b1' }] })).rejects.toThrow('AUTH_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes with a sign-in and reports the progress at that moment', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({
      code: 'K7M2QX', status: 'closed', blind: true, borsches: [{}, {}], progress: { raters_total: 11, raters_complete: 9 },
    }));
    await tablesAPI.close('K7M2QX');
    const { url, options, headers } = lastCall(spy);
    expect(url).toMatch(/\/tables\/K7M2QX\/close\/$/);
    expect(options.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer host-access');
    expect(track).toHaveBeenCalledWith('table_closed', expect.objectContaining({ raters_total: 11, raters_complete: 9, borsch_count: 2 }));
  });

  it('lists my tables from the paginated answer', async () => {
    signIn();
    jest.spyOn(global, 'fetch').mockResolvedValue(ok({ count: 1, next: null, results: [{ code: 'K7M2QX' }] }));
    await expect(tablesAPI.listMine()).resolves.toEqual([{ code: 'K7M2QX' }]);
  });
});

describe('a guest takes the ratings into the account (claim)', () => {
  beforeEach(() => sessionStorage.clear());

  it('offers the claim without a probe request, until a POST says the endpoint is missing', async () => {
    const spy = jest.spyOn(global, 'fetch');
    expect(await tablesAPI.claimAvailable('K7M2QX')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    signIn();
    spy.mockResolvedValue(fail(405, { detail: 'no' }));
    await expect(tablesAPI.claim('K7M2QX', 'guest-token-1234567890abcdef')).rejects.toMatchObject({ code: 'claim_unavailable' });
    expect(await tablesAPI.claimAvailable('K7M2QX')).toBe(false);
  });

  it('posts with the sign-in and the guest token, and reports what moved', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ moved: 3, dropped: 1, table: 'K7M2QX' }));
    expect(await tablesAPI.claim('K7M2QX', 'guest-token-1234567890abcdef', { from: 'done' })).toEqual({ moved: 3, dropped: 1 });
    const call = lastCall(spy);
    expect(call.url).toMatch(/\/tables\/K7M2QX\/claim\/$/);
    expect(call.options.method).toBe('POST');
    expect(call.headers.Authorization).toBe('Bearer host-access');
    expect(call.headers[GUEST_TOKEN_HEADER]).toBe('guest-token-1234567890abcdef');
    expect(track).toHaveBeenCalledWith('table_claim', { code: 'K7M2QX', moved: 3, dropped: 1, from: 'done' });
  });

  it('404 guest_not_found stays what it is; a missing endpoint becomes claim_unavailable', async () => {
    signIn();
    jest.spyOn(global, 'fetch').mockResolvedValue(fail(404, { error: 'Нема', code: 'guest_not_found' }));
    await expect(tablesAPI.claim('K7M2QX', 'guest-token-1234567890abcdef')).rejects.toMatchObject({ code: 'guest_not_found' });
    jest.spyOn(global, 'fetch').mockResolvedValue(fail(405, { detail: 'no' }));
    await expect(tablesAPI.claim('K7M2QX', 'guest-token-1234567890abcdef')).rejects.toMatchObject({ code: 'claim_unavailable' });
    expect(sessionStorage.getItem('nb:table-claim-api')).toBe('no');
    jest.spyOn(global, 'fetch').mockResolvedValue(fail(404, { detail: 'Not found.' }));
    await expect(tablesAPI.claim('K7M2QX', 'guest-token-1234567890abcdef')).rejects.toMatchObject({ code: 'claim_unavailable' });
  });

  it('nobody signed in: refused before anything leaves the device', async () => {
    const spy = jest.spyOn(global, 'fetch');
    await expect(tablesAPI.claim('K7M2QX', 'guest-token-1234567890abcdef')).rejects.toThrow('AUTH_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
  });
});
