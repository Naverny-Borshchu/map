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
 * The card's own rating (11.2026): one rating per person per borshch (a
 * second one updates the first, 200 `updated: true`), and two new borshch
 * ratings a day (GET /reviews/today/ before the questions, 429 at the save).
 */

const ANSWERS = { meat_amount: 2, meat_taste: 3, beet_amount: 2, beet_flavor: 3, density: 5, salt: 5, sides: ['sour_cream'], serving_taste: 3, aftertaste: 3, overall: 8 };
const BORSCH = { id_borsch: 'b1', name: 'Борщ дня', type_meat: 'pork', price: '200', weight: '350', photo_urls: [], rating_count: 3 };
const DRAFT_KEY = 'nb:quest-draft:rate:b1';
const TODAY_FULL = { count: 2, limit: 2, remaining: 0, resets_at: '2026-11-17T00:00:00+02:00', already_rated: false };

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 7 }));
};

const renderRate = (lang = 'uk') => {
  localStorage.setItem('lang', lang);
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

// a reload on the comment screen: every answer is in the draft
const onCommentScreen = () => sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 2, step: 8, values: { answers: ANSWERS, comment: '' } }));
const calls = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  track.mockClear();
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
  [commentsAPI.createByBorschId, commentsAPI.today, borschAPI.getById].forEach((f) => f.mockReset());
  mockBorsch.loadBorschData.mockImplementation(async () => {});
  borschAPI.getById.mockResolvedValue(BORSCH);
  signIn();
});

describe('one rating per person per borshch', () => {
  it('200 updated: the note, +0, and the total as it was', async () => {
    localStorage.setItem('nb_xp', '120');
    commentsAPI.today.mockResolvedValue({ count: 2, limit: 2, remaining: 0, already_rated: true });
    commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1', updated: true });
    onCommentScreen();
    const user = userEvent.setup();
    renderRate();
    // already rated: the day's limit does not stop an update
    await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
    expect(await screen.findByTestId('review-updated')).toHaveTextContent('Твою попередню оцінку цього Борщу оновлено.');
    expect(screen.getByText('+0 BRSH')).toBeInTheDocument();
    expect(screen.getByText('Разом у тебе: 120 BRSH')).toBeInTheDocument();
    expect(localStorage.getItem('nb_xp')).toBe('120');
  });

  it('201 (or an older backend): a new rating, paid as before', async () => {
    localStorage.setItem('nb_xp', '120');
    commentsAPI.today.mockResolvedValue({ count: 0, limit: 2, remaining: 2, already_rated: false });
    commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1', updated: false });
    onCommentScreen();
    const user = userEvent.setup();
    renderRate();
    await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
    await screen.findByRole('heading', { name: 'Дякуємо за відгук!' });
    expect(screen.queryByTestId('review-updated')).not.toBeInTheDocument();
    expect(Number(localStorage.getItem('nb_xp'))).toBeGreaterThan(120);
  });
});

describe('two new borshch ratings a day', () => {
  it('the third: a stop before the questions, the started answers kept for this tab', async () => {
    commentsAPI.today.mockResolvedValue(TODAY_FULL);
    onCommentScreen();
    renderRate();
    expect(await screen.findByRole('heading', { name: 'Сьогодні вже два Борщі' })).toBeInTheDocument();
    expect(screen.getByText('Наступний оціниш завтра. Почате не загубиться, поки відкрита ця вкладка.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'До мапи' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати' })).not.toBeInTheDocument();
    expect(commentsAPI.today).toHaveBeenCalledWith('b1');
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)).values.answers.overall).toBe(8);
    expect(calls('daily_limit_stop')).toEqual([{ where: 'card', count: 2, limit: 2, race: false }]);
  });

  it('nothing started yet: just «tomorrow»', async () => {
    commentsAPI.today.mockResolvedValue(TODAY_FULL);
    renderRate('en');
    expect(await screen.findByRole('heading', { name: 'Two borshch today already' })).toBeInTheDocument();
    expect(screen.getByText('You can rate the next one tomorrow.')).toBeInTheDocument();
  });

  it('staff (no limit), a failed check or an older backend: the rating as today', async () => {
    commentsAPI.today
      .mockResolvedValueOnce({ count: 9, limit: null, remaining: null, already_rated: false })
      .mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }));
    const { unmount } = renderRate();
    expect(await screen.findByRole('heading', { name: 'Покажи свій Борщ' })).toBeInTheDocument();
    unmount();
    renderRate();
    expect(await screen.findByRole('heading', { name: 'Покажи свій Борщ' })).toBeInTheDocument();
    expect(screen.queryByTestId('daily-limit')).not.toBeInTheDocument();
  });

  it('429 at the save (the check raced): the same stop, no «не вдалося», the answers kept', async () => {
    commentsAPI.today.mockResolvedValue({ count: 1, limit: 2, remaining: 1, already_rated: false });
    commentsAPI.createByBorschId.mockRejectedValue(Object.assign(new Error('limit'), {
      status: 429, code: 'daily_limit', data: { code: 'daily_limit', limit: 2, resets_at: '2026-11-17T00:00:00+02:00' },
    }));
    onCommentScreen();
    const user = userEvent.setup();
    renderRate();
    await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
    expect(await screen.findByRole('heading', { name: 'Сьогодні вже два Борщі' })).toBeInTheDocument();
    expect(screen.queryByText('Не вдалося зберегти')).not.toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)).values.answers.overall).toBe(8));
    expect(calls('daily_limit_stop')).toEqual([expect.objectContaining({ where: 'card', race: true, limit: 2 })]);
  });
});
