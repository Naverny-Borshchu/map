import { getLanguage } from './index';

/**
 * Мова, якої ми не маємо (de, pl, fr…), раніше падала в українську, бо фолбеком
 * був DEFAULT_LANG. Заміряно на проді до фіксу: en-* — англійська, de-DE /
 * pl-PL / fr-FR — українська. Лендінг при цьому вже вів таких відвідувачів на
 * /en/, тож розрив був рівно посередині шляху.
 */
const withLocale = (value, fn) => {
  const nav = Object.getOwnPropertyDescriptor(window.navigator, 'language');
  Object.defineProperty(window.navigator, 'language', { value, configurable: true });
  try {
    return fn();
  } finally {
    if (nav) Object.defineProperty(window.navigator, 'language', nav);
  }
};

beforeEach(() => localStorage.clear());

test('мова, яку ми возимо, береться як є', () => {
  expect(withLocale('en-US', getLanguage)).toBe('en');
  expect(withLocale('uk-UA', getLanguage)).toBe('uk');
});

test('мова, якої ми не возимо, веде на англійську, а не на українську', () => {
  expect(withLocale('de-DE', getLanguage)).toBe('en');
  expect(withLocale('pl-PL', getLanguage)).toBe('en');
  expect(withLocale('fr-FR', getLanguage)).toBe('en');
  expect(withLocale('es-419', getLanguage)).toBe('en');
});

test('російська й білоруська лишаються на українській', () => {
  expect(withLocale('ru-RU', getLanguage)).toBe('uk');
  expect(withLocale('be-BY', getLanguage)).toBe('uk');
});

test('збережений вибір сильніший за мову браузера в обидва боки', () => {
  localStorage.setItem('lang', 'uk');
  expect(withLocale('de-DE', getLanguage)).toBe('uk');
  localStorage.setItem('lang', 'en');
  expect(withLocale('uk-UA', getLanguage)).toBe('en');
});

test('порожній navigator.language лишає мову за замовчуванням', () => {
  expect(withLocale('', getLanguage)).toBe('uk');
});

test('сміття в localStorage ігнорується, а не ламає вибір', () => {
  localStorage.setItem('lang', 'klingon');
  expect(withLocale('de-DE', getLanguage)).toBe('en');
});

/**
 * The borsch page printed a hardcoded English "Reviews" next to the count —
 * on the screen people land on from the map, to Ukrainian readers. Ukrainian
 * needs three forms, so a bare key would have read "3 відгуків".
 */
describe('review count reads correctly in Ukrainian', () => {
  const t = (lang, count) => {
    const { translations } = require('./translations');
    const dict = translations[lang];
    const key = 'card.reviewCount';
    const n = Math.abs(count) % 100, n1 = n % 10;
    let lookup = key;
    if (count === 1 && dict[`${key}_one`]) lookup = `${key}_one`;
    else if (lang === 'uk' && n1 >= 2 && n1 <= 4 && (n < 12 || n > 14) && dict[`${key}_few`]) lookup = `${key}_few`;
    return String(dict[lookup] ?? dict[key]).replace('{count}', String(count));
  };

  it.each([[1, '1 відгук'], [3, '3 відгуки'], [5, '5 відгуків'], [11, '11 відгуків'], [22, '22 відгуки']])(
    'uk: %i → %s', (n, want) => expect(t('uk', n)).toBe(want),
  );

  it.each([[1, '1 review'], [3, '3 reviews']])('en: %i → %s', (n, want) => expect(t('en', n)).toBe(want));

  it('no longer leaves the label untranslated', () => {
    const { translations } = require('./translations');
    expect(translations.uk['card.reviewCount']).not.toMatch(/review/i);
  });
});
