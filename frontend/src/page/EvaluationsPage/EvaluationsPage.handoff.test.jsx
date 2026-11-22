import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { borschAPI, commentsAPI } from '../../api';
import { EvaluationsPage } from './EvaluationsPage';

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

it('a carried rating stops on the comment, in plain sight, and goes only on the person\'s tap', async () => {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    version: 2, step: 99, handoff: true, values: { answers: ANSWERS, comment: 'Не мій текст' },
  }));
  renderRate();

  expect(await screen.findByDisplayValue('Не мій текст')).toBeInTheDocument();
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
