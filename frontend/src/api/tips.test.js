import { tipNoteError, tipPoint, tipsAPI } from './tips';
import { track } from '../analytics';

jest.mock('../analytics', () => ({ ...jest.requireActual('../analytics'), track: jest.fn() }));

/**
 * «Тут є Борщ» (api/tips.js): what goes to the API and what comes back to the
 * screens. fetch is a spy: nothing here reaches a server.
 */

const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body });
const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a-token');
  localStorage.setItem('refresh', 'r-token');
};
const lastCall = (spy) => {
  const [url, options = {}] = spy.mock.calls[spy.mock.calls.length - 1];
  return { url: String(url), options, headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : null };
};
const PLACE = { id: 'p1', name: 'Ватра', address: 'пл. Ринок, 1', city: 'Львів', latitude: 49.8417, longitude: 24.0315, google_place_id: null };
const tip = (extra = {}) => ({ id: 't1', status: 'open', note: '', is_author: false, confirmations: 0, gone_votes: 0, my_vote: null, place: PLACE, ...extra });

beforeEach(() => {
  localStorage.clear();
  track.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe('the map', () => {
  it('asks for the view as bbox, one page, without a sign-in, and keeps only live tips with a place', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({
      count: 4,
      results: [tip(), tip({ id: 't2', status: 'confirmed' }), tip({ id: 't3', status: 'gone' }), tip({ id: 't4', place: { ...PLACE, latitude: null } })],
    }));
    const list = await tipsAPI.inView('49.80,23.95,49.90,24.10');
    expect(list.map((x) => x.id)).toEqual(['t1', 't2']);
    const call = lastCall(spy);
    expect(call.url).toContain('/tips/?bbox=49.80%2C23.95%2C49.90%2C24.10&page_size=100');
    expect(call.headers.Authorization).toBeUndefined();
  });

  it('a tip\'s point is numbers or nothing', () => {
    expect(tipPoint(tip())).toEqual({ lat: 49.8417, lng: 24.0315 });
    expect(tipPoint({ place: { latitude: '49.1', longitude: '24.2' } })).toEqual({ lat: 49.1, lng: 24.2 });
    expect(tipPoint({ place: { latitude: 0, longitude: 0 } })).toBeNull();
    expect(tipPoint({})).toBeNull();
  });
});

describe('leaving a tip', () => {
  it('our venue: { place, note }, signed in, and tip_created says what happened', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok(tip({ reused: false, note: 'У меню щодня' }), 201));
    await tipsAPI.create({ place: 'p1', note: '  У меню щодня ' }, { from: 'chooser' });
    const call = lastCall(spy);
    expect(call.options.method).toBe('POST');
    expect(call.headers.Authorization).toBe('Bearer a-token');
    expect(call.body).toEqual({ place: 'p1', note: 'У меню щодня' });
    expect(track).toHaveBeenCalledWith('tip_created', {
      tip_id: 't1', place_id: 'p1', reused: false, new_place: false, has_note: true, status: 'open', from: 'chooser',
    });
    expect(track).not.toHaveBeenCalledWith('place_from_google', expect.anything());
  });

  it('a venue from Google goes as new_place, and place_from_google says whether the backend had it', async () => {
    signIn();
    const newPlace = { name: 'Криївка', address: 'пл. Ринок, 14', city: 'Львів', country: 'Україна', location_lat: 49.8419, location_lng: 24.0322, google_place_id: 'ChIJ' };
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok(tip({ place: { ...PLACE, id: 'p9' }, reused: true, place_reused: true }), 200));
    await tipsAPI.create({ newPlace, note: '' });
    expect(lastCall(spy).body).toEqual({ new_place: newPlace, note: '' });
    expect(track).toHaveBeenCalledWith('place_from_google', { reused: true, place_id: 'p9', via: 'tip' });
    expect(track).toHaveBeenCalledWith('tip_created', expect.objectContaining({ reused: true, new_place: true }));
  });

  it('409 already_rated keeps the venue id for the screen', async () => {
    signIn();
    jest.spyOn(global, 'fetch').mockResolvedValue(fail(409, { error: 'Уже оцінено', code: 'already_rated', place: 'p1' }));
    await expect(tipsAPI.create({ place: 'p1' })).rejects.toMatchObject({ status: 409, code: 'already_rated', data: { place: 'p1' } });
  });

  it('nobody signed in: refused on the device', async () => {
    const spy = jest.spyOn(global, 'fetch');
    await expect(tipsAPI.create({ place: 'p1' })).rejects.toThrow('AUTH_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
  });

  it('a note: optional, up to 140, no links', () => {
    expect(tipNoteError('')).toBeNull();
    expect(tipNoteError('Борщ у меню, 150 грн')).toBeNull();
    expect(tipNoteError('x'.repeat(141))).toBe('long');
    expect(tipNoteError('дивись https://example.com')).toBe('link');
    expect(tipNoteError('www.borshch.ua')).toBe('link');
    expect(tipNoteError('меню на vatra.com.ua')).toBe('link');
  });
});

describe('votes', () => {
  it('«Так, є» and «Вже нема» post to their own endpoints and say how it went', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok(tip({ status: 'confirmed', my_vote: 'confirm' })));
    await tipsAPI.confirm('t1', { from: 'map' });
    expect(lastCall(spy).url).toMatch(/\/tips\/t1\/confirm\/$/);
    expect(track).toHaveBeenCalledWith('tip_vote', { vote: 'confirm', tip_id: 't1', status: 'confirmed', from: 'map' });
    spy.mockResolvedValue(ok(tip({ status: 'gone' })));
    await tipsAPI.gone('t1');
    expect(lastCall(spy).url).toMatch(/\/tips\/t1\/gone\/$/);
    expect(track).toHaveBeenCalledWith('tip_vote', { vote: 'gone', tip_id: 't1', status: 'gone' });
  });

  it('the author\'s «Так, є» comes back as own_tip', async () => {
    signIn();
    jest.spyOn(global, 'fetch').mockResolvedValue(fail(403, { error: 'Своя', code: 'own_tip' }));
    await expect(tipsAPI.confirm('t1')).rejects.toMatchObject({ code: 'own_tip' });
  });

  it('my tips need the sign-in', async () => {
    signIn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ results: [tip({ status: 'converted' })] }));
    expect(await tipsAPI.mine()).toHaveLength(1);
    expect(lastCall(spy).url).toContain('mine=true');
    expect(lastCall(spy).headers.Authorization).toBe('Bearer a-token');
  });
});
