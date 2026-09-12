import { identifyUser, initAnalytics, resetAnalytics, track, trackPageview } from './analytics';

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
