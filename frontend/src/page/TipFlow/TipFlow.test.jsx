import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { tipsAPI } from '../../api/tips';
import { googleAuth } from '../../services/googleAuth';
import { TipFlow } from './TipFlow';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api/tips', () => {
  const actual = jest.requireActual('../../api/tips');
  return { ...actual, tipsAPI: { create: jest.fn() } };
});
jest.mock('../../components/GoogleAuth', () => ({
  GoogleAuth: ({ onSuccess }) => <button type="button" onClick={() => onSuccess({ credential: 'cred' })}>Google test</button>,
}));
jest.mock('../../services/googleAuth', () => ({ ...jest.requireActual('../../services/googleAuth'), googleAuth: jest.fn() }));
jest.mock('../../services/googleMaps', () => ({ useGoogleMaps: () => ({ isLoaded: true, loadError: undefined }) }));

/**
 * «Я знаю, тут є Борщ»: a venue, a note if you like, the account at the end.
 * The API is a mock: no tip is created anywhere.
 */

const HERE = { latitude: 50.4501, longitude: 30.5234 };
const place = (id, name, lat, lng) => ({ id, name, latitude: lat, longitude: lng, city: 'Київ', address: `${name}, Київ` });
const PLACES = [
  place('p-vatra', 'Ватра', 50.4505, 30.5236),
  place('p-khata', 'Хата', 50.4511, 30.5234),
];
const BORSCH = [{ id_borsch: 'b-vatra', place_id: 'p-vatra', name: 'Борщ український', rating_count: 3 }];
const mockPlaces = { allPlaces: PLACES, loading: false, getPlaceById: (id) => PLACES.find((p) => p.id === id), selectPlace: jest.fn() };
const mockBorsch = { borsch: BORSCH, loading: false };
const mockFilters = { focusMap: jest.fn() };
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => mockPlaces }));
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));
jest.mock('../../context/FiltersContext', () => ({ useFilters: () => mockFilters }));

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where" data-state={JSON.stringify(loc.state || null)}>{loc.pathname + loc.search}</p>;
};

const renderTip = (path = '/tip/new?from=chooser') =>
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/tip/new" element={<TipFlow />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a-token');
  localStorage.setItem('refresh', 'r-token');
  localStorage.setItem('user', JSON.stringify({ id: 7, given_name: 'Оля' }));
};
const calls = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);
const created = (extra = {}) => ({ id: 't1', status: 'open', reused: false, is_author: true, place: { id: 'p-khata', name: 'Хата', latitude: 50.4511, longitude: 30.5234 }, ...extra });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  track.mockClear();
  tipsAPI.create.mockReset();
  googleAuth.mockReset();
  mockFilters.focusMap.mockClear();
  Object.defineProperty(global.navigator, 'geolocation', {
    value: { getCurrentPosition: (ok) => ok({ coords: HERE }) },
    configurable: true,
  });
});

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 5));
});

