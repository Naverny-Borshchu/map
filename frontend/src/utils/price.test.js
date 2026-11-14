import { priceLabel, weightLabel } from './price';

const uk = (k) => ({ 'unit.uah': 'грн', 'unit.gram': 'г' }[k]);
const en = (k) => ({ 'unit.uah': 'UAH', 'unit.gram': 'g' }[k]);

it('swaps the hryvnia sign for the word, per language', () => {
  expect(priceLabel('≈185 ₴', uk)).toBe('≈185 грн');
  expect(priceLabel('≈185 ₴', en)).toBe('≈185 UAH');
});

it('keeps an unknown price empty', () => {
  expect(priceLabel('', uk)).toBe('');
  expect(priceLabel(null, uk)).toBe('');
});

it('labels the portion weight', () => {
  expect(weightLabel('400 g.', uk)).toBe('400 г');
  expect(weightLabel('400 g.', en)).toBe('400 g');
  expect(weightLabel('', uk)).toBe('');
});
