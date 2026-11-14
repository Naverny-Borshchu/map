import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { tablesAPI } from '../../api/tables';
import { readTableGuest } from '../../services/tableGuest';
import { TablePage } from './TablePage';
import { googleAuth } from '../../services/googleAuth';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api/tables', () => {
  const actual = jest.requireActual('../../api/tables');
  return {
    ...actual,
    tablesAPI: {
      get: jest.fn(), results: jest.fn(), rate: jest.fn(), close: jest.fn(), create: jest.fn(), listMine: jest.fn(),
      claimAvailable: jest.fn(), claim: jest.fn(),
    },
  };
});
// CRA's SVG transform builds elements of an older React; the criterion icons are
// not what these tests are about
jest.mock('../BorschPage/meat.svg', () => ({ ReactComponent: () => null }));
jest.mock('../BorschPage/beetroot.svg', () => ({ ReactComponent: () => null }));
jest.mock('../BorschPage/vegetable.svg', () => ({ ReactComponent: () => null }));
jest.mock('../BorschPage/salt.svg', () => ({ ReactComponent: () => null }));
jest.mock('../BorschPage/aftertaste.svg', () => ({ ReactComponent: () => null }));
jest.mock('../BorschPage/serving.svg', () => ({ ReactComponent: () => null }));
jest.mock('../../components/GoogleAuth', () => ({
  GoogleAuth: ({ onSuccess }) => <button type="button" onClick={() => onSuccess && onSuccess({ credential: 'cred' })}>Google test</button>,
}));
jest.mock('../../services/googleAuth', () => ({ ...jest.requireActual('../../services/googleAuth'), googleAuth: jest.fn() }));

/**
 * map.navernyborshchu.com/t/<code>: one link, a different screen for the host,
 * for a guest at an open table, and for anyone once it is closed. The API is a
 * mock: nothing here reaches a server.
 */

const PLACE = { id: 'p1', name: 'Ватра', address: 'пл. Ринок, 1', city: 'Львів', latitude: 49.84, longitude: 24.03 };
const NAMED = [
  { position: 1, borsch: { id: 'b1', name: 'Червоний' }, rated_count: 3, raters: [{ name: 'Оля', guest: true }, { name: 'Петро', guest: false }, { name: 'Іра', guest: true }] },
  { position: 2, borsch: { id: 'b2', name: 'Зелений' }, rated_count: 2, raters: [{ name: 'Оля', guest: true }, { name: 'Петро', guest: false }] },
];
const table = (over = {}) => ({
  code: 'K7M2QX',
  share_url: 'https://map.navernyborshchu.com/t/K7M2QX',
  title: 'День Борщу',
  status: 'open',
  blind: true,
  names_hidden: true,
  is_host: false,
  host_name: 'Андрій',
  created_at: '2026-11-21T13:00:00+02:00',
  closed_at: null,
  place: PLACE,
  borsches: [{ position: 1, borsch: null, rated_count: 3 }, { position: 2, borsch: null, rated_count: 2 }],
  progress: { raters_total: 3, raters_complete: 2, guests_total: 2, guest_limit: 40 },
  me: null,
  ...over,
});
const RESULTS = {
  code: 'K7M2QX',
  title: 'День Борщу',
  status: 'closed',
  blind: true,
  names_hidden: false,
  closed_at: '2026-11-21T15:00:00+02:00',
  place: PLACE,
  raters_total: 3,
  overall_average: 7.4,
  borsches: [
    {
      position: 1,
      borsch: { id: 'b1', name: 'Червоний' },
      rater_count: 3,
      averages: { rating_salt: 6.1, rating_meat: 7.8, rating_beet: 8.2, rating_density: 7, rating_aftertaste: 7.5, rating_serving: 8.4, overall_rating: 7.9 },
      most_divisive: { criterion: 'rating_salt', stddev: 2.31 },
    },
    {
      position: 2,
      borsch: { id: 'b2', name: 'Зелений' },
      rater_count: 2,
      averages: { rating_salt: 6, rating_meat: 6, rating_beet: 4, rating_density: 6, rating_aftertaste: 7, rating_serving: 7, overall_rating: 6.8 },
      most_divisive: null,
    },
  ],
  most_divisive: { position: 1, criterion: 'rating_salt', stddev: 2.31 },
};

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
};

const renderAt = (path) =>
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/t/:code" element={<><TablePage /><Where /></>} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );

const calls = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'host-access');
  localStorage.setItem('refresh', 'host-refresh');
  localStorage.setItem('user', JSON.stringify({ id: 7, given_name: 'Андрій' }));
};

