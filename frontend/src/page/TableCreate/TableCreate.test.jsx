import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { tablesAPI } from '../../api/tables';
import { TableCreate } from './TableCreate';
import { placesAPI } from '../../api';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api/tables', () => {
  const actual = jest.requireActual('../../api/tables');
  return { ...actual, tablesAPI: { create: jest.fn() } };
});
jest.mock('../../services/googleMaps', () => ({ useGoogleMaps: () => ({ isLoaded: true, loadError: undefined }) }));
jest.mock('../../components/GoogleAuth', () => ({
  GoogleAuth: () => <button type="button">Google test</button>,
}));

/**
 * The host sets a table up once: venue, the borshch on it (in serving order,
 * a new one typed in), price and weight, «Наосліп», an optional title. The API
 * is a mock: no table is created anywhere.
 */

const HERE = { latitude: 50.4501, longitude: 30.5234 };
const place = (id, name, lat, lng) => ({ id, name, latitude: lat, longitude: lng, location: { lat, lng }, city: 'Київ', address: `${name}, Київ` });
const PLACES = [
  place('p-vatra', 'Ватра', 50.4505, 30.5236),
  place('p-puzata', 'Пузата хата', 50.4511, 30.5234),
];
const borsch = (id, placeId, name, extra = {}) => ({ id_borsch: id, place_id: placeId, name, rating_count: 2, price: '', weight: '', ...extra });
const BORSCH = [
  borsch('b-vatra', 'p-vatra', 'Борщ український', { price: '≈185 ₴', weight: '350 g.' }),
  borsch('b-puz1', 'p-puzata', 'Борщ червоний'),
  borsch('b-puz2', 'p-puzata', 'Борщ зелений'),
];
const mockPlaces = { allPlaces: PLACES, loading: false, getPlaceById: (id) => PLACES.find((p) => p.id === id) };
const mockBorsch = { borsch: BORSCH, loading: false, getBorschById: (id) => BORSCH.find((b) => b.id_borsch === id) };
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => mockPlaces }));
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
};

const renderCreate = (path = '/table/new?from=chooser') =>
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/table/new" element={<TableCreate />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'host-access');
  localStorage.setItem('refresh', 'host-refresh');
  localStorage.setItem('user', JSON.stringify({ id: 7, given_name: 'Андрій' }));
};

const calls = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  track.mockClear();
  tablesAPI.create.mockReset();
  Object.defineProperty(global.navigator, 'geolocation', {
    value: { getCurrentPosition: (ok) => ok({ coords: HERE }) },
    configurable: true,
  });
});

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 5));
});

