import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { Layout } from '../Layout/Layout';
import { useMediaQuery } from '../../hook/useMediaQuery';
import { track } from '../../analytics';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../page/MapPage', () => ({ MapPage: () => null }));
jest.mock('../../page/ListPage', () => ({ ListPage: () => null }));
jest.mock('../../page/BorschPage', () => ({ BorschPage: () => null }));
jest.mock('../../page/EvaluationsPage', () => ({ EvaluationsPage: () => null }));
jest.mock('../Filters/Filters', () => ({ Filters: () => null }));
jest.mock('../Map/Map', () => ({ MODES: { MOVE: 0, SET_MARKER: 1 } }));
jest.mock('../../hook/useMediaQuery', () => ({ useMediaQuery: jest.fn() }));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/**
 * «Додати борщ» in the middle of the tab bar (and on top of the desktop
 * sidebar) opens a chooser with three ways in, the bowl first.
 */

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
};

// Phone only: the desktop shell renders SVG components that CRA's jest
// transform builds for an older React (the same limit as Layout.test.jsx).
// The desktop sidebar opens the same component; the QA screenshots cover it.
const renderApp = () => {
  useMediaQuery.mockReturnValue(false);
  localStorage.setItem('lang', 'uk');
  localStorage.setItem('nb-intro-done', '1');
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={['/']}>
          <Layout><Where /></Layout>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  track.mockClear();
});

const openChooser = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Додати борщ' }));
  return screen.getByRole('dialog', { name: 'Борщ на столі?' });
};

describe('add chooser', () => {
  it('offers the bowl first, then rating, the table, the tip, then adding', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openChooser(user);
    const options = within(dialog).getAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Закрити');
    expect(options.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Мені принесли Борщ'),
      expect.stringContaining('Оцінити Борщ, який уже скуштував'),
      expect.stringContaining('Ми зібрались компанією'),
      expect.stringContaining('Я знаю, тут є Борщ'),
      expect.stringContaining('Додати новий Борщ'),
    ]);
  });

  it.each([
    ['Мені принесли Борщ', '/bowl/new?from=chooser', 'brought'],
    ['Оцінити Борщ, який уже скуштував', '/bowl/new?mode=rate&from=chooser', 'rate'],
    ['Ми зібрались компанією', '/table/new?from=chooser', 'table'],
    ['Я знаю, тут є Борщ', '/tip/new?from=chooser', 'tip'],
    ['Додати новий Борщ', '/add-borsch', 'add'],
  ])('«%s» goes to %s', async (label, path, choice) => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openChooser(user);
    await user.click(within(dialog).getByRole('button', { name: new RegExp(label) }));
    expect(screen.getByTestId('where')).toHaveTextContent(path);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('add_chooser_pick', { choice });
  });

  it('closes on the cross and on Escape without going anywhere', async () => {
    const user = userEvent.setup();
    renderApp();
    let dialog = await openChooser(user);
    await user.click(within(dialog).getByRole('button', { name: 'Закрити' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    dialog = await openChooser(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });
});
