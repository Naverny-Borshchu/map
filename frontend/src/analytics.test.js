import {
  bugContext,
  identifyUser,
  initAnalytics,
  replayPointer,
  reportBug,
  resetAnalytics,
  track,
  trackPageview,
} from './analytics';

// Без ключа аналітика має бути повним no-op, а не джерелом падінь: у тестах і
// на локальному запуску REACT_APP_POSTHOG_KEY не заданий, і жоден екран не
// повинен від цього ламатись.
describe('analytics without a project key', () => {
  it('stays silent instead of throwing', () => {
    expect(process.env.REACT_APP_POSTHOG_KEY).toBeUndefined();
    expect(() => initAnalytics()).not.toThrow();
    expect(() => track('review_submitted', { borsch_id: 'x' })).not.toThrow();
    expect(() => trackPageview()).not.toThrow();
    expect(() => identifyUser({ id: 7 })).not.toThrow();
    expect(() => identifyUser(null)).not.toThrow();
    expect(() => resetAnalytics()).not.toThrow();
  });
});

// Скарга — єдина подія, де мовчазний no-op недопустимий: екран подяки
// вирішує за `delivered`, казати «дякуємо» чи «не дійшло».
describe('bug reports without a project key', () => {
  it('reports itself as undelivered instead of pretending', () => {
    const payload = reportBug('оцінка зникла після фото');

    expect(payload.delivered).toBe(false);
    expect(payload.message).toBe('оцінка зникла після фото');
    expect(payload.replayUrl).toBeNull();
  });

  it('collects the context the reporter should not have to type', () => {
    localStorage.setItem('lang', 'uk');
    const context = bugContext();

    expect(context.path).toBe('/');
    expect(context.lang).toBe('uk');
    expect(context.viewport).toMatch(/^\d+x\d+$/);
    expect(context.userAgent).toEqual(expect.any(String));
    expect(() => new Date(context.at).toISOString()).not.toThrow();
  });

  it('has no replay to point at', () => {
    expect(replayPointer()).toEqual({ replayUrl: null, sessionId: null, distinctId: null });
  });
});
