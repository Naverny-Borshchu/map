import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { listDrafts, loadDraftPhotos } from '../../services/bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from '../../services/bowlPhotoStore';
import { photoWithMeta } from '../../utils/exifFixture';
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
  { ...place('p-far', 'Далекий', 50.4501, 30.5834), google_place_id: 'g-far' },
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
// the Maps script is «loaded»; google.maps.places is whatever a test puts on window
jest.mock('../../services/googleMaps', () => ({ useGoogleMaps: () => ({ isLoaded: true, loadError: undefined }) }));

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

  it('a venue we do not have is looked up in Google, and the map stays as the way out', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: 'Закладу нема в списку' }));
    expect(screen.getByRole('heading', { name: 'Знайди заклад у Google' })).toBeInTheDocument();
    expect(calls('flow_step').map((p) => p.step)).toEqual(['venue', 'venue_google']);
    await user.click(screen.getByRole('button', { name: 'Нема й у Google? Постав мітку на мапі' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/add-borsch');
    expect(calls('flow_exit')).toEqual([expect.objectContaining({ flow: 'bowl', step: 'venue_google', via: 'new_place' })]);
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

  it('«Інший Борщ» in the rating opens the add flow at this venue, with its id', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow('/bowl/new?mode=rate&from=chooser');
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


// --- stage 3 ---------------------------------------------------------------

// google.maps.places as the new library has it: suggestions whose prediction
// turns into a Place, and the Place's fields after fetchFields
const googleVenue = (id, name, lat, lng) => ({
  id,
  displayName: name,
  formattedAddress: `${name}, вул. Хрещатик, 1, Київ`,
  addressComponents: [
    { longText: 'Київ', shortText: 'Київ', types: ['locality'] },
    { longText: 'Україна', shortText: 'UA', types: ['country'] },
  ],
  location: { lat: () => lat, lng: () => lng },
  fetchFields: jest.fn(async () => {}),
});
const mockGooglePlaces = (venues) => {
  const fetchAutocompleteSuggestions = jest.fn(async () => ({
    suggestions: venues.map((v) => ({
      placePrediction: {
        placeId: v.id,
        mainText: { text: v.displayName },
        secondaryText: { text: 'Київ' },
        types: ['restaurant', 'establishment'],
        toPlace: () => v,
      },
    })),
  }));
  window.google = {
    maps: {
      places: {
        AutocompleteSessionToken: function Token() {},
        AutocompleteSuggestion: { fetchAutocompleteSuggestions },
      },
    },
  };
  return fetchAutocompleteSuggestions;
};

describe('Google Places for a venue we do not have', () => {
  afterEach(() => { delete window.google; });

  it('a new venue from Google goes into the bowl with a new borshch, both created only when rated', async () => {
    geo('ok');
    const fetchSuggestions = mockGooglePlaces([googleVenue('g-new', 'Криївка', 50.4512, 30.5240)]);
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: 'Закладу нема в списку' }));
    await user.type(screen.getByTestId('google-place-search'), 'Криї');
    await user.click(await screen.findByRole('button', { name: /Криївка/ }, { timeout: 2000 }));
    expect(fetchSuggestions).toHaveBeenCalledWith(expect.objectContaining({
      input: 'Криї',
      locationBias: { center: { lat: HERE.latitude, lng: HERE.longitude }, radius: 30000 },
    }));

    // nothing of ours there yet: the borshch is typed in by its name
    expect(screen.getByRole('heading', { name: 'Який Борщ тобі принесли?' })).toBeInTheDocument();
    expect(screen.getByText('Закладу ще нема на мапі. Додамо його разом з Борщем, коли оціниш.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Додати Борщ/ }));
    expect(screen.getByRole('heading', { name: 'Як він називається в меню?' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'Борщ з квасолею');
    await user.click(screen.getByRole('button', { name: 'Далі' }));

    expect(screen.getByRole('heading', { name: 'Сфоткай, поки не взяв ложку' })).toBeInTheDocument();
    expect(screen.getByText(/Криївка · Борщ з квасолею/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сфоткаю пізніше' }));
    await screen.findByRole('heading', { name: 'Смачного!' });
    expect(screen.getByText('Миска чекає в «Моїх мисках». Новий Борщ зʼявиться на мапі, щойно ти його оціниш.')).toBeInTheDocument();

    const [draft] = listDrafts();
    expect(draft.place).toEqual({
      id: null,
      name: 'Криївка',
      city: 'Київ',
      google: {
        googlePlaceId: 'g-new',
        name: 'Криївка',
        address: 'Криївка, вул. Хрещатик, 1, Київ',
        city: 'Київ',
        country: 'Україна',
        location: { lat: 50.4512, lng: 30.524 },
      },
    });
    expect(draft.borsch).toEqual({ id: null, name: 'Борщ з квасолею' });
    expect(calls('bowl_started')).toEqual([expect.objectContaining({ new_place: true, new_borsch: true })]);
    expect(calls('flow_step').map((p) => p.step)).toEqual(['venue', 'venue_google', 'borsch', 'borsch_new', 'photo', 'done']);
  });

  it('a Google venue we already have (same Place ID) is our venue, with its borshch', async () => {
    geo('ok');
    mockGooglePlaces([googleVenue('g-far', 'Далекий ресторан', 50.4501, 30.5834)]);
    mockBorsch.borsch = [...BORSCH, borsch('b-far', 'p-far', 'Борщ далекий')];
    const user = userEvent.setup();
    try {
      renderFlow();
      await user.click(await screen.findByRole('button', { name: 'Закладу нема в списку' }));
      await user.type(screen.getByTestId('google-place-search'), 'Дал');
      await user.click(await screen.findByRole('button', { name: /Далекий ресторан/ }, { timeout: 2000 }));
      // its only borshch is taken, straight to the photo
      expect(screen.getByRole('heading', { name: 'Сфоткай, поки не взяв ложку' })).toBeInTheDocument();
      expect(screen.getByText(/Далекий · Борщ далекий/)).toBeInTheDocument();
      expect(calls('venue_google_picked')).toEqual([expect.objectContaining({ own: true })]);
    } finally {
      mockBorsch.borsch = BORSCH;
    }
  });

  it('without google.maps.places the old way stays: a pin on the map', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: 'Закладу нема в списку' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Пошук Google зараз не відповідає. Постав мітку на мапі.');
    await user.click(screen.getByRole('button', { name: 'Нема й у Google? Постав мітку на мапі' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/add-borsch');
  });
});

describe('«Інший Борщ» in a bowl', () => {
  it('asks only the name, and the venue\'s own borshch typed again is that borshch', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click((await screen.findByText('Пузата хата')).closest('button'));
    await user.click(screen.getByRole('button', { name: /Інший Борщ/ }));
    expect(screen.getByText('Лише назва. Ціну й грамовку спитаємо, коли доїси.')).toBeInTheDocument();
    // empty is refused
    expect(screen.getByRole('button', { name: 'Далі' })).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '  борщ   ЗЕЛЕНИЙ ');
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    expect(screen.getByText(/Пузата хата · Борщ зелений/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сфоткаю пізніше' }));
    await screen.findByRole('heading', { name: 'Смачного!' });
    expect(listDrafts()[0].borsch).toEqual({ id: 'b-puz2', name: 'Борщ зелений' });
  });

  it('a chip fills the name', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click((await screen.findByText('Пузата хата')).closest('button'));
    await user.click(screen.getByRole('button', { name: /Інший Борщ/ }));
    await user.click(screen.getByRole('button', { name: 'Борщ з пампушками' }));
    expect(screen.getByRole('textbox')).toHaveValue('Борщ з пампушками');
  });
});

describe('«Фото вже на камері»: the photo says where and when', () => {
  // Ватра in PLACES is at 50.4505, 30.5236
  const AT_VATRA = { lat: [50, 27, 1.8], latRef: 'N', lng: [30, 31, 24.96], lngRef: 'E' };

  it('a photo taken at a venue of ours asks «Це той заклад?», and yes goes on with the photo', async () => {
    geo('denied');
    const user = userEvent.setup();
    renderFlow();
    await screen.findByRole('heading', { name: 'Де ти їси Борщ?' });
    fireEvent.change(screen.getByTestId('bowl-roll'), { target: { files: [photoWithMeta('roll.jpg', { gps: AT_VATRA })] } });

    const ask = await screen.findByTestId('photo-venue');
    expect(ask).toHaveTextContent('Фото зроблено біля закладу «Ватра». Це він?');
    expect(ask).toHaveTextContent('14 листопада, 13:20');
    // the venues near the photo come first, even with the location refused
    expect(screen.getByRole('heading', { name: 'Фото зроблено тут?' })).toBeInTheDocument();
    expect(calls('exif_used')).toEqual([{ gps: true, time: true, where: 'venue' }]);

    await user.click(within(ask).getByRole('button', { name: 'Так, це він' }));
    expect(screen.getByRole('heading', { name: 'Сфоткай, поки не взяв ложку' })).toBeInTheDocument();
    expect(screen.getByText('Фото з 14 листопада, 13:20')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await screen.findByRole('heading', { name: 'Смачного!' });
    const [draft] = listDrafts();
    expect(draft).toMatchObject({ place: { id: 'p-vatra' }, photoMode: 'camera_roll', photoCount: 1, photoTakenAt: '2026-11-14T13:20:05' });
    expect(calls('bowl_photo')).toEqual([{ mode: 'camera_roll', count: 1 }]);
  });

  it('«Ні, інший» keeps the list; a photo with only the time shows the time', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await screen.findByRole('heading', { name: 'Ти зараз тут?' });
    fireEvent.change(screen.getByTestId('bowl-roll'), { target: { files: [photoWithMeta('roll.jpg', { gps: AT_VATRA })] } });
    const ask = await screen.findByTestId('photo-venue');
    await user.click(within(ask).getByRole('button', { name: 'Ні, інший' }));
    expect(screen.queryByTestId('photo-venue')).not.toBeInTheDocument();
    expect(venueButtons().length).toBeGreaterThan(0);

    cleanup();
    track.mockClear();
    geo('ok');
    renderFlow();
    await screen.findByRole('heading', { name: 'Ти зараз тут?' });
    fireEvent.change(screen.getByTestId('bowl-roll'), { target: { files: [photoWithMeta('roll.jpg', { gps: null })] } });
    expect(await screen.findByText('Фото з 14 листопада, 13:20')).toBeInTheDocument();
    expect(screen.queryByTestId('photo-venue')).not.toBeInTheDocument();
    expect(calls('exif_used')).toEqual([{ gps: false, time: true, where: 'venue' }]);
  });

  it('a photo taken far from the chosen venue is worth a second look', async () => {
    geo('ok');
    const user = userEvent.setup();
    renderFlow();
    await user.click((await screen.findByText('Хата')).closest('button'));
    // Хата has no borshch: a new one
    await user.click(screen.getByRole('button', { name: /Додати Борщ/ }));
    await user.type(screen.getByRole('textbox'), 'Борщ');
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    fireEvent.change(screen.getByTestId('bowl-roll'), {
      target: { files: [photoWithMeta('far.jpg', { gps: { lat: [50, 30, 0], latRef: 'N', lng: [30, 40, 0], lngRef: 'E' } })] },
    });
    expect(await screen.findByText(/Фото зроблено за .* від закладу «Хата». Точно той заклад\?/)).toBeInTheDocument();
  });
});

describe('a venue given in the link (a tip\'s «Оцінити першим»)', () => {
  it('opens at that venue: its only borshch and the photo', async () => {
    geo('ok');
    renderFlow('/bowl/new?place=p-kafe&tip=t1&from=tip');
    expect(await screen.findByRole('heading', { name: 'Сфоткай, поки не взяв ложку' })).toBeInTheDocument();
    expect(screen.getByText(/Кафе · Борщ/)).toBeInTheDocument();
    expect(calls('flow_step')[0]).toMatchObject({ flow: 'bowl', step: 'photo', entry: 'tip', tip_id: 't1' });
  });

  it('a venue with no borshch yet asks for one by name', async () => {
    geo('ok');
    renderFlow('/bowl/new?place=p-khata&from=tip');
    expect(await screen.findByRole('heading', { name: 'Який Борщ тобі принесли?' })).toBeInTheDocument();
    expect(screen.getByText('У цьому закладі ще нема Борщу на мапі.')).toBeInTheDocument();
  });
});

// --- abroad (11.2026) ---------------------------------------------------------
// Tokyo with location refused (Threads, Telegram): «Ichiran Shibuya» is not on
// our map, and Google's answer used to wait behind «Закладу нема в списку».
describe('abroad: Google venues inline in the venue list', () => {
  afterEach(() => { delete window.google; });

  const japan = (id, name) => ({
    id,
    displayName: name,
    formattedAddress: `Japan, 〒150-0041 Tokyo, Shibuya, ${name}`,
    addressComponents: [
      { longText: 'Shibuya', types: ['locality'] },
      { longText: 'Tokyo', types: ['administrative_area_level_1'] },
      { longText: 'Japan', shortText: 'JP', types: ['country'] },
    ],
    location: { lat: () => 35.6618, lng: () => 139.7042 },
    fetchFields: jest.fn(async () => {}),
  });

  it('a typed venue our map lacks is picked from Google right there, and the bowl goes on with it', async () => {
    geo('denied');
    const ichiran = japan('g-ichiran', 'ICHIRAN Shibuya');
    window.google = {
      maps: {
        places: {
          AutocompleteSessionToken: function Token() {},
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: jest.fn(async () => ({
              suggestions: [{
                placePrediction: {
                  placeId: 'g-ichiran', mainText: { text: 'ICHIRAN Shibuya' }, secondaryText: { text: 'Jinnan, Shibuya, Tokyo, Japan' },
                  types: ['ramen_restaurant', 'restaurant'], toPlace: () => ichiran,
                },
              }],
            })),
          },
          Place: function Place() { return ichiran; },
        },
      },
    };
    const user = userEvent.setup();
    renderFlow();
    await user.type(await screen.findByRole('searchbox'), 'Ichiran Shibuya');
    const block = await screen.findByTestId('google-inline');
    expect(within(block).getByRole('heading', { name: 'Знайшли в Google' })).toBeInTheDocument();
    // «Закладу нема в списку» stays, the last resort
    expect(screen.getByRole('button', { name: 'Закладу нема в списку' })).toBeInTheDocument();
    await user.click(within(block).getByRole('button', { name: /ICHIRAN Shibuya/ }));

    // a venue new to the map: the borshch is typed in by its name, as from «Закладу нема в списку»
    expect(await screen.findByRole('heading', { name: 'Який Борщ тобі принесли?' })).toBeInTheDocument();
    expect(screen.getByText('Закладу ще нема на мапі. Додамо його разом з Борщем, коли оціниш.')).toBeInTheDocument();
    expect(calls('venue_google_picked')).toEqual([expect.objectContaining({ own: false })]);
  });
});
