import { SORTS } from './filterUrl';
import { sortBorsches } from './borschSorting';

const row = (id, name, rating, price) => ({
  id_borsch: id,
  name,
  overall_rating: rating,
  price,
});
const ids = (rows) => rows.map(({ id_borsch }) => id_borsch);

test('the list exposes exactly the four requested sort modes', () => {
  expect(SORTS).toEqual(['best', 'near', 'cheapest', 'expensive']);
});

test('best sorts valid ratings descending and leaves unrated borsches last', () => {
  const rows = [
    row('low', 'Низький', '4.5', '100'),
    row('missing', 'Без оцінки', '—', '100'),
    row('high', 'Високий', '9.0', '100'),
  ];

  expect(ids(sortBorsches(rows, 'best'))).toEqual(['high', 'low', 'missing']);
  expect(ids(rows)).toEqual(['low', 'missing', 'high']);
});

test('near sorts numeric distances ascending and leaves missing distances last', () => {
  const rows = [
    row('far', 'Далекий', 8, '100'),
    row('missing', 'Без геолокації', 10, '100'),
    row('near', 'Близький', 5, '100'),
  ];
  const distances = { far: 1250, missing: null, near: 80 };

  expect(ids(sortBorsches(rows, 'near', (borsch) => distances[borsch.id_borsch])))
    .toEqual(['near', 'far', 'missing']);
});

test.each([
  ['cheapest', ['cheap', 'mid', 'expensive', 'missing']],
  ['expensive', ['expensive', 'mid', 'cheap', 'missing']],
])('%s sorts numeric display prices and leaves invalid prices last', (mode, expected) => {
  const rows = [
    row('missing', 'Без ціни', 8, ''),
    row('mid', 'Середній', 8, '≈250,50 ₴'),
    row('expensive', 'Дорогий', 8, '400.00'),
    row('cheap', 'Дешевий', 8, '90 ₴'),
  ];

  expect(ids(sortBorsches(rows, mode))).toEqual(expected);
});

test('equal and missing values use name then stable id as deterministic tie-breakers', () => {
  const rows = [
    row('b', 'Борщ', '—', ''),
    row('z', 'Ароматний', '—', ''),
    row('a', 'Борщ', '—', ''),
  ];

  expect(ids(sortBorsches(rows, 'best'))).toEqual(['z', 'a', 'b']);
  expect(ids(sortBorsches(rows, 'near'))).toEqual(['z', 'a', 'b']);
  expect(ids(sortBorsches(rows, 'cheapest'))).toEqual(['z', 'a', 'b']);
  expect(ids(sortBorsches(rows, 'expensive'))).toEqual(['z', 'a', 'b']);
});
