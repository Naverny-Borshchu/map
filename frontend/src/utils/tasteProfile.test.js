import { borschMatches, countActiveFilters, EMPTY_FILTERS } from './filtering';
import { filtersToParams, paramsToFilters } from './filterUrl';
import { distMean, formatMean, hasDescription, hasTrait, modeOf, normalizeProfile, sidesSplit } from './tasteProfile';

import { PROFILE } from './tasteProfile.fixture';

const borsch = (profile) => ({ id_borsch: 'b', overall_rating: '9.2', price: '', type_meat: 'pork', profile: normalizeProfile(profile) });
const matches = (profile, traits) => borschMatches(borsch(profile), { type: 'Ресторан' }, { ...EMPTY_FILTERS, traits });

describe('normalizeProfile', () => {
  test('a borshch without a profile (an API before scheme 3) has none', () => {
    expect(normalizeProfile(undefined)).toBeNull();
    expect(normalizeProfile(null)).toBeNull();
    expect(normalizeProfile('nope')).toBeNull();
    expect(hasDescription(null)).toBe(false);
  });

  test('half a profile is filled in with zeros, never with guesses', () => {
    const p = normalizeProfile({ reviews: 2, salt: { mean: 12 }, density: { mean: '6.5', n: 1, legacy_n: 3 } });
    expect(p.meat_amount).toEqual({ counts: [0, 0, 0, 0], n: 0 });
    expect(p.salt.mean).toBeNull(); // 12 does not fit 1..9
    expect(p.density).toEqual({ mean: 6.5, n: 1, legacy_n: 3 });
    expect(p.sides.counts.chili).toBe(0);
    expect(hasDescription(p)).toBe(true);
  });

  test('the most common answer, ties to the larger amount', () => {
    const p = normalizeProfile(PROFILE);
    expect(modeOf(p.meat_amount)).toEqual({ index: 3, count: 6, total: 9 });
    expect(modeOf({ counts: [0, 2, 2], n: 4 })).toEqual({ index: 2, count: 2, total: 4 });
    expect(modeOf({ counts: [0, 0, 0], n: 0 })).toBeNull();
    expect(distMean(p.beet_flavor)).toBeCloseTo(4, 5);
  });

  test('sides: at least half are chips, the rest are «ще згадують»', () => {
    expect(sidesSplit(normalizeProfile(PROFILE))).toEqual({
      main: ['sour_cream', 'pampushky', 'salo'],
      rest: ['garlic', 'bread', 'greens'],
      mostlyNone: false,
    });
    expect(sidesSplit(normalizeProfile({ sides: { counts: {}, n: 4, none: 3 } })).mostlyNone).toBe(true);
  });

  test('a mean in the language’s own way', () => {
    expect(formatMean(7.25, 'uk')).toBe('7,3');
    expect(formatMean(7.2, 'en')).toBe('7.2');
  });
});

describe('the «Який він» filters', () => {
  test('the spec example is meaty, beetroot-rich, thick, with pampushky and salo', () => {
    ['meaty', 'beety', 'thick', 'pampushky', 'salo'].forEach((k) => expect(hasTrait(normalizeProfile(PROFILE), k)).toBe(true));
    expect(hasTrait(normalizeProfile(PROFILE), 'thin')).toBe(false);
    expect(matches(PROFILE, ['meaty', 'thick', 'pampushky'])).toBe(true);
    expect(matches(PROFILE, ['thin'])).toBe(false);
  });

  test('«Густий» from 7, «Рідкий» up to 4, by the mean with the founders’ catalogue in it', () => {
    expect(matches({ density: { mean: 7, n: 0, legacy_n: 2 } }, ['thick'])).toBe(true);
    expect(matches({ density: { mean: 6.9, n: 3, legacy_n: 0 } }, ['thick'])).toBe(false);
    expect(matches({ density: { mean: 4, n: 2, legacy_n: 0 } }, ['thin'])).toBe(true);
    expect(matches({ density: { mean: 4.1, n: 2, legacy_n: 0 } }, ['thin'])).toBe(false);
  });

  test('«Буряковий»: mostly «багато», or a bright taste on its own', () => {
    expect(matches({ beet_amount: { counts: [2, 0, 2], n: 4 } }, ['beety'])).toBe(true);
    expect(matches({ beet_amount: { counts: [2, 1, 1], n: 4 } }, ['beety'])).toBe(false);
    expect(matches({ beet_flavor: { counts: [0, 0, 0, 3, 1], n: 4 } }, ['beety'])).toBe(true);
    expect(matches({ beet_flavor: { counts: [0, 2, 2, 0, 0], n: 4 } }, ['beety'])).toBe(false);
  });

  test('sides need at least half of the answers', () => {
    expect(matches({ sides: { counts: { salo: 2 }, n: 4, none: 1 } }, ['salo'])).toBe(true);
    expect(matches({ sides: { counts: { salo: 1 }, n: 4, none: 1 } }, ['salo'])).toBe(false);
  });

  test('a borshch nobody described passes no «Який він» filter, and every other filter as before', () => {
    expect(borschMatches({ ...borsch(null), profile: null }, { type: 'Ресторан' }, { ...EMPTY_FILTERS, traits: ['thick'] })).toBe(false);
    expect(borschMatches({ ...borsch(null), profile: null }, { type: 'Ресторан' }, { ...EMPTY_FILTERS, minOverall: 9 })).toBe(true);
  });

  test('each chosen trait counts as one active filter; the old minimums are gone', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, traits: ['thick', 'salo'] })).toBe(2);
    expect(countActiveFilters({ ...EMPTY_FILTERS, criteria: { salt: 7 } })).toBe(0);
    expect(EMPTY_FILTERS).not.toHaveProperty('criteria');
  });
});

describe('the link of a filtered view', () => {
  test('traits go into ?trait= and come back', () => {
    const p = filtersToParams({ traits: ['salo', 'thick'], minOverall: 8 });
    expect(p.get('trait')).toBe('thick,salo');
    expect(paramsToFilters(p).filters).toMatchObject({ traits: ['thick', 'salo'], minOverall: 8 });
  });

  test('an old link with ?c=salt:7 opens without the minimum, and nothing breaks', () => {
    const { filters, hasAny } = paramsToFilters('?c=salt:7,meat:9&score=8');
    expect(filters).not.toHaveProperty('criteria');
    expect(filters.traits).toEqual([]);
    expect(filters.minOverall).toBe(8);
    expect(hasAny).toBe(true);
    expect(paramsToFilters('?c=salt:7').hasAny).toBe(false);
  });

  test('unknown traits are dropped, and «густий» with «рідкий» keeps the first', () => {
    expect(paramsToFilters('?trait=spicy,thin,thick').filters.traits).toEqual(['thin']);
  });
});
