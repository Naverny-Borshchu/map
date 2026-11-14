import { buildReviewList } from './reviewList';

const fallback = (n) => `Гість ${n}`;

test('every rating is listed, the ones without a comment too', () => {
  const list = buildReviewList([
    { author_username: 'a', overall_rating: 7, created_at: '2026-11-14T17:51:00Z', messege: 'Смачно' },
    { author_username: 'b', overall_rating: 5, created_at: '2026-11-14T17:47:00Z', messege: '' },
    { author_username: 'c', overall_rating: 6, created_at: '2026-11-14T17:52:00Z', messege: '   ' },
    { author_username: 'd', overall_rating: 7, created_at: '2026-11-14T17:52:30Z' },
  ], fallback);
  expect(list).toHaveLength(4);
  expect(list.map((r) => r.name)).toEqual(['d', 'c', 'a', 'b']);
  expect(list.find((r) => r.name === 'c').messege).toBe('');
  expect(list.find((r) => r.name === 'a').messege).toBe('Смачно');
});

test('a missing author gets the numbered fallback and an empty list stays empty', () => {
  expect(buildReviewList([{ overall_rating: 8, created_at: '2026-11-14' }], fallback)[0].name).toBe('Гість 1');
  expect(buildReviewList(undefined, fallback)).toEqual([]);
});
