import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { Layout } from './Layout';
import { useMediaQuery } from '../../hook/useMediaQuery';

// react-router-dom v7 pulls 'react-router/dom', which CRA's jest resolver
// cannot see (same workaround as PageviewTracker.test.jsx).
jest.mock('react-router-dom', () => require('react-router'));
// The map and the panels it can show are not what this test is about.
jest.mock('../../page/MapPage', () => ({ MapPage: () => null }));
jest.mock('../../page/ListPage', () => ({ ListPage: () => null }));
jest.mock('../../page/BorschPage', () => ({ BorschPage: () => null }));
jest.mock('../../page/EvaluationsPage', () => ({ EvaluationsPage: () => null }));
jest.mock('../../components/Filters/Filters', () => ({ Filters: () => null }));
jest.mock('../Map/Map', () => ({ MODES: { MOVE: 0, SET_MARKER: 1 } }));
jest.mock('../../hook/useMediaQuery', () => ({ useMediaQuery: jest.fn() }));

const renderAt = (path) => {
  useMediaQuery.mockReturnValue(false); // a phone
  localStorage.setItem('lang', 'uk');
  localStorage.setItem('nb-intro-done', '1');
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={[path]}>
          <Layout><div /></Layout>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );
  return screen.getByRole('navigation', { name: 'Головна навігація' });
};

beforeEach(() => localStorage.clear());

// NAV-203 (Andrii, 10.11.2026): the green «+» sat off-centre and above the
// bar, and «Помилка» sat among the tabs.
describe('bottom navigation (NAV-203)', () => {
  it('is three slots with «Додати борщ» in the middle one', () => {
    const nav = renderAt('/');
    const slots = within(nav).getAllByRole('listitem');
    expect(slots).toHaveLength(3);
    expect(within(slots[1]).getByRole('link', { name: 'Додати борщ' })).toHaveAttribute('href', '/add-borsch');
    expect(within(slots[0]).getByRole('link', { name: 'Показати списком' })).toHaveAttribute('href', '/list');
    expect(within(slots[2]).getByRole('link', { name: 'Ви' })).toHaveAttribute('href', '/profile');
  });

  it('no longer carries the bug report', () => {
    const nav = renderAt('/');
    expect(within(nav).queryByRole('button', { name: 'Повідомити про помилку' })).not.toBeInTheDocument();
    expect(within(nav).queryByText('Помилка')).not.toBeInTheDocument();
  });

  it('turns the first tab into the way back to the map on the list', () => {
    const nav = renderAt('/list');
    expect(within(nav).getByRole('link', { name: 'Показати на мапі' })).toHaveAttribute('href', '/');
  });
});
