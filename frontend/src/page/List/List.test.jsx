import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { commentsAPI } from '../../api';
import { List } from './List';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../api', () => ({ commentsAPI: { getMine: jest.fn() }, borschAPI: { uploadPhoto: jest.fn() } }));
const BORSCH = [
  { id_borsch: 'b1', name: 'Борщ дня', place_id: 'p1', overall_rating: 8.1 },
  { id_borsch: 'b2', name: 'Борщ зелений', place_id: 'p1', overall_rating: 7.0 },
];
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => ({ getAllBorsch: async () => BORSCH }) }));
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => ({ getPlaceById: () => ({ name: 'Ватра' }) }) }));
jest.mock('../../context/UserContext', () => ({ useUser: () => ({ isAuthenticated: true }) }));
jest.mock('../../context/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: jest.fn() }) }));
jest.mock('../../components/BorschTile', () => ({
  BorschTile: ({ borsch }) => <div data-testid="tile">{`${borsch.name}: ${borsch.overall_rating}`}</div>,
}));

/**
 * «Мої відгуки», one rating per person per borshch (11.2026): a second rating
 * updates the first, and older accounts may still hold two reviews of one
 * borshch from before the rule. The list shows each borshch once, with the
 * newest score (the API answers newest first, ReviewViewSet orders by
 * -created_at).
 */

test('each borshch once, with the newest of my scores', async () => {
  localStorage.setItem('lang', 'uk');
  commentsAPI.getMine.mockResolvedValue([
    { id: 'r3', id_borsch: 'b1', overall_rating: '9', created_at: '2026-11-17T10:00:00Z' },
    { id: 'r2', id_borsch: 'b2', overall_rating: '6', created_at: '2026-11-16T10:00:00Z' },
    { id: 'r1', id_borsch: 'b1', overall_rating: '5', created_at: '2026-11-10T10:00:00Z' },
  ]);
  render(<I18nProvider><MemoryRouter><List /></MemoryRouter></I18nProvider>);
  const tiles = await screen.findAllByTestId('tile');
  expect(tiles.map((n) => n.textContent)).toEqual(['Борщ дня: 9', 'Борщ зелений: 6']);
});

test('the newest by its date, whatever order the API answers in', async () => {
  localStorage.setItem('lang', 'uk');
  commentsAPI.getMine.mockResolvedValue([
    { id: 'r1', id_borsch: 'b1', overall_rating: '5', created_at: '2026-11-10T10:00:00Z' },
    { id: 'r3', id_borsch: 'b1', overall_rating: '9', created_at: '2026-11-17T10:00:00Z' },
  ]);
  render(<I18nProvider><MemoryRouter><List /></MemoryRouter></I18nProvider>);
  const tiles = await screen.findAllByTestId('tile');
  expect(tiles.map((n) => n.textContent)).toEqual(['Борщ дня: 9']);
});
