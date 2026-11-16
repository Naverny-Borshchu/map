import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { GeoButton, geoFailure } from './GeoButton';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
const mockFilters = { updateCity: jest.fn(), updateCenter: jest.fn(), focusMap: jest.fn() };
jest.mock('../../context/FiltersContext', () => ({ useFilters: () => mockFilters }));
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => ({ places: [], cities: [] }) }));
// CRA's svg stand-in is built for an older React
jest.mock('./close.svg', () => ({ ReactComponent: () => null }));
jest.mock('../CitySelect/CitySelect', () => ({ CitySelect: () => <div data-testid="city-select" /> }));

/**
 * Tokyo, 11.2026, in the Threads browser: location denied without a word, and
 * on load a sheet that blocked the map, «Доступ до геолокації заблоковано…
 * (код: 1, дозвіл: denied)». Now the app's own ask fails quietly (a small hint
 * once per tab); the full explanation comes only from the button, and the
 * code and permission state go to analytics, never on screen.
 */

const deny = () => {
  const getCurrentPosition = jest.fn((ok, err) => err({ code: 1 }));
  Object.defineProperty(global.navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  Object.defineProperty(global.navigator, 'permissions', {
    value: { query: jest.fn(async () => ({ state: 'denied' })) }, configurable: true,
  });
  return getCurrentPosition;
};

const renderButton = () => render(<I18nProvider><GeoButton /></I18nProvider>);
const geoCalls = () => track.mock.calls.filter(([e]) => e === 'geo_failed').map(([, p]) => p);

let toasts;
const onToast = (e) => toasts.push(e.detail);
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('lang', 'uk');
  localStorage.setItem('nb-intro-done', '1');
  track.mockClear();
  toasts = [];
  window.addEventListener('nb:toast', onToast);
});
afterEach(() => window.removeEventListener('nb:toast', onToast));

test('denied on load: no sheet over the map, a small hint once per tab, the code in analytics only', async () => {
  const ask = deny();
  const { unmount } = renderButton();
  await waitFor(() => expect(toasts).toHaveLength(1));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('heading', { name: 'Доступ до геолокації заблоковано.' })).not.toBeInTheDocument();
  expect(toasts[0].message).toBe('Не бачимо, де ти. Обери місто вгорі або натисни стрілку праворуч угорі, щоб дозволити геодані.');
  expect(geoCalls()).toEqual([{ code: 1, permission: 'denied', auto: true, kind: 'denied' }]);
  expect(document.body.textContent).not.toMatch(/код|denied/);
  unmount();

  // the same tab, the map opened again: no second hint
  localStorage.removeItem('refusal');
  renderButton();
  await waitFor(() => expect(geoCalls()).toHaveLength(2));
  expect(toasts).toHaveLength(1);
});

test('denied after a tap on the button: the full explanation, no raw code', async () => {
  deny();
  localStorage.setItem('refusal', 'true'); // asked before: nothing on load
  const user = userEvent.setup();
  renderButton();
  expect(toasts).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Поруч' }));
  expect(await screen.findByRole('heading', { name: 'Доступ до геолокації заблоковано.' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Вибрати місто вручну' })).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\(код|дозвіл: denied|code: 1/);
  expect(geoCalls()).toEqual([expect.objectContaining({ code: 1, permission: 'denied', auto: false })]);
  await user.click(screen.getByRole('button', { name: 'Вибрати місто вручну' }));
  expect(screen.getByTestId('city-select')).toBeInTheDocument();
});

test('what each failure says, and whether it is a sheet', () => {
  expect(geoFailure({ code: 1, auto: true })).toMatchObject({ kind: 'denied', sheet: false });
  expect(geoFailure({ code: 1, auto: false, isMobile: true })).toMatchObject({ kind: 'denied', title: 'geo.blockedTitle', sub: 'geo.hintDeniedMobile', sheet: true });
  expect(geoFailure({ code: 3, auto: false })).toMatchObject({ kind: 'timeout', title: 'geo.failedTimeout' });
  expect(geoFailure({ code: 2, auto: false })).toMatchObject({ kind: 'unavailable' });
  expect(geoFailure({ code: null, permission: 'denied', auto: false })).toMatchObject({ kind: 'denied' });
});