test('a venue near, a note, and the tip goes; the done screen offers the bowl right there', async () => {
  signIn();
  tipsAPI.create.mockResolvedValue(created());
  const user = userEvent.setup();
  renderTip();
  expect(await screen.findByRole('heading', { name: 'Ти зараз тут?' })).toBeInTheDocument();
  await user.click(screen.getByText('Хата').closest('button'));
  expect(screen.getByRole('heading', { name: 'Щось підказати?' })).toBeInTheDocument();
  await user.type(screen.getByRole('textbox'), 'Борщ у меню щодня');
  expect(screen.getByText('17 з 140')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Тут є Борщ' }));

  await screen.findByRole('heading', { name: 'Дякуємо!' });
  expect(tipsAPI.create).toHaveBeenCalledWith({ place: 'p-khata', note: 'Борщ у меню щодня' }, { from: 'chooser' });
  expect(screen.getByText('Сіра миска вже на мапі. Перша оцінка зробить її справжньою міткою.')).toBeInTheDocument();
  expect(calls('flow_step').map((p) => p.step)).toEqual(['venue', 'note', 'done']);

  await user.click(screen.getByRole('button', { name: 'Мені принесли цей Борщ' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/bowl/new?place=p-khata&tip=t1&from=tip');
});

test('the account comes last: the Google button, then the tip goes by itself', async () => {
  tipsAPI.create.mockResolvedValue(created());
  googleAuth.mockResolvedValue({ access: 'new-access', refresh: 'new-refresh', user: { id: 9, given_name: 'Іра' } });
  const user = userEvent.setup();
  renderTip();
  await user.click((await screen.findByText('Хата')).closest('button'));
  await user.click(screen.getByRole('button', { name: 'Тут є Борщ' }));
  expect(screen.getByRole('heading', { name: 'Підкажемо від твого імені?' })).toBeInTheDocument();
  expect(tipsAPI.create).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Google test' }));
  await screen.findByRole('heading', { name: 'Дякуємо!' });
  expect(tipsAPI.create).toHaveBeenCalledTimes(1);
});

test('a venue whose borshch is rated already opens that borshch instead', async () => {
  const user = userEvent.setup();
  renderTip();
  await user.click((await screen.findByText('Ватра')).closest('button'));
  expect(screen.getByRole('heading', { name: 'Тут Борщ уже оцінили' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Відкрити Борщ' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/borsch/b-vatra');
  expect(tipsAPI.create).not.toHaveBeenCalled();
});

test('409 already_rated from the API leads to the venue as well', async () => {
  signIn();
  const conflict = Object.assign(new Error('rated'), { status: 409, code: 'already_rated', data: { place: 'p-khata' } });
  tipsAPI.create.mockRejectedValue(conflict);
  const user = userEvent.setup();
  renderTip();
  await user.click((await screen.findByText('Хата')).closest('button'));
  await user.click(screen.getByRole('button', { name: 'Тут є Борщ' }));
  expect(await screen.findByRole('heading', { name: 'Тут Борщ уже оцінили' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Показати на мапі' }));
  expect(mockPlaces.selectPlace).toHaveBeenCalledWith('p-khata');
  expect(mockFilters.focusMap).toHaveBeenCalledWith(50.4511, 30.5234, 16);
  expect(screen.getByTestId('where')).toHaveTextContent('/');
});

test('a note with a link is stopped on the device', async () => {
  signIn();
  const user = userEvent.setup();
  renderTip();
  await user.click((await screen.findByText('Хата')).closest('button'));
  await user.type(screen.getByRole('textbox'), 'меню на https://example.com');
  await user.click(screen.getByRole('button', { name: 'Тут є Борщ' }));
  expect(screen.getByText('Без посилань, будь ласка.')).toBeInTheDocument();
  expect(tipsAPI.create).not.toHaveBeenCalled();
});

test('a second «Тут є Борщ» at the same venue counts as a «так, є»', async () => {
  signIn();
  tipsAPI.create.mockResolvedValue(created({ reused: true, is_author: false, status: 'confirmed' }));
  const user = userEvent.setup();
  renderTip();
  await user.click((await screen.findByText('Хата')).closest('button'));
  await user.click(screen.getByRole('button', { name: 'Тут є Борщ' }));
  expect(await screen.findByText('Тут уже була підказка, і твій голос її підтвердив.')).toBeInTheDocument();
});

test('from a venue: the venue is set, the note is the first screen', async () => {
  signIn();
  renderTip('/tip/new?place=p-khata&from=venue');
  expect(await screen.findByRole('heading', { name: 'Щось підказати?' })).toBeInTheDocument();
  expect(screen.getByText('Хата')).toBeInTheDocument();
  expect(calls('flow_step')[0]).toMatchObject({ flow: 'tip', step: 'note', entry: 'venue' });
});

test('a venue from Google goes as new_place', async () => {
  signIn();
  tipsAPI.create.mockResolvedValue(created({ place: { id: 'p-new', name: 'Криївка', latitude: 49.84, longitude: 24.03 } }));
  window.google = {
    maps: {
      places: {
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: jest.fn(async () => ({
            suggestions: [{
              placePrediction: {
                placeId: 'g-new', mainText: { text: 'Криївка' }, secondaryText: { text: 'Львів' }, types: ['restaurant'],
                toPlace: () => ({
                  id: 'g-new', displayName: 'Криївка', formattedAddress: 'пл. Ринок, 14, Львів',
                  addressComponents: [{ longText: 'Львів', types: ['locality'] }, { longText: 'Україна', types: ['country'] }],
                  location: { lat: () => 49.8419, lng: () => 24.0322 },
                  fetchFields: async () => {},
                }),
              },
            }],
          })),
        },
      },
    },
  };
  try {
    const user = userEvent.setup();
    renderTip();
    await user.click(await screen.findByRole('button', { name: 'Закладу нема в списку' }));
    await user.type(screen.getByTestId('google-place-search'), 'Крив');
    await user.click(await screen.findByRole('button', { name: /Криївка/ }, { timeout: 2000 }));
    await user.click(screen.getByRole('button', { name: 'Тут є Борщ' }));
    await waitFor(() => expect(tipsAPI.create).toHaveBeenCalledWith({
      newPlace: {
        name: 'Криївка', address: 'пл. Ринок, 14, Львів', city: 'Львів', country: 'Україна',
        location_lat: 49.8419, location_lng: 24.0322, google_place_id: 'g-new',
      },
      note: '',
    }, { from: 'chooser' }));
  } finally {
    delete window.google;
  }
});

// abroad (11.2026): our map has no such venue, Google's is picked in the list
const japanGoogle = () => {
  const ichiran = {
    id: 'g-ichiran',
    displayName: 'ICHIRAN Shibuya',
    formattedAddress: 'Japan, 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme−22−７',
    addressComponents: [
      { longText: 'Shibuya', types: ['locality'] },
      { longText: 'Tokyo', types: ['administrative_area_level_1'] },
      { longText: 'Japan', shortText: 'JP', types: ['country'] },
    ],
    location: { lat: () => 35.6618, lng: () => 139.7042 },
    fetchFields: async () => {},
  };
  window.google = {
    maps: {
      places: {
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: jest.fn(async () => ({
            suggestions: [{
              placePrediction: {
                placeId: 'g-ichiran', mainText: { text: 'ICHIRAN Shibuya' }, secondaryText: { text: 'Jinnan, Shibuya, Tokyo, Japan' },
                types: ['restaurant'], toPlace: () => ichiran,
              },
            }],
          })),
        },
        Place: function Place() { return ichiran; },
      },
    },
  };
};

test('abroad: a venue from Google inline in the list goes as new_place, in English, Tokyo as its city', async () => {
  signIn();
  tipsAPI.create.mockResolvedValue(created({ place: { id: 'p-new', name: 'ICHIRAN Shibuya', latitude: 35.66, longitude: 139.7 } }));
  japanGoogle();
  try {
    const user = userEvent.setup();
    renderTip();
    await user.type(await screen.findByRole('searchbox'), 'Ichiran');
    const block = await screen.findByTestId('google-inline');
    await user.click(within(block).getByRole('button', { name: /ICHIRAN Shibuya/ }));
    await user.click(await screen.findByRole('button', { name: 'Тут є Борщ' }));
    await waitFor(() => expect(tipsAPI.create).toHaveBeenCalledWith({
      newPlace: {
        name: 'ICHIRAN Shibuya', address: 'Japan, 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme−22−７', city: 'Tokyo', country: 'Japan',
        location_lat: 35.6618, location_lng: 139.7042, google_place_id: 'g-ichiran',
      },
      note: '',
    }, { from: 'chooser' }));
  } finally {
    delete window.google;
  }
});
