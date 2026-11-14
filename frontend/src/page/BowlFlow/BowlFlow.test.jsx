import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { listDrafts, loadDraftPhotos } from '../../services/bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from '../../services/bowlPhotoStore';
import { BowlFlow } from './BowlFlow';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/**
 * Moment 1 of a bowl: which venue (the nearest three, then search), which
 * borshch, a photo now or later, and done. No account, no map.
 */

const HERE = { latitude: 50.4501, longitude: 30.5234 };
const place = (id, name, lat, lng) => ({ id, name, latitude: lat, longitude: lng, city: 'Київ', address: `${name}, Київ` });
const PLACES = [
  place('p-far', 'Далекий', 50.4501, 30.5834),
  place('p-puzata', 'Пузата хата', 50.4511, 30.5234),   // ~110 m
  place('p-vatra', 'Ватра', 50.4505, 30.5236),          // ~50 m
  place('p-khata', 'Хата', 50.4521, 30.5234),           // ~220 m
  place('p-kafe', 'Кафе', 50.4531, 30.5234),            // ~330 m
];
const borsch = (id, placeId, name, extra = {}) => ({ id_borsch: id, place_id: placeId, name, rating_count: 2, ...extra });
const BORSCH = [
  borsch('b-vatra', 'p-vatra', 'Борщ український'),
  borsch('b-puz1', 'p-puzata', 'Борщ червоний'),
  borsch('b-puz2', 'p-puzata', 'Борщ зелений', { rating_count: 0 }),
  borsch('b-kafe', 'p-kafe', 'Борщ'),
];

const mockPlaces = {
  allPlaces: PLACES,
  loading: false,
  getPlaceById: (id) => PLACES.find((p) => p.id === id),
};
const mockBorsch = {
  borsch: BORSCH,
  loading: false,
  getBorschById: (id) => BORSCH.find((b) => b.id_borsch === id),
};
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => mockPlaces }));
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where" data-state={JSON.stringify(loc.state || null)}>{loc.pathname + loc.search}</p>;
};

const renderFlow = (path = '/bowl/new?from=chooser') =>
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/bowl/new" element={<BowlFlow />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );

const geo = (mode) => {
  const getCurrentPosition = jest.fn((ok, err) => {
    if (mode === 'ok') ok({ coords: HERE });
    else err({ code: mode === 'denied' ? 1 : 2 });
  });
  Object.defineProperty(global.navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
};

const calls = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);
const venueButtons = () => screen.getAllByRole('button').filter((b) => /Київ/.test(b.textContent));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  setPhotoStoreForTests(createMemoryPhotoStore());
  track.mockClear();
  // jsdom has no object URLs; the thumbnails only need a string
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
});

// unmount here and let the delayed exit check run inside this test
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 5));
});

