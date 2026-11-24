import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { borschAPI } from '../../api';
import { BorschPage } from './BorschPage';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api');
  return { ...actual, borschAPI: { ...actual.borschAPI, getById: jest.fn() } };
});
jest.mock('../../hook/useMediaQuery', () => ({ useMediaQuery: () => false }));
jest.mock('../../components/FotoBorschGallary', () => ({ FotoBorschGallary: () => null }));
jest.mock('../../components/RouteButton', () => ({ RouteButton: () => null }));
// SVG icons (CRA's svgr stub predates React 19) are not what this test is about
jest.mock('./TasteProfile', () => ({ TasteProfile: () => null }));
jest.mock('../../components/RatingIconsSvg', () => ({ RatingIconsSvg: () => null }));

/**
 * NAV-228: Борщ злили з його двійником. Старе посилання (картка, сторіс, Стіл)
 * несе його id: API відповідає 301 на той, у який злили, і сторінка відкриває його.
 */

const GLEK = { id: 'p-glek', name: 'Глек', city: 'Київ', address: 'вулиця Велика Житомирська, 6' };
const KEPT = { id_borsch: 'b-old', place_id: 'p-glek', name: 'Справжній київський борщ з грибами та мʼясною пампушкою', photo_urls: [], overall_rating: '9.2', price: '', weight: '' };
const mockBorsch = { loading: false, getBorschById: (id) => (id === 'b-old' ? KEPT : undefined) };
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));
jest.mock('../../context/PlacesContext', () => ({
  usePlaces: () => ({ loading: false, getPlaceById: (id) => (id === 'p-glek' ? GLEK : undefined), setSelectedPlaceId: () => {} }),
}));
jest.mock('../../context/CommentsContext', () => ({ useComments: () => ({ getCommentsByBorschId: () => [] }) }));
jest.mock('../../context/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: async () => {} }) }));

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const open = (id) => render(
  <I18nProvider>
    <UserProvider>
      <MemoryRouter initialEntries={[`/borsch/${id}`]}>
        <Routes>
          <Route path="/borsch/:borschId" element={<><BorschPage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </UserProvider>
  </I18nProvider>
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  borschAPI.getById.mockReset();
});

test('the id of a merged twin opens the borshch it went into', async () => {
  borschAPI.getById.mockResolvedValue({ ...KEPT });
  open('b-twin');
  expect(await screen.findByText(KEPT.name)).toBeInTheDocument();
  expect(screen.getByTestId('where')).toHaveTextContent('/borsch/b-old');
  expect(borschAPI.getById).toHaveBeenCalledWith('b-twin');
});

test('an id nobody knows still says not found', async () => {
  borschAPI.getById.mockRejectedValue(Object.assign(new Error('404'), { status: 404 }));
  open('b-gone');
  expect(await screen.findByText('Борщ не знайдено')).toBeInTheDocument();
  expect(screen.getByTestId('where')).toHaveTextContent('/borsch/b-gone');
});

test('a borshch on the map opens at once, without asking the API', async () => {
  open('b-old');
  expect(await screen.findByText(KEPT.name)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Інша назва в меню?' })).toBeInTheDocument();
  expect(borschAPI.getById).not.toHaveBeenCalled();
});
