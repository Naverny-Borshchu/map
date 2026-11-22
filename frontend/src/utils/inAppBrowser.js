/**
 * The browser inside another app (Threads, Instagram, Facebook, TikTok…).
 *
 * Google refuses to sign anybody in from an embedded web view: the sign-in
 * window either never opens or opens on «403 disallowed_useragent». In the
 * week of 15–22.11.2026 a third of the visitors came from Threads, and every
 * one of them who reached «Зберегти оцінку» there tapped the Google button
 * several times (one of them 12 times) and lost the rating. So the sign-in
 * step has to recognise the place it is in and send the person to a real
 * browser first, with their answers.
 *
 * The user agents below were read off real visits (PostHog, 11.2026):
 *   Threads iOS   …Mobile/23G83 Barcelona 456.0.0.32.61 (iPhone18,1; iOS 26_6_1; …)
 *   Instagram     …Chrome/157.0.0.0 Mobile Safari/537.36 Instagram 455.0.0.51.72 Android (…)
 */
const APPS = [
  // Threads' in-app browser still carries its code name
  { name: 'Threads', re: /\bBarcelona\b/ },
  { name: 'Instagram', re: /\bInstagram\b/ },
  { name: 'Facebook', re: /\bFBAN\/|\bFBAV\/|\bFB_IAB\b|\bFBIOS\b/ },
  { name: 'TikTok', re: /\bmusical_ly\b|\bBytedanceWebview\b|\bTikTok\b/i },
  { name: 'LinkedIn', re: /\bLinkedInApp\b/ },
  { name: 'Snapchat', re: /\bSnapchat\b/ },
  { name: 'LINE', re: /\bLine\/\d/ },
];

const isIOS = (ua) => /\b(iPhone|iPad|iPod)\b/.test(ua);
const isAndroid = (ua) => /\bAndroid\b/.test(ua);

/**
 * { app, os } when this is an embedded browser Google will not sign in from,
 * otherwise null.
 *
 * Besides the named apps: any Android WebView (`; wv)`), and any iOS view
 * without the `Safari/` token. Safari, Chrome (CriOS), Firefox (FxiOS), Edge
 * and SFSafariViewController — which is what Telegram on iOS opens links in —
 * all carry it, and Google lets all of them sign in.
 */
export const detectInAppBrowser = (ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '') => {
  if (!ua) return null;
  const os = isIOS(ua) ? 'ios' : isAndroid(ua) ? 'android' : 'other';
  const named = APPS.find((a) => a.re.test(ua));
  if (named) return { app: named.name, os };
  if (os === 'android' && /;\s*wv\)/.test(ua)) return { app: null, os };
  if (os === 'ios' && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)) return { app: null, os };
  return null;
};

/**
 * A link that leaves the app for the system browser, or null where there is
 * no such thing (the page then explains the ⋯ menu instead).
 *
 * iOS: `x-safari-https://` is handed to Safari by iOS 17+ from inside Threads
 * and Instagram. Android: an intent with the default VIEW action opens the
 * default browser; `S.browser_fallback_url` keeps the same page if it cannot.
 */
export const externalBrowserUrl = (href, os) => {
  let url;
  try {
    url = new URL(href);
  } catch (e) {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const rest = `${url.host}${url.pathname}${url.search}${url.hash}`;
  if (os === 'ios') return `x-safari-https://${rest}`;
  if (os === 'android') {
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;action=android.intent.action.VIEW;`
      + `S.browser_fallback_url=${encodeURIComponent(href)};end`;
  }
  return null;
};
