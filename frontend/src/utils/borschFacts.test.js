import {
  factAnswer,
  factsToAsk, factsPatch, missingFacts, saveMissingFacts, WEIGHT_CHIPS } from './borschFacts';
import { borschAPI } from '../api';

/**
 * Price and weight are asked only where the card has none, and an answer only
 * fills an empty field: an existing value is never overwritten, not even with
 * the same number.
 */

// mapped borshch (api/index.js): '' when the API holds 0
const EMPTY = { id_borsch: 'b1', weight: '', price: '' };
const WEIGHED = { id_borsch: 'b1', weight: '400 g.', price: '' };
const PRICED = { id_borsch: 'b1', weight: '', price: '≈185 ₴' };
const FULL = { id_borsch: 'b1', weight: '400 g.', price: '≈185 ₴' };

describe('what to ask', () => {
  it('asks only for what the card is missing', () => {
    expect(missingFacts(EMPTY)).toEqual({ weight: true, price: true });
    expect(missingFacts(WEIGHED)).toEqual({ weight: false, price: true });
    expect(missingFacts(PRICED)).toEqual({ weight: true, price: false });
    expect(missingFacts(FULL)).toEqual({ weight: false, price: false });
    expect(missingFacts(null)).toEqual({ weight: false, price: false });
  });

  it('offers no bare 200 or 300 as a portion', () => {
    expect(WEIGHT_CHIPS).not.toContain(200);
    expect(WEIGHT_CHIPS).not.toContain(300);
  });
});

describe('only if missing, never overwrite', () => {
  it('fills both empty fields', () => {
    expect(factsPatch(EMPTY, { weight: 350, price: 160 })).toEqual({ weight: 350, price: 160 });
  });

  it('leaves out a field that already has a value', () => {
    expect(factsPatch(WEIGHED, { weight: 250, price: 160 })).toEqual({ price: 160 });
    expect(factsPatch(PRICED, { weight: 250, price: 999 })).toEqual({ weight: 250 });
    expect(factsPatch(FULL, { weight: 250, price: 160 })).toEqual({});
  });

  it('sends nothing for «Не знаю», an empty or an absurd answer', () => {
    expect(factsPatch(EMPTY, {})).toEqual({});
    expect(factsPatch(EMPTY, { weight: null, price: '' })).toEqual({});
    expect(factsPatch(EMPTY, { weight: 5, price: 0 })).toEqual({});
    expect(factsPatch(EMPTY, { weight: 99999, price: -10 })).toEqual({});
    expect(factsPatch(EMPTY, { weight: '350 г', price: '185,5' })).toEqual({ weight: 350, price: 185.5 });
  });

  it('reads the borshch again and writes only what is still empty', async () => {
    // the card said both were missing; someone added the weight meanwhile
    const api = { getById: jest.fn().mockResolvedValue(WEIGHED), update: jest.fn().mockResolvedValue({}) };
    const res = await saveMissingFacts({ borschId: 'b1', answers: { weight: 250, price: 160 }, api });
    expect(api.getById).toHaveBeenCalledWith('b1');
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith('b1', { price: 160 });
    expect(res.saved).toEqual({ price: 160 });
  });

  it('does not write at all when everything got filled meanwhile', async () => {
    const api = { getById: jest.fn().mockResolvedValue(FULL), update: jest.fn() };
    const res = await saveMissingFacts({ borschId: 'b1', answers: { weight: 250, price: 160 }, api });
    expect(api.update).not.toHaveBeenCalled();
    expect(res.saved).toEqual({});
  });
});

describe('the PATCH that leaves the device', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('carries only the missing field, under the API name', async () => {
    localStorage.setItem('access', 'header.payload.signature');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'b1', weight_grams: 350 }),
    });
    await borschAPI.update('b1', factsPatch(PRICED, { weight: 350, price: 150 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/borsches\/b1\/$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ weight_grams: 350 });
  });
});

describe('factsToAsk: never more than two questions', () => {
  const card = (extra) => ({ weight: '400 g.', price: '≈330 ₴', price_value: 330, weight_value: 400, ...extra });

  it('one «досі?» about an old value, the price first', () => {
    expect(factsToAsk(card({ price_needs_confirmation: true, weight_needs_confirmation: true })))
      .toEqual({ missing: { weight: false, price: false }, confirm: 'price' });
    expect(factsToAsk(card({ price_needs_confirmation: false, weight_needs_confirmation: true })).confirm).toBe('weight');
    expect(factsToAsk(card({})).confirm).toBeNull();
  });

  it('a missing value keeps its question; the other may add one «досі?»', () => {
    expect(factsToAsk(card({ weight: '', weight_value: 0, price_needs_confirmation: true, weight_needs_confirmation: true })))
      .toEqual({ missing: { weight: true, price: false }, confirm: 'price' });
  });

  it('two missing values leave no room for a third question', () => {
    expect(factsToAsk({ weight: '', price: '', price_needs_confirmation: true, weight_needs_confirmation: true }))
      .toEqual({ missing: { weight: true, price: true }, confirm: null });
  });

  it('a backend without the flags asks no «досі?»', () => {
    expect(factsToAsk(card({ price_needs_confirmation: undefined })).confirm).toBeNull();
    expect(factsToAsk(null)).toEqual({ missing: { weight: false, price: false }, confirm: null });
  });

  it('a «Ні, інша» answer is a number in range or nothing', () => {
    expect(factAnswer('price', '345,50')).toBe(345.5);
    expect(factAnswer('price', '0')).toBeNull();
    expect(factAnswer('weight', '350.4')).toBe(350);
    expect(factAnswer('weight', '20')).toBeNull();
    expect(factAnswer('weight', '')).toBeNull();
  });
});
