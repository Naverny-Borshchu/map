import { detectInAppBrowser, externalBrowserUrl } from './inAppBrowser';

// real user agents, read off visits to the map (PostHog, 11.2026)
const THREADS_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G83 Barcelona 456.0.0.32.61 (iPhone18,1; iOS 26_6_1; uk_UA; uk; scale=3.00; 1206x2622; IABMV/1; 1114829568)';
const INSTAGRAM_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.0.0 Mobile Safari/537.36 Instagram 455.0.0.51.72 Android (37/17; 420dpi; 1080x2424; Google/google; Pixel 9; tokay; tokay; en_UA; 1110835071; IABMV/1)';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Mobile/23G90 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/157.0.8103.37 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 17; Mobile; rv:160.0) Gecko/160.0 Firefox/160.0';
const DESKTOP_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
const FACEBOOK_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.108;FBBV/123;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBLC/uk_UA;FBOP/5]';
const GENERIC_ANDROID_WV = 'Mozilla/5.0 (Linux; Android 14; SM-S921B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.0.0 Mobile Safari/537.36';

describe('detectInAppBrowser', () => {
  it('recognises the browser inside Threads by its code name', () => {
    expect(detectInAppBrowser(THREADS_IOS)).toEqual({ app: 'Threads', os: 'ios' });
  });

  it('recognises Instagram and Facebook', () => {
    expect(detectInAppBrowser(INSTAGRAM_ANDROID)).toEqual({ app: 'Instagram', os: 'android' });
    expect(detectInAppBrowser(FACEBOOK_IOS)).toEqual({ app: 'Facebook', os: 'ios' });
  });

  it('treats any Android web view as one, even unnamed', () => {
    expect(detectInAppBrowser(GENERIC_ANDROID_WV)).toEqual({ app: null, os: 'android' });
  });

  it('leaves real browsers alone, Google signs in from all of them', () => {
    [SAFARI_IOS, CHROME_IOS, CHROME_ANDROID, FIREFOX_ANDROID, DESKTOP_CHROME, ''].forEach((ua) => {
      expect(detectInAppBrowser(ua)).toBeNull();
    });
  });
});

describe('externalBrowserUrl', () => {
  const href = 'https://map.navernyborshchu.com/borsch/abc/evaluations?nb_handoff=xyz';

  it('hands the page to Safari on iOS', () => {
    expect(externalBrowserUrl(href, 'ios'))
      .toBe('x-safari-https://map.navernyborshchu.com/borsch/abc/evaluations?nb_handoff=xyz');
  });

  it('hands the page to the default browser on Android, with the page itself as the fallback', () => {
    const url = externalBrowserUrl(href, 'android');
    expect(url.startsWith('intent://map.navernyborshchu.com/borsch/abc/evaluations?nb_handoff=xyz#Intent;scheme=https;')).toBe(true);
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent(href)}`);
    expect(url.endsWith(';end')).toBe(true);
  });

  it('has nothing to offer elsewhere or for odd addresses', () => {
    expect(externalBrowserUrl(href, 'other')).toBeNull();
    expect(externalBrowserUrl('http://localhost:3000/x', 'ios')).toBeNull();
    expect(externalBrowserUrl('not a url', 'ios')).toBeNull();
  });
});
