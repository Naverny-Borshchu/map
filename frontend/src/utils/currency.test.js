import { getPriceChipsForCountry, guessCountryFromAddress, PRICE_CHIPS_BY_CURRENCY } from './currency';

test('Germany gets EUR chips, not the UAH numbers', () => {
  expect(getPriceChipsForCountry('Germany')).toBe(PRICE_CHIPS_BY_CURRENCY.EUR);
});

test('is case- and whitespace-insensitive', () => {
  expect(getPriceChipsForCountry('  gErMaNy  ')).toBe(PRICE_CHIPS_BY_CURRENCY.EUR);
});

test('recognises a handful of the other eurozone names', () => {
  expect(getPriceChipsForCountry('Austria')).toBe(PRICE_CHIPS_BY_CURRENCY.EUR);
  expect(getPriceChipsForCountry('Netherlands')).toBe(PRICE_CHIPS_BY_CURRENCY.EUR);
  expect(getPriceChipsForCountry('Deutschland')).toBe(PRICE_CHIPS_BY_CURRENCY.EUR);
});

test('Ukraine keeps the existing UAH chips', () => {
  expect(getPriceChipsForCountry('Україна')).toBe(PRICE_CHIPS_BY_CURRENCY.UAH);
  expect(getPriceChipsForCountry('Ukraine')).toBe(PRICE_CHIPS_BY_CURRENCY.UAH);
});

test('unknown or missing country falls back to UAH, the existing default', () => {
  expect(getPriceChipsForCountry('')).toBe(PRICE_CHIPS_BY_CURRENCY.UAH);
  expect(getPriceChipsForCountry(undefined)).toBe(PRICE_CHIPS_BY_CURRENCY.UAH);
  expect(getPriceChipsForCountry('Neverland')).toBe(PRICE_CHIPS_BY_CURRENCY.UAH);
});

describe('guessCountryFromAddress', () => {
  test('reads the trailing part of a Google-formatted address', () => {
    expect(guessCountryFromAddress('Torstraße 1, 10119 Berlin, Germany')).toBe('Germany');
  });

  test('reads a Ukrainian address the same way', () => {
    expect(guessCountryFromAddress('вул. Городецького, 4, Київ, 02000, Україна')).toBe('Україна');
  });

  test('a bare trailing postcode is not a country', () => {
    expect(guessCountryFromAddress('Some street, 12345')).toBe('');
  });

  test('empty input is not a country', () => {
    expect(guessCountryFromAddress('')).toBe('');
    expect(guessCountryFromAddress(undefined)).toBe('');
  });
});
