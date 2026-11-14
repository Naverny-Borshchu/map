import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { tipsAPI } from '../../api/tips';
import { MyTips } from './MyTips';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../api/tips', () => {
  const actual = jest.requireActual('../../api/tips');
  return { ...actual, tipsAPI: { mine: jest.fn() } };
});
const mockFilters = { focusMap: jest.fn() };
const mockPlaces = { selectPlace: jest.fn() };
jest.mock('../../context/FiltersContext', () => ({ useFilters: () => mockFilters }));
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => mockPlaces }));

/** «Мої підказки» in the profile: every tip, any state; a row opens the map there. */

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const renderMine = () =>
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<MyTips />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
const tip = (id, status, extra = {}) => ({
  id, status, note: '', confirmations: 0, created_at: '2026-11-14T13:00:00+02:00',
  place: { id: `p-${id}`, name: `Заклад ${id}`, city: 'Київ', latitude: 50.4, longitude: 30.5 }, ...extra,
});

beforeEach(() => {
  localStorage.setItem('lang', 'uk');
  tipsAPI.mine.mockReset();
  mockFilters.focusMap.mockClear();
  mockPlaces.selectPlace.mockClear();
});

test('nothing for a person who never left a tip', async () => {
  tipsAPI.mine.mockResolvedValue([]);
  const { container } = renderMine();
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(container).toBeEmptyDOMElement();
});

test('lists every tip with its state, and a row opens the map at that venue', async () => {
  tipsAPI.mine.mockResolvedValue([
    tip('a', 'open', { note: 'У меню щодня' }),
    tip('b', 'confirmed', { confirmations: 2 }),
    tip('c', 'converted'),
    tip('d', 'gone'),
  ]);
  const user = userEvent.setup();
  renderMine();
  expect(await screen.findByRole('heading', { name: 'Мої підказки' })).toBeInTheDocument();
  expect(screen.getByText('«У меню щодня»')).toBeInTheDocument();
  ['Ще не перевірено', 'Підтверджено', 'Уже оцінено', 'Вже нема'].forEach((s) => expect(screen.getByText(s)).toBeInTheDocument());
  expect(screen.getByText(/2 людини підтвердили/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Заклад b/ }));
  expect(mockPlaces.selectPlace).toHaveBeenCalledWith('p-b');
  expect(mockFilters.focusMap).toHaveBeenCalledWith(50.4, 30.5, 16);
  expect(screen.getByTestId('where')).toHaveTextContent('/');
});

test('a failed read shows nothing rather than an error in the profile', async () => {
  tipsAPI.mine.mockRejectedValue(new Error('offline'));
  const { container } = renderMine();
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(container).toBeEmptyDOMElement();
});
