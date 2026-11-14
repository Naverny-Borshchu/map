import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { tablesAPI } from '../../api/tables';
import { readTableGuest } from '../../services/tableGuest';
import { TablePage } from './TablePage';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api/tables', () => {
  const actual = jest.requireActual('../../api/tables');
  return {
    ...actual,
    tablesAPI: { get: jest.fn(), results: jest.fn(), rate: jest.fn(), close: jest.fn(), create: jest.fn(), listMine: jest.fn() },
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
  GoogleAuth: () => <button type="button">Google test</button>,
}));

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
    // the host sees the names even at a blind table: they put the bowls on it
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
