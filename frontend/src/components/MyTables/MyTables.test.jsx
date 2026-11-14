import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { tablesAPI } from '../../api/tables';
import { MyTables } from './MyTables';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../api/tables', () => ({ tablesAPI: { listMine: jest.fn() } }));

/** «Мої Столи»: the tables I host, open ones marked, each a link to its screen. */

const renderMine = () =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <MyTables />
      </MemoryRouter>
    </I18nProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  tablesAPI.listMine.mockReset();
});

it('lists my tables with their status and links them', async () => {
  tablesAPI.listMine.mockResolvedValue([
    { code: 'K7M2QX', title: 'День Борщу', status: 'open', created_at: '2026-11-21T13:00:00+02:00', place: { name: 'Ватра', city: 'Львів' }, borsch_count: 3, review_count: 22 },
    { code: 'P4RT9Z', title: '', status: 'closed', created_at: '2026-11-14T13:00:00+02:00', place: { name: 'Пузата хата', city: 'Київ' }, borsch_count: 1, review_count: 1 },
  ]);
  renderMine();
  expect(await screen.findByRole('heading', { name: 'Мої дегустації' })).toBeInTheDocument();
  const [open, closed] = screen.getAllByRole('link');
  expect(open).toHaveAttribute('href', '/t/K7M2QX');
  expect(within(open).getByText('День Борщу')).toBeInTheDocument();
  expect(within(open).getByText('Триває')).toBeInTheDocument();
  expect(open).toHaveTextContent('Ватра · 21 листопада · 3 Борщі · 22 оцінки');
  expect(closed).toHaveAttribute('href', '/t/P4RT9Z');
  expect(within(closed).getByText('Пузата хата')).toBeInTheDocument();
  expect(within(closed).getByText('Завершена')).toBeInTheDocument();
  expect(closed).toHaveTextContent('1 Борщ · 1 оцінка');
});

it('is not there for someone who never hosted one, or when the list does not load', async () => {
  tablesAPI.listMine.mockResolvedValue([]);
  const { container, unmount } = renderMine();
  await new Promise((r) => setTimeout(r, 0));
  expect(container).toBeEmptyDOMElement();
  unmount();

  tablesAPI.listMine.mockRejectedValue(new Error('AUTH_REQUIRED'));
  const again = renderMine();
  await new Promise((r) => setTimeout(r, 0));
  expect(again.container).toBeEmptyDOMElement();
});
