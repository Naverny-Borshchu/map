import {
  bugContext,
  identifyUser,
  initAnalytics,
  replayPointer,
  reportBug,
  resetAnalytics,
  scrubHandoff,
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

// Поки панель вбудованого браузера на екрані, в адресі лежать відповіді
// людини (services/handoff). До PostHog і в скарги вони не потрапляють.
describe('the carried answers stay out of analytics', () => {
  const url = 'https://map.navernyborshchu.com/borsch/b1/evaluations?nb_handoff=eyJ2IjoyLCJkcmFmdCI6&utm_source=threads';
  const clean = 'https://map.navernyborshchu.com/borsch/b1/evaluations?utm_source=threads';

  it('scrubs every URL an event carries', () => {
    const event = scrubHandoff({
      event: '$autocapture',
      properties: { $current_url: url, $referrer: url, $pathname: '/borsch/b1/evaluations', n: 3 },
      $set: { $current_url: url },
      $set_once: { $initial_current_url: url },
    });
    expect(event.properties).toEqual({ $current_url: clean, $referrer: clean, $pathname: '/borsch/b1/evaluations', n: 3 });
    expect(event.$set.$current_url).toBe(clean);
    expect(event.$set_once.$initial_current_url).toBe(clean);
    expect(scrubHandoff(null)).toBeNull();
  });

  it('and a bug report', () => {
    window.history.replaceState(null, '', '/borsch/b1/evaluations?nb_handoff=eyJ2Ijoy&utm_source=threads');
    expect(bugContext().search).toBe('?utm_source=threads');
    window.history.replaceState(null, '', '/borsch/b1/evaluations?nb_handoff=eyJ2Ijoy');
    expect(bugContext().search).toBeNull();
    window.history.replaceState(null, '', '/');
  });
});

