import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { fetchVenueSuggestions } from '../../services/googlePlaces';
import { Autocomplete } from './Autocomplete';

/**
 * The add flow's search on the map. The Maps script speaks the browser's
 * language, and in Ukrainian Google names much of the world with Russian forms
 * (Yokohama spelt the Russian way, Tokyo 11.2026). Such a line is shown in English
 * instead, and not at all until the English twin is there.
 */

const mockSuggestions = { status: 'OK', data: [] };
jest.mock('use-places-autocomplete', () => ({
  __esModule: true,
  default: () => ({
    ready: true,
    value: 'ramen',
    suggestions: mockSuggestions,
    setValue: jest.fn(),
    init: jest.fn(),
    clearSuggestions: jest.fn(),
  }),
  getGeocode: jest.fn(),
  getLatLng: jest.fn(),
}));
jest.mock('react-cool-onclickoutside', () => () => ({ current: null }));
jest.mock('../../services/googlePlaces', () => ({
  ...jest.requireActual('../../services/googlePlaces'),
  fetchVenueSuggestions: jest.fn(),
}));

const line = (place_id, main, secondary) => ({ place_id, description: `${main}, ${secondary}`, types: ['restaurant'], structured_formatting: { main_text: main, secondary_text: secondary } });

beforeEach(() => localStorage.setItem('lang', 'uk'));

test('a Cyrillic line about a place abroad is shown in English; a Ukrainian one as it is', async () => {
  mockSuggestions.data = [
    line('g-jp', 'Musée du Rāmen de Shin-Yokohama', '2 Chome-14-21 Синъёкохама, Kohoku Ward, Иокогама, Префектура Канаґава, Японія'), // lang-check: allow
    line('g-ua', 'Пузата Хата', 'Вокзальна площа, Київ, Україна'),
  ];
  fetchVenueSuggestions.mockResolvedValue([
    { placeId: 'g-jp', main: 'Shin-Yokohama Ramen Museum', secondary: 'Shinyokohama, Kohoku Ward, Yokohama, Kanagawa, Japan' },
  ]);
  render(<I18nProvider><Autocomplete isLoaded onSelect={() => {}} onPickPlace={() => {}} center={{ lat: 50.45, lng: 30.52 }} /></I18nProvider>);

  // until the twin is here, the Russian line is not on screen
  expect(screen.queryByText(/Иокогама/)).not.toBeInTheDocument(); // lang-check: allow
  expect(screen.getByText('Пузата Хата')).toBeInTheDocument();
  expect(await screen.findByText('Shin-Yokohama Ramen Museum')).toBeInTheDocument();
  expect(screen.getByText('Shinyokohama, Kohoku Ward, Yokohama, Kanagawa, Japan')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/Синъёкохама|Иокогама/); // lang-check: allow
  expect(fetchVenueSuggestions).toHaveBeenCalledWith('ramen', expect.objectContaining({ language: 'en', kind: 'any' }));
});

test('nothing abroad in Cyrillic: Google is not asked again', async () => {
  mockSuggestions.data = [line('g-ua', 'Пузата Хата', 'Вокзальна площа, Київ, Україна'), line('g-de', 'Slava', 'Berlin, Germany')];
  fetchVenueSuggestions.mockClear();
  render(<I18nProvider><Autocomplete isLoaded onSelect={() => {}} onPickPlace={() => {}} center={null} /></I18nProvider>);
  await waitFor(() => expect(screen.getByText('Slava')).toBeInTheDocument());
  expect(fetchVenueSuggestions).not.toHaveBeenCalled();
});