describe('«Ти зараз тут?»', () => {
  it('shows the three nearest venues, nearest first, with the distance', async () => {
    geo('ok');
    renderFlow();
    expect(await screen.findByRole('heading', { name: 'Ти зараз тут?' })).toBeInTheDocument();
    const cards = venueButtons();
    expect(cards.map((c) => within(c).getByText(/^(Ватра|Пузата хата|Хата|Кафе|Далекий)$/).textContent))
      .toEqual(['Ватра', 'Пузата хата', 'Хата']);
    expect(cards[0]).toHaveTextContent('50 м');
    expect(calls('flow_step')[0]).toEqual({ flow: 'bowl', step: 'venue', index: 0, total: 4, entry: 'chooser' });
  });

  it('goes straight to search when location is refused, with no modal', async () => {
    geo('denied');
    const user = userEvent.setup();
    renderFlow();
    expect(await screen.findByRole('heading', { name: 'Де ти їси Борщ?' })).toBeInTheDocument();
    expect(screen.getByText('Геолокацію не дали, тож знайди заклад пошуком.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(venueButtons()).toHaveLength(0);

    await user.type(screen.getByPlaceholderText('Назва закладу'), 'ват');
    expect(venueButtons().map((b) => b.textContent)).toEqual([expect.stringContaining('Ватра')]);
  });

  it('a venue we do not have goes to the existing add flow', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: 'Закладу нема в списку' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/add-borsch');
    expect(calls('flow_exit')).toEqual([expect.objectContaining({ flow: 'bowl', step: 'venue', via: 'new_place' })]);
  });
});

describe('which borshch, then the photo', () => {
  it('takes the only borshch of a venue and asks for the photo; «Сфоткаю пізніше» keeps the bowl', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click((await screen.findByText('Ватра')).closest('button'));

    expect(screen.getByRole('heading', { name: 'Сфоткай, поки не взяв ложку' })).toBeInTheDocument();
    expect(screen.getByText(/Ватра · Борщ український/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сфоткаю пізніше' }));

    expect(await screen.findByRole('heading', { name: 'Смачного!' })).toBeInTheDocument();
    expect(screen.getByText('Оціниш, коли доїси.')).toBeInTheDocument();
    const [draft] = listDrafts();
    expect(draft).toMatchObject({
      place: { id: 'p-vatra', name: 'Ватра' },
      borsch: { id: 'b-vatra', name: 'Борщ український' },
      photoMode: 'later',
      photoCount: 0,
    });
    expect(calls('bowl_photo')).toEqual([{ mode: 'later', count: 0 }]);
    expect(calls('bowl_started')).toEqual([expect.objectContaining({ bowl_id: draft.id, photo_mode: 'later', entry: 'chooser' })]);
    expect(calls('flow_step').map((p) => p.step)).toEqual(['venue', 'photo', 'done']);

    await user.click(screen.getByRole('button', { name: 'Я вже поїв, оцінити' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/bowl/${draft.id}/rate`);
  });

  it('lists the borshch of a venue with several and keeps a camera photo', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click((await screen.findByText('Пузата хата')).closest('button'));
    expect(screen.getByRole('heading', { name: 'Який Борщ тобі принесли?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Інший Борщ/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Борщ зелений/ }));

    const shot = new File([new Uint8Array([0xff, 0xd8, 1, 2])], 'shot.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('bowl-camera'), { target: { files: [shot] } });
    await user.click(await screen.findByRole('button', { name: 'Готово' }));

    expect(await screen.findByRole('heading', { name: 'Смачного!' })).toBeInTheDocument();
    const [draft] = listDrafts();
    expect(draft).toMatchObject({ borsch: { id: 'b-puz2' }, photoMode: 'now', photoCount: 1 });
    expect((await loadDraftPhotos(draft.id))[0].name).toBe('shot.jpg');
    expect(calls('bowl_photo')).toEqual([{ mode: 'now', count: 1 }]);
  });

  it('«Фото вже на камері» is reported as the camera roll', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click((await screen.findByText('Ватра')).closest('button'));
    const pic = new File([new Uint8Array([0xff, 0xd8])], 'roll.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('bowl-roll'), { target: { files: [pic] } });
    await user.click(await screen.findByRole('button', { name: 'Готово' }));
    await screen.findByRole('heading', { name: 'Смачного!' });
    expect(calls('bowl_photo')).toEqual([{ mode: 'camera_roll', count: 1 }]);
  });

  it('«Інший Борщ» opens the add flow at this venue, with its id', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click((await screen.findByText('Пузата хата')).closest('button'));
    await user.click(screen.getByRole('button', { name: /Інший Борщ/ }));
    const where = screen.getByTestId('where');
    expect(where).toHaveTextContent('/add-borsch/select-place/new');
    const state = JSON.parse(where.getAttribute('data-state'));
    expect(state).toMatchObject({ placeId: 'p-puzata', place: { name: 'Пузата хата' }, city: 'Київ' });
  });

  it('starts at the photo when opened from a borshch card', async () => {
    geo('ok');
    renderFlow('/bowl/new?borsch=b-kafe&from=card');
    expect(await screen.findByRole('heading', { name: 'Сфоткай, поки не взяв ложку' })).toBeInTheDocument();
    expect(screen.getByText(/Кафе · Борщ/)).toBeInTheDocument();
    expect(calls('flow_step')[0]).toEqual({ flow: 'bowl', step: 'photo', index: 2, total: 4, entry: 'card' });
  });
});

describe('«Оцінити Борщ, який уже скуштував»', () => {
  it('picks the venue and goes into the ordinary rating', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow('/bowl/new?mode=rate&from=chooser');
    expect(await screen.findByRole('heading', { name: 'Це було тут?' })).toBeInTheDocument();
    await user.click(screen.getByText('Ватра').closest('button'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/borsch/b-vatra/evaluations'));
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state'))).toMatchObject({ fromPicker: true });
    expect(listDrafts()).toEqual([]);
    expect(calls('flow_step')[0]).toMatchObject({ flow: 'rate', step: 'venue', index: 0, picker: true });
  });
});
