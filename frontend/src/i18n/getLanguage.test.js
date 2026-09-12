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
