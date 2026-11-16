import { isDailyLimitError, limitReached } from './useDailyLimit';

// GET /reviews/today/ and the 429 of POST /reviews/ (11.2026)
test('only a clear «no» stops the rating', () => {
  expect(limitReached({ count: 2, limit: 2, remaining: 0, already_rated: false })).toBe(true);
  // an update of a borshch already rated is never stopped
  expect(limitReached({ count: 2, limit: 2, remaining: 0, already_rated: true })).toBe(false);
  expect(limitReached({ count: 1, limit: 2, remaining: 1, already_rated: false })).toBe(false);
  // staff: no limit at all
  expect(limitReached({ count: 7, limit: null, remaining: null, already_rated: false })).toBe(false);
  // nothing known (no account yet, an older backend)
  expect(limitReached(null)).toBe(false);
  expect(limitReached({})).toBe(false);
});

test('the 429 of the day\'s limit, and nothing else', () => {
  expect(isDailyLimitError({ status: 429, code: 'daily_limit' })).toBe(true);
  expect(isDailyLimitError({ status: 429, data: { code: 'daily_limit' } })).toBe(true);
  expect(isDailyLimitError({ status: 429 })).toBe(false); // the rate limiter of the whole API
  expect(isDailyLimitError({ status: 400, code: 'daily_limit' })).toBe(false);
  expect(isDailyLimitError(null)).toBe(false);
});
