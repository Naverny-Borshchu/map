import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { CitySelect, ownCity } from './CitySelect';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
// CRA's svg stand-in is built for an older React
jest.mock('./search.svg', () => ({ ReactComponent: () => null }));
jest.mock('./searchGray.svg', () => ({ ReactComponent: () => null }));
jest.mock('../../services/googleMaps', () => ({ useGoogleMaps: () => ({ isLoaded: true, loadError: undefined }) }));

const CITIES = [
  { city: 'Київ', lat: 50.44, lng: 30.43, borsch_count: 98 },
  { city: 'Львів', lat: 49.83, lng: 24.02, borsch_count: 13 },
  { city: 'Берлін', lat: 52.51, lng: 13.42, borsch_count: 2 },
];
const mockPlaces = { cities: CITIES };
const mockFilters = { city: 'Київ', focusMap: jest.fn(), updateCity: jest.fn(), resetAllFilters: jest.fn() };
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => mockPlaces }));
jest.mock('../../context/FiltersContext', () => ({ useFilters: () => mockFilters }));

/**
 * The city menu knew only the cities that already have a borshch, so a person
 * in Tokyo with location denied was stuck on Kyiv (11.2026). Typing now
 * filters ours and, under them, finds any city with Google.
 */

const mockGoogle = (cities) => {
  const fetchAutocompleteSuggestions = jest.fn(async () => ({
    suggestions: cities.map((c) => ({
      placePrediction: { placeId: c.id, mainText: { text: c.main }, secondaryText: { text: c.secondary }, types: ['locality'] },
    })),
  }));
  function Place({ id, requestedLanguage }) {
    const c = cities.find((x) => x.id === id);
    return {
      id,
      displayName: c.names[requestedLanguage] || c.main,
      addressComponents: [{ longText: c.country, shortText: c.code, types: ['country'] }],
      location: { lat: () => c.lat, lng: () => c.lng },
      fetchFields: jest.fn(async () => {}),
    };
  }
  window.google = { maps: { places: { AutocompleteSessionToken: function Token() {}, AutocompleteSuggestion: { fetchAutocompleteSuggestions }, Place } } };
  return fetchAutocompleteSuggestions;
};

const TOKYO = { id: 'c-tokyo', main: 'Tokyo', secondary: 'Japan', names: { uk: 'Токіо', en: 'Tokyo' }, country: 'Japan', code: 'JP', lat: 35.6764, lng: 139.65 };
const BERLIN = { id: 'c-berlin', main: 'Berlin', secondary: 'Germany', names: { uk: 'Берлін', en: 'Berlin' }, country: 'Germany', code: 'DE', lat: 52.52, lng: 13.405 };

const renderMenu = (onClose = jest.fn()) => {
  render(<I18nProvider><MemoryRouter><CitySelect onClose={onClose} /></MemoryRouter></I18nProvider>);
  return onClose;
};

beforeEach(() => {
  localStorage.setItem('lang', 'uk');
  Object.values(mockFilters).forEach((f) => typeof f === 'function' && f.mockClear());
  track.mockClear();
});
afterEach(() => { delete window.google; });

test('a city from Google moves the map there and becomes the city', async () => {
  mockGoogle([TOKYO]);
  const user = userEvent.setup();
  const onClose = renderMenu();
  await user.type(screen.getByTestId('city-search'), 'Tokyo');
  const section = (await screen.findByRole('heading', { name: 'Інші міста, за Google' })).closest('section');
  await user.click(within(section).getByRole('button', { name: /Tokyo/ }));
  await waitFor(() => expect(mockFilters.updateCity).toHaveBeenCalledWith('Tokyo'));
  // asked in Ukrainian first, then in English because it is abroad
  expect(mockFilters.focusMap).toHaveBeenCalledWith(35.6764, 139.65, 12);
  expect(onClose).toHaveBeenCalled();
  expect(track).toHaveBeenCalledWith('city_google_picked', { own: false, country: 'JP' });
});

test('typing filters our own cities first, by name or English label', async () => {
  mockGoogle([]);
  const user = userEvent.setup();
  renderMenu();
  await user.type(screen.getByTestId('city-search'), 'lvi');
  expect(screen.getByRole('heading', { name: 'На нашій мапі' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Львів' }));
  expect(mockFilters.updateCity).toHaveBeenCalledWith('Львів');
  expect(mockFilters.focusMap).toHaveBeenCalledWith(49.839684, 24.029716, 12);
});

test('Google offering a city of ours: it is not listed twice, and Enter takes ours', async () => {
  mockGoogle([BERLIN]);
  const user = userEvent.setup();
  renderMenu();
  await user.type(screen.getByTestId('city-search'), 'Berlin');
  expect(screen.getByRole('button', { name: 'Берлін' })).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 400));
  expect(screen.queryByRole('heading', { name: 'Інші міста, за Google' })).not.toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(mockFilters.updateCity).toHaveBeenCalledWith('Берлін');
});

test('no such city anywhere: said so', async () => {
  mockGoogle([]);
  const user = userEvent.setup();
  renderMenu();
  await user.type(screen.getByTestId('city-search'), 'Qwzx');
  expect(await screen.findByText('Такого міста не знайшли. Спробуй іншу назву.')).toBeInTheDocument();
});

test('ownCity answers to the stored name and to the labels', () => {
  expect(ownCity(CITIES, 'kyiv')).toBe(CITIES[0]);
  expect(ownCity(CITIES, ' Берлін ')).toBe(CITIES[2]);
  expect(ownCity(CITIES, 'Tokyo')).toBeNull();
});
