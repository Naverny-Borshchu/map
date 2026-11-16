import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { borschAPI, commentsAPI, placesAPI } from '../../api';
import { AddBorschFlow } from './AddBorschFlow';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api');
  return {
    ...actual,
    commentsAPI: { createByBorschId: jest.fn(), today: jest.fn() },
    borschAPI: { create: jest.fn(), uploadPhoto: jest.fn() },
    placesAPI: { search: jest.fn(), create: jest.fn() },
  };
});

/**
 * The add flow opens with the rating, so the day's limit (two new borshch
 * ratings, 11.2026) is asked before it; a 429 at the save is the same stop,
 * with what was already created kept in the draft for tomorrow. A rating the
 * server turned into an update of an earlier one pays nothing.
 */

const DRAFT_KEY = 'nb:quest-draft:add-borsch';
const CONTEXT = { place: { name: 'Ватра', location: { lat: 50.45, lng: 30.52 }, type: '' }, street: 'вул. Городецького, 4', city: 'Київ', country: 'Україна' };
const ANSWERS = { meat_amount: 2, meat_taste: 3, beet_amount: 2, beet_flavor: 3, density: 5, salt: 5, sides: ['sour_cream'], serving_taste: 3, aftertaste: 3, overall: 8 };

const renderAdd = (lang = 'uk') => {
  localStorage.setItem('lang', lang);
  return render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={[{ pathname: '/add-borsch/select-place/new', state: CONTEXT }]}>
          <Routes>
            <Route path="/add-borsch/select-place/:borschId" element={<AddBorschFlow />} />
          </Routes>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );
};

// everything answered, on the comment screen (photo, 7 rating screens, 4 facts)
const onCommentScreen = () => sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
  version: 2,
  step: 12,
  values: { ...ANSWERS, meatType: 'Свинина', name: 'Борщ дня', price: '200', weight: '350', comment: '' },
  context: CONTEXT,
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 7 }));
  placesAPI.search.mockResolvedValue([]);
  placesAPI.create.mockResolvedValue({ id: 'p-new' });
  borschAPI.create.mockResolvedValue({ id_borsch: 'b-new' });
});

test('the third new borshch of the day: the stop instead of the flow, asked about «a new one»', async () => {
  commentsAPI.today.mockResolvedValue({ count: 2, limit: 2, remaining: 0, already_rated: false });
  renderAdd();
  expect(await screen.findByRole('heading', { name: 'Сьогодні вже два Борщі' })).toBeInTheDocument();
  expect(screen.getByText('Наступний оціниш завтра.')).toBeInTheDocument();
  expect(commentsAPI.today).toHaveBeenCalledWith(null);
  expect(placesAPI.create).not.toHaveBeenCalled();
});

test('the check fails (an older backend): the flow as today', async () => {
  commentsAPI.today.mockRejectedValue(Object.assign(new Error('404'), { status: 404 }));
  renderAdd();
  expect(await screen.findByRole('heading', { name: 'Покажи свій Борщ' })).toBeInTheDocument();
  expect(screen.queryByTestId('daily-limit')).not.toBeInTheDocument();
});

test('429 at the save: the stop, the draft kept with what was created, nothing «не вдалося»', async () => {
  commentsAPI.today.mockResolvedValue({ count: 1, limit: 2, remaining: 1, already_rated: false });
  commentsAPI.createByBorschId.mockRejectedValue(Object.assign(new Error('limit'), { status: 429, code: 'daily_limit', data: { code: 'daily_limit', limit: 2 } }));
  onCommentScreen();
  const user = userEvent.setup();
  renderAdd();
  await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
  expect(await screen.findByRole('heading', { name: 'Сьогодні вже два Борщі' })).toBeInTheDocument();
  expect(screen.getByText('Наступний оціниш завтра. Почате не загубиться, поки відкрита ця вкладка.')).toBeInTheDocument();
  expect(screen.queryByText('Не вдалося зберегти')).not.toBeInTheDocument();
  // the venue and the borshch are made; the draft remembers them, so tomorrow makes no twins
  const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
  expect(draft.progress).toMatchObject({ placeId: 'p-new', borschId: 'b-new', reviewDone: false });
});

test('the server updated an earlier rating: the note and no coins', async () => {
  localStorage.setItem('nb_xp', '50');
  commentsAPI.today.mockResolvedValue({ count: 0, limit: 2, remaining: 2, already_rated: false });
  commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1', updated: true });
  onCommentScreen();
  const user = userEvent.setup();
  renderAdd();
  await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
  expect(await screen.findByTestId('review-updated')).toBeInTheDocument();
  expect(screen.getByText('+0 BRSH')).toBeInTheDocument();
  expect(localStorage.getItem('nb_xp')).toBe('50');
});