describe('setting up a table', () => {
  it('venue, two borshch in order with a new one, facts checked, blind, title: one POST and the QR screen', async () => {
    signIn();
    tablesAPI.create.mockResolvedValue({ code: 'K7M2QX' });
    const user = userEvent.setup();
    renderCreate();

    expect(await screen.findByRole('heading', { name: 'Ти зараз тут?' })).toBeInTheDocument();
    await user.click(screen.getByText('Ватра').closest('button'));

    // the venue's only borshch is on the table already, as №1
    expect(screen.getByRole('heading', { name: 'Які Борщі дегустуємо?' })).toBeInTheDocument();
    const only = screen.getByRole('button', { name: /Борщ український/ });
    expect(only).toHaveAttribute('aria-pressed', 'true');
    expect(only).toHaveTextContent('№1');

    // a new borshch, typed in; the same name twice is refused
    const field = screen.getByLabelText('Іншого Борщу нема в списку? Впиши назву');
    await user.type(field, 'борщ УКРАЇНСЬКИЙ');
    await user.click(screen.getByRole('button', { name: 'Додати' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Цей Борщ уже є в дегустації.');
    await user.clear(field);
    await user.type(field, 'Борщ з чорносливом{Enter}');
    expect(screen.getByText('Борщ з чорносливом').closest('div')).toHaveTextContent('№2');
    await user.click(screen.getByRole('button', { name: 'Далі' }));

    // price and weight: once, for everybody; a typo stops the way on
    expect(screen.getByRole('heading', { name: 'Ціна й грамовка' })).toBeInTheDocument();
    expect(screen.getByText('На картці зараз: 185 грн, 350 г')).toBeInTheDocument();
    const [firstItem, secondItem] = screen.getAllByRole('listitem');
    await user.type(within(secondItem).getByLabelText(/^Порція/), '35');
    expect(screen.getByRole('alert')).toHaveTextContent('Порція має бути від 50 до 2000 г.');
    expect(screen.getByRole('button', { name: 'Далі' })).toBeDisabled();
    await user.type(within(secondItem).getByLabelText(/^Порція/), '0');
    await user.type(within(secondItem).getByLabelText(/^Ціна/), '210');
    expect(within(firstItem).getByLabelText(/^Ціна/)).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Далі' }));

    // «Наосліп» and a title
    const blind = screen.getByRole('switch', { name: /Наосліп/ });
    expect(blind).toHaveAttribute('aria-checked', 'false');
    await user.click(blind);
    expect(blind).toHaveAttribute('aria-checked', 'true');
    await user.type(screen.getByLabelText('Назва дегустації, якщо хочеш'), 'День Борщу');
    await user.click(screen.getByRole('button', { name: 'Створити дегустацію' }));

    expect(tablesAPI.create).toHaveBeenCalledWith({
      place: 'p-vatra',
      blind: true,
      title: 'День Борщу',
      borsches: [
        { id: 'b-vatra' },
        { name: 'Борщ з чорносливом', price_uah: 210, weight_grams: 350 },
      ],
    }, { entry: 'chooser' });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/K7M2QX'));
    expect(calls('flow_step').map((p) => p.step)).toEqual(['venue', 'borsch', 'facts', 'settings']);
    expect(calls('flow_exit')).toEqual([]);
  });

  it('cannot go on without a borshch on the table', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click((await screen.findByText('Пузата хата')).closest('button'));
    // two borshch at this venue: none is chosen for the host
    expect(screen.getByRole('button', { name: 'Далі' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Борщ зелений/ }));
    await user.click(screen.getByRole('button', { name: /Борщ червоний/ }));
    // the order of the taps is the order on the table
    expect(screen.getByRole('button', { name: /Борщ зелений/ })).toHaveTextContent('№1');
    expect(screen.getByRole('button', { name: /Борщ червоний/ })).toHaveTextContent('№2');
    expect(screen.getByRole('button', { name: 'Далі' })).toBeEnabled();
  });

  it('asks a host who is not signed in to sign in on the last screen, not before', async () => {
    const user = userEvent.setup();
    renderCreate('/table/new?borsch=b-puz2&from=card');
    // from a borshch card: venue and borshch are set
    expect(await screen.findByRole('heading', { name: 'Які Борщі дегустуємо?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Борщ зелений/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    expect(screen.getByText('Дегустація належить тому, хто її влаштовує. Увійди, і створимо.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google test' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Створити дегустацію' })).toBeDisabled();
    expect(tablesAPI.create).not.toHaveBeenCalled();
  });
});


describe('stage 3', () => {
  afterEach(() => {
    delete window.google;
    jest.restoreAllMocks();
  });

  it('a venue from Google is created on «Створити» with its Place ID; a new borshch gets its meat type', async () => {
    signIn();
    const createPlace = jest.spyOn(placesAPI, 'create').mockResolvedValue({ id: 'p-new', reused: false });
    tablesAPI.create.mockResolvedValue({ code: 'P4RT9Z' });
    window.google = {
      maps: {
        places: {
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: jest.fn(async () => ({
              suggestions: [{
                placePrediction: {
                  placeId: 'g-new', mainText: { text: 'Криївка' }, secondaryText: { text: 'Київ' }, types: ['restaurant'],
                  toPlace: () => ({
                    id: 'g-new', displayName: 'Криївка', formattedAddress: 'вул. Хрещатик, 1, Київ',
                    addressComponents: [{ longText: 'Київ', types: ['locality'] }, { longText: 'Україна', types: ['country'] }],
                    location: { lat: () => 50.4472, lng: () => 30.5222 },
                    fetchFields: async () => {},
                  }),
                },
              }],
            })),
          },
        },
      },
    };
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole('button', { name: 'Закладу нема в списку' }));
    await user.type(screen.getByTestId('google-place-search'), 'Крив');
    await user.click(await screen.findByRole('button', { name: /Криївка/ }, { timeout: 2000 }));
    // nothing of ours at a new venue: the borshch is typed in
    await user.type(screen.getByLabelText('Іншого Борщу нема в списку? Впиши назву'), 'Борщ з квасолею{Enter}');
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    const meat = screen.getByRole('group', { name: 'Мʼясо в «Борщ з квасолею»' });
    await user.click(within(meat).getByRole('button', { name: 'Свинина' }));
    expect(within(meat).getByRole('button', { name: 'Свинина' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    await user.click(screen.getByRole('button', { name: 'Створити дегустацію' }));

    await waitFor(() => expect(tablesAPI.create).toHaveBeenCalledWith({
      place: 'p-new',
      blind: false,
      title: '',
      borsches: [{ name: 'Борщ з квасолею', type_meat: 'pork' }],
    }, { entry: 'chooser', new_place: true }));
    expect(createPlace).toHaveBeenCalledWith(expect.objectContaining({ name: 'Криївка', google_place_id: 'g-new', via: 'table' }));
    // the photo is asked once the table is closed, on this device
    expect(JSON.parse(localStorage.getItem('nb:table-host:P4RT9Z'))).toMatchObject({ newNames: ['Борщ з квасолею'], prompted: false });
    expect(calls('flow_step').map((p) => p.step)).toEqual(['venue', 'venue_google', 'borsch', 'facts', 'settings']);
  });

  it('a borshch the venue already has gets no meat chips: only a new one can be given a type', async () => {
    signIn();
    const user = userEvent.setup();
    renderCreate();
    await user.click((await screen.findByText('Ватра')).closest('button'));
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    expect(screen.queryByRole('group', { name: /Мʼясо/ })).not.toBeInTheDocument();
  });
});

// abroad (11.2026): the tasting's venue from Google, picked in the list itself
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

describe('abroad', () => {
  afterEach(() => {
    delete window.google;
    jest.restoreAllMocks();
  });

  it('a venue from Google inline is created on «Створити», in English, Tokyo as its city', async () => {
    signIn();
    const createPlace = jest.spyOn(placesAPI, 'create').mockResolvedValue({ id: 'p-new', reused: false });
    tablesAPI.create.mockResolvedValue({ code: 'P4RT9Z' });
    japanGoogle();
    const user = userEvent.setup();
    renderCreate();
    await user.type(await screen.findByRole('searchbox'), 'Ichiran');
    const block = await screen.findByTestId('google-inline');
    await user.click(within(block).getByRole('button', { name: /ICHIRAN Shibuya/ }));
    await user.type(await screen.findByLabelText('Іншого Борщу нема в списку? Впиши назву'), 'Борщ{Enter}');
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    const meat = screen.getByRole('group', { name: 'Мʼясо в «Борщ»' });
    await user.click(within(meat).getByRole('button', { name: 'Свинина' }));
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    await user.click(screen.getByRole('button', { name: 'Створити дегустацію' }));
    await waitFor(() => expect(tablesAPI.create).toHaveBeenCalled());
    expect(createPlace).toHaveBeenCalledWith(expect.objectContaining({
      name: 'ICHIRAN Shibuya', city: 'Tokyo', country: 'Japan', google_place_id: 'g-ichiran',
    }));
  });
});
