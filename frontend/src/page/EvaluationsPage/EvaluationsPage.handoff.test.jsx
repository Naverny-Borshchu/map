import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { borschAPI, commentsAPI } from '../../api';
import { EvaluationsPage } from './EvaluationsPage';
import { applyHandoff, HANDOFF_PARAM } from '../../services/handoff';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api');
  return {
    ...actual,
    commentsAPI: { createByBorschId: jest.fn(), today: jest.fn() },
    borschAPI: { getById: jest.fn(), uploadPhoto: jest.fn(), confirmFacts: jest.fn(), update: jest.fn() },
  };
});
const mockBorsch = {
  getBorschById: () => undefined,
  getBorschExploration: () => 'confirmed',
  loadBorschData: jest.fn(async () => {}),
};
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));
jest.mock('../../context/CommentsContext', () => ({ useComments: () => ({ syncWithServer: async () => {} }) }));
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => ({ getPlaceById: () => undefined }) }));

/**
 * A rating carried in from the browser inside Threads (services/handoff) came
 * in a link, and anybody can write one. Opened on «done», the flow would post
 * it at once in the name of whoever opened the link (pre-PR review, 22.11).
 */

const ANSWERS = { meat_amount: 2, meat_taste: 3, beet_amount: 2, beet_flavor: 3, density: 5, salt: 5, sides: ['sour_cream'], serving_taste: 3, aftertaste: 3, overall: 8 };
const BORSCH = { id_borsch: 'b1', name: 'Борщ дня', type_meat: 'pork', price: '200', weight: '350', photo_urls: [], rating_count: 3 };
const DRAFT_KEY = 'nb:quest-draft:rate:b1';

const renderRate = () => {
  localStorage.setItem('lang', 'uk');
  return render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter>
          <EvaluationsPage borschId="b1" />
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  track.mockClear();
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
  [commentsAPI.createByBorschId, commentsAPI.today, borschAPI.getById].forEach((f) => f.mockReset());
  borschAPI.getById.mockResolvedValue(BORSCH);
  commentsAPI.today.mockResolvedValue({ count: 0, limit: 2, remaining: 2, already_rated: false });
  commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1' });
  // signed in: no sign-in step stands between the answers and the send
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 7 }));
});

it('a carried rating stops on the comment, every answer in plain sight, and goes only on the person\'s tap', async () => {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    version: 2, step: 99, handoff: true, values: { answers: ANSWERS, comment: 'Не мій текст' },
  }));
  renderRate();

  expect(await screen.findByDisplayValue('Не мій текст')).toBeInTheDocument();
  // what will go out, the way the closing screen says it, before it goes
  const summary = screen.getByTestId('carried-summary');
  expect(summary).toHaveTextContent('Ці відповіді прийшли разом із посиланням');
  expect(summary).toHaveTextContent('Твій Борщ у двох словах');
  expect(summary).toHaveTextContent('Мʼяса кілька шматків');
  expect(summary).toHaveTextContent('Сіль саме те');
  expect(summary).toHaveTextContent(/Загалом\s*8\s*прекрасний/);
  expect(screen.getByRole('button', { name: 'Змінити відповіді' })).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 300));
  expect(commentsAPI.createByBorschId).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /Надіслати|Готово|Далі/ }));
  await waitFor(() => expect(commentsAPI.createByBorschId).toHaveBeenCalledTimes(1));
});

it('a carried rating that stopped earlier opens where it stopped', async () => {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    version: 2, step: 2, handoff: true, values: { answers: ANSWERS, comment: 'x' },
  }));
  renderRate();
  await screen.findByText(/Борщ дня/);
  expect(screen.queryByDisplayValue('x')).not.toBeInTheDocument();
  expect(commentsAPI.createByBorschId).not.toHaveBeenCalled();
});

it('«Змінити відповіді» goes to the first rating screen with the answers kept', async () => {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    version: 2, step: 99, handoff: true, values: { answers: ANSWERS, comment: '' },
  }));
  renderRate();
  await userEvent.click(await screen.findByRole('button', { name: 'Змінити відповіді' }));
  // the meat screen, «кілька шматків» still chosen
  expect(await screen.findByText('Скільки його було?')).toBeInTheDocument();
  expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true').length).toBeGreaterThan(0);
  expect(screen.queryByTestId('carried-summary')).not.toBeInTheDocument();
  expect(commentsAPI.createByBorschId).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)).values.answers).toMatchObject({ meat_amount: 2, overall: 8 });
});

it('a rating that was not carried shows no such summary on the comment', async () => {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    version: 2, step: 8, values: { answers: ANSWERS, comment: 'мій' },
  }));
  renderRate();
  expect(await screen.findByDisplayValue('мій')).toBeInTheDocument();
  expect(screen.queryByTestId('carried-summary')).not.toBeInTheDocument();
});

it.each([
  ['a number', 5],
  ['an object', { a: 1 }],
  ['an array', ['x']],
])('a link with a comment that is %s opens the rating instead of a blank page', async (_, comment) => {
  const raw = btoa(JSON.stringify({ v: 2, draft: { step: 99, answers: ANSWERS, comment } }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  window.history.replaceState(null, '', `/borsch/b1/evaluations?${HANDOFF_PARAM}=${raw}`);
  expect(applyHandoff()).toEqual({ drafts: 1, bowl: false });
  renderRate();
  expect(await screen.findByTestId('carried-summary')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('');
  window.history.replaceState(null, '', '/');
});