// seven taste questions: an answer and «Далі», the last one «Готово»
const answerSeven = async (user, title) => {
  for (let i = 1; i <= 7; i += 1) {
    await screen.findByText(`${title} · Крок ${i} / 7`);
    const cards = screen.getAllByRole('button', { pressed: false });
    await user.click(cards[3]);
    await user.click(screen.getByRole('button', { name: i === 7 ? 'Готово' : 'Далі' }));
  }
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  track.mockClear();
  Object.values(tablesAPI).forEach((fn) => fn.mockReset());
  // the claim offer stays away unless a test asks for it
  tablesAPI.claimAvailable.mockResolvedValue(false);
});

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 5));
});

describe('the link /t/<code>', () => {
  it('takes a code in any case and settles on the canonical link', async () => {
    tablesAPI.get.mockResolvedValue(table());
    renderAt('/t/k7m2qx');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/K7M2QX'));
    expect(tablesAPI.get).toHaveBeenCalledWith('K7M2QX', { guestToken: null });
    expect(tablesAPI.get).not.toHaveBeenCalledWith('k7m2qx', expect.anything());
  });

  it('something that cannot be a code is an unknown table, without asking the API', async () => {
    renderAt('/t/H0LA-1');
    expect(screen.getByRole('heading', { name: 'Такого Столу нема' })).toBeInTheDocument();
    expect(tablesAPI.get).not.toHaveBeenCalled();
  });

  it('a code the API does not know is an unknown table too, with the way back to the map', async () => {
    tablesAPI.get.mockRejectedValue(Object.assign(new Error('Стіл з таким кодом не знайдено.'), { status: 404 }));
    const user = userEvent.setup();
    renderAt('/t/ZZZZZZ');
    expect(await screen.findByRole('heading', { name: 'Такого Столу нема' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'На мапу' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });
});

describe('a guest at an open blind table', () => {
  it('sees the borshch only by number, and needs a name to start', async () => {
    tablesAPI.get.mockResolvedValue(table());
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    expect(await screen.findByRole('heading', { name: 'День Борщу' })).toBeInTheDocument();
    expect(screen.getByText('Збирає Андрій')).toBeInTheDocument();
    expect(screen.getByText('Борщ №1')).toBeInTheDocument();
    expect(screen.getByText('Борщ №2')).toBeInTheDocument();
    expect(screen.getByText('Наосліп: назви відкриються, коли ведучий закриє Стіл.')).toBeInTheDocument();
    expect(screen.queryByText(/Червоний|Зелений/)).not.toBeInTheDocument();
    // nothing about price, weight or photo is asked of a guest
    expect(screen.queryByText(/Ціна|Порція|фото на камері/i)).not.toBeInTheDocument();

    const start = screen.getByRole('button', { name: 'Почати' });
    expect(start).toBeDisabled();
    await user.type(screen.getByLabelText('Як тебе звати?'), 'Оля');
    expect(start).toBeEnabled();
  });

  it('rates only the taste, gets a token with the first rating, and goes on to №2', async () => {
    tablesAPI.get.mockResolvedValue(table());
    tablesAPI.rate.mockResolvedValue({ created: true, rated_positions: [1], guest_token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa' });
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    await user.type(await screen.findByLabelText('Як тебе звати?'), '  Оля ');
    await user.click(screen.getByRole('button', { name: 'Почати' }));
    expect(calls('table_joined')).toEqual([expect.objectContaining({ code: 'K7M2QX', as: 'guest', blind: true })]);

    await answerSeven(user, 'Борщ №1');
    expect(await screen.findByRole('heading', { name: 'Борщ №1 оцінено!' })).toBeInTheDocument();
    expect(tablesAPI.rate).toHaveBeenCalledWith('K7M2QX', expect.objectContaining({
      position: 1, as: 'guest', guestName: 'Оля', guestToken: null,
      grades: expect.objectContaining({ meat: 8, beetroot: 8, overall: 8 }),
    }));
    expect(readTableGuest('K7M2QX')).toEqual(expect.objectContaining({ token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Оля', draft: null }));

    await user.click(screen.getByRole('button', { name: 'Далі: Борщ №2' }));
    expect(await screen.findByText('Борщ №2 · Крок 1 / 7')).toBeInTheDocument();
  });

  it('after a reload continues at the next borshch, at the same question, as the same guest', async () => {
    localStorage.setItem('nb:table:K7M2QX', JSON.stringify({
      token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa',
      name: 'Оля',
      draft: { position: 2, grades: { meat: 8, beetroot: 6 }, step: 2 },
      updatedAt: Date.now(),
    }));
    tablesAPI.get.mockResolvedValue(table({ me: { kind: 'guest', name: 'Оля', rated_positions: [1], reviews: [] } }));
    tablesAPI.rate.mockResolvedValue({ created: true, rated_positions: [1, 2], guest_token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa' });
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');

    // straight to the third question of №2: no door, no name again
    expect(await screen.findByText('Борщ №2 · Крок 3 / 7')).toBeInTheDocument();
    expect(tablesAPI.get).toHaveBeenCalledWith('K7M2QX', { guestToken: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(screen.queryByLabelText('Як тебе звати?')).not.toBeInTheDocument();

    // the two answers given before the reload are still there
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    await screen.findByText('Борщ №2 · Крок 2 / 7');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('a guest who rated everything is thanked and waits for the results', async () => {
    localStorage.setItem('nb:table:K7M2QX', JSON.stringify({ token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Оля', updatedAt: Date.now() }));
    tablesAPI.get.mockResolvedValue(table({
      me: { kind: 'guest', name: 'Оля', rated_positions: [1, 2], reviews: [{ position: 1, overall_rating: '8.0' }, { position: 2, overall_rating: '6.0' }] },
    }));
    renderAt('/t/K7M2QX');
    expect(await screen.findByRole('heading', { name: 'Дякуємо!' })).toBeInTheDocument();
    expect(screen.getByText('Підсумок зʼявиться, коли ведучий закриє Стіл.')).toBeInTheDocument();
    const mine = screen.getByRole('list', { name: 'Твої оцінки' });
    expect(within(mine).getByText('Борщ №1')).toBeInTheDocument();
    expect(within(mine).getByText('8')).toBeInTheDocument();
  });

  it('a table closed while answering turns into the results', async () => {
    tablesAPI.get
      .mockResolvedValueOnce(table())
      .mockResolvedValue(table({ status: 'closed', names_hidden: false, borsches: NAMED }));
    tablesAPI.rate.mockRejectedValue(Object.assign(new Error('closed'), { status: 409, code: 'table_closed' }));
    tablesAPI.results.mockResolvedValue(RESULTS);
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    await user.type(await screen.findByLabelText('Як тебе звати?'), 'Оля');
    await user.click(screen.getByRole('button', { name: 'Почати' }));
    await answerSeven(user, 'Борщ №1');
    expect(await screen.findByText('Підсумок Столу')).toBeInTheDocument();
  });
});

describe('the host', () => {
  it('sees the QR, the code, the names and who rated, live', async () => {
    signIn();
    tablesAPI.get.mockResolvedValue(table({ is_host: true, names_hidden: false, borsches: NAMED, me: { kind: 'user', rated_positions: [] } }));
    renderAt('/t/K7M2QX');
    expect(await screen.findByText('Твій Стіл')).toBeInTheDocument();
    expect(screen.getByTestId('table-code')).toHaveTextContent('K7M2QX');
    expect(screen.getByTestId('table-qr')).toHaveAttribute('data-link', 'https://map.navernyborshchu.com/t/K7M2QX');
    // a blind table's QR is shown to everyone: the host's names wait for a tap
    expect(screen.queryByText('Червоний')).not.toBeInTheDocument();
    expect(screen.getAllByText('Назву сховано')).toHaveLength(2);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Показати назви' }));
    expect(screen.getByText('Червоний')).toBeInTheDocument();
    expect(screen.getByText('Зелений')).toBeInTheDocument();
    expect(screen.getByTestId('raters-total')).toHaveTextContent('3');
    expect(screen.getByText('Оцінили всі Борщі: 2 з 3')).toBeInTheDocument();
    expect(screen.getAllByText('Оля')).toHaveLength(2);
  });

  it('closes the table after a confirmation and gets the results', async () => {
    signIn();
    tablesAPI.get.mockResolvedValue(table({ is_host: true, names_hidden: false, borsches: NAMED, me: { kind: 'user', rated_positions: [] } }));
    tablesAPI.close.mockResolvedValue(table({ is_host: true, status: 'closed', names_hidden: false, borsches: NAMED }));
    tablesAPI.results.mockResolvedValue(RESULTS);
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    await user.click(await screen.findByRole('button', { name: 'Закрити Стіл' }));
    expect(tablesAPI.close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Так, закрити' }));
    expect(tablesAPI.close).toHaveBeenCalledWith('K7M2QX', { from: 'host' });
    expect(await screen.findByText('Підсумок Столу')).toBeInTheDocument();
    expect(calls('table_results_viewed')).toEqual([expect.objectContaining({ code: 'K7M2QX', as: 'host' })]);
  });
});

describe('the results', () => {
  it('reveal the blind names and show the averages and the most divisive criterion', async () => {
    tablesAPI.get.mockResolvedValue(table({ status: 'closed', names_hidden: false, borsches: NAMED }));
    tablesAPI.results.mockResolvedValue(RESULTS);
    renderAt('/t/K7M2QX');
    expect(await screen.findByText('Підсумок Столу')).toBeInTheDocument();
    expect(screen.getByText('Наосліп: назви відкрито')).toBeInTheDocument();
    expect(screen.getByTestId('table-average')).toHaveTextContent('7.4');
    const divisive = screen.getByTestId('table-divisive');
    expect(within(divisive).getByText('Солоність')).toBeInTheDocument();
    expect(within(divisive).getByText('Червоний')).toBeInTheDocument();

    const first = screen.getByTestId('table-borsch-1');
    expect(within(first).getByRole('heading', { name: 'Червоний' })).toBeInTheDocument();
    expect(within(first).getByText('7.9')).toBeInTheDocument();
    expect(within(first).getByText('3 людини оцінили')).toBeInTheDocument();
    expect(within(first).getByText('Буряковість')).toBeInTheDocument();
    expect(within(first).getByText('8.2')).toBeInTheDocument();
    expect(within(first).getByText('Тут найбільше розійшлись: Солоність')).toBeInTheDocument();
    expect(within(screen.getByTestId('table-borsch-2')).getByRole('heading', { name: 'Зелений' })).toBeInTheDocument();
    expect(calls('table_results_viewed')).toEqual([expect.objectContaining({ code: 'K7M2QX', as: 'visitor', blind: true })]);
  });

  it('say so when nobody disagreed', async () => {
    tablesAPI.get.mockResolvedValue(table({ status: 'closed', names_hidden: false, borsches: NAMED }));
    tablesAPI.results.mockResolvedValue({ ...RESULTS, most_divisive: null, borsches: RESULTS.borsches.map((b) => ({ ...b, most_divisive: null })) });
    renderAt('/t/K7M2QX');
    const divisive = await screen.findByTestId('table-divisive');
    expect(within(divisive).getByText('Думки ніде не розійшлися: або всі одностайні, або оцінок замало.')).toBeInTheDocument();
  });
});


describe('stage 3: a guest takes the ratings into the account', () => {
  const GUEST = { token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Оля', updatedAt: Date.now() };
  const DONE = table({
    me: { kind: 'guest', name: 'Оля', rated_positions: [1, 2], reviews: [{ position: 1, overall_rating: '8.0' }, { position: 2, overall_rating: '6.0' }] },
  });

  it('on the thank-you: Google, then the ratings move, the toast says so, the token goes', async () => {
    localStorage.setItem('nb:table:K7M2QX', JSON.stringify(GUEST));
    tablesAPI.get.mockResolvedValue(DONE);
    tablesAPI.claimAvailable.mockResolvedValue(true);
    tablesAPI.claim.mockResolvedValue({ moved: 2, dropped: 0 });
    googleAuth.mockResolvedValue({ access: 'new-a', refresh: 'new-r', user: { id: 9, given_name: 'Оля' } });
    const toast = jest.fn();
    window.addEventListener('nb:toast', toast);
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    expect(await screen.findByText('Увійди, щоб оцінки стали твоїми')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Google test' }));
    await waitFor(() => expect(tablesAPI.claim).toHaveBeenCalledWith('K7M2QX', GUEST.token, { from: 'done' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].detail.message).toBe('Оцінки тепер у твоєму профілі');
    expect(JSON.parse(localStorage.getItem('nb:table:K7M2QX')).token).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('table-claim')).not.toBeInTheDocument());
    window.removeEventListener('nb:toast', toast);
  });

  it('nothing to move (404 guest_not_found): the offer goes quietly, no error', async () => {
    localStorage.setItem('nb:table:K7M2QX', JSON.stringify(GUEST));
    signIn();
    tablesAPI.get.mockResolvedValue(DONE);
    tablesAPI.claimAvailable.mockResolvedValue(true);
    tablesAPI.claim.mockRejectedValue(Object.assign(new Error('nope'), { status: 404, code: 'guest_not_found' }));
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    // signed in already: one tap, no Google
    await user.click(await screen.findByRole('button', { name: 'Перенести в мій профіль' }));
    await waitFor(() => expect(screen.queryByTestId('table-claim')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a backend without the endpoint offers nothing', async () => {
    localStorage.setItem('nb:table:K7M2QX', JSON.stringify(GUEST));
    tablesAPI.get.mockResolvedValue(DONE);
    tablesAPI.claimAvailable.mockResolvedValue(false);
    renderAt('/t/K7M2QX');
    await screen.findByRole('heading', { name: 'Дякуємо!' });
    await waitFor(() => expect(tablesAPI.claimAvailable).toHaveBeenCalledWith('K7M2QX'));
    expect(screen.queryByTestId('table-claim')).not.toBeInTheDocument();
  });

  it('the endpoint answering 405 to the POST hides the offer too', async () => {
    localStorage.setItem('nb:table:K7M2QX', JSON.stringify(GUEST));
    signIn();
    tablesAPI.get.mockResolvedValue(DONE);
    tablesAPI.claimAvailable.mockResolvedValue(true);
    tablesAPI.claim.mockRejectedValue(Object.assign(new Error('x'), { code: 'claim_unavailable' }));
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    await user.click(await screen.findByRole('button', { name: 'Перенести в мій профіль' }));
    await waitFor(() => expect(screen.queryByTestId('table-claim')).not.toBeInTheDocument());
  });

  it('on the results of a closed table as well', async () => {
    localStorage.setItem('nb:table:K7M2QX', JSON.stringify(GUEST));
    tablesAPI.get.mockResolvedValue(table({ status: 'closed', names_hidden: false, borsches: NAMED }));
    tablesAPI.results.mockResolvedValue(RESULTS);
    tablesAPI.claimAvailable.mockResolvedValue(true);
    renderAt('/t/K7M2QX');
    expect(await screen.findByText('Увійди, щоб оцінки стали твоїми')).toBeInTheDocument();
  });
});

describe('stage 3: the host prints the QR', () => {
  it('A4 or A6: the sheet with the QR, the title, the venue, the code and three lines goes to the print dialog', async () => {
    signIn();
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    tablesAPI.get.mockResolvedValue(table({ is_host: true, names_hidden: false, borsches: NAMED, me: { kind: 'user', rated_positions: [] } }));
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    await user.click(await screen.findByRole('button', { name: 'Надрукувати QR' }));
    await user.click(screen.getByRole('button', { name: /A6, на стіл/ }));
    const sheet = await screen.findByTestId('table-print');
    expect(sheet).toHaveAttribute('data-size', 'a6');
    expect(document.body).toHaveClass('nb-printing');
    // a tent: four faces, each with the QR and the code
    expect(within(sheet).getAllByTestId('table-qr')).toHaveLength(4);
    expect(within(sheet).getAllByText('K7M2QX')).toHaveLength(4);
    expect(within(sheet).getAllByText('День Борщу')).toHaveLength(4);
    expect(within(sheet).getAllByText('Наведи камеру телефона на QR')).toHaveLength(4);
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(calls('table_print')).toEqual([expect.objectContaining({ code: 'K7M2QX', size: 'a6' })]);
    // the dialog closed: the page is back
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    await waitFor(() => expect(screen.queryByTestId('table-print')).not.toBeInTheDocument());
    expect(document.body).not.toHaveClass('nb-printing');
    print.mockRestore();
  });
});

describe('stage 3: after closing, a photo for the borshch the table put on the map', () => {
  const CLOSED = table({ is_host: true, status: 'closed', names_hidden: false, borsches: NAMED });
  const WITH_NEW = {
    ...RESULTS,
    borsches: [
      RESULTS.borsches[0],
      { ...RESULTS.borsches[1], borsch: { id: 'b2', name: 'Зелений', photo_urls: [] } },
    ],
  };

  it('asks the host once, on the device that created the table; «Пізніше» ends it', async () => {
    signIn();
    localStorage.setItem('nb:table-host:K7M2QX', JSON.stringify({ newNames: ['Зелений'], prompted: false }));
    tablesAPI.get.mockResolvedValue(CLOSED);
    tablesAPI.results.mockResolvedValue(WITH_NEW);
    const user = userEvent.setup();
    renderAt('/t/K7M2QX');
    const card = await screen.findByTestId('new-borsch-prompt');
    expect(within(card).getByText('Новий Борщ на мапі')).toBeInTheDocument();
    expect(within(card).getByText('Зелений')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Додати фото' })).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Пізніше' }));
    expect(screen.queryByTestId('new-borsch-prompt')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('nb:table-host:K7M2QX')).prompted).toBe(true);
  });

  it('nothing on another device, and nothing for a borshch that has a photo', async () => {
    signIn();
    tablesAPI.get.mockResolvedValue(CLOSED);
    tablesAPI.results.mockResolvedValue(WITH_NEW);
    renderAt('/t/K7M2QX');
    await screen.findByText('Підсумок Столу');
    expect(screen.queryByTestId('new-borsch-prompt')).not.toBeInTheDocument();
  });
});
