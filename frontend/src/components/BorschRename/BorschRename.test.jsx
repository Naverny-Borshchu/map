import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { borschAPI } from '../../api';
import { BorschRename, renameErrorKey } from './BorschRename';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api');
  return { ...actual, borschAPI: { ...actual.borschAPI, rename: jest.fn() } };
});

/** NAV-228: «Інша назва в меню?» на картці Борщу. */

const OLD = 'Справжній київський борщ з м‘ясною пампушкою';
const MENU = 'Справжній київський борщ з грибами та мʼясною пампушкою';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const renderIt = () => render(
  <I18nProvider>
    <UserProvider>
      <MemoryRouter initialEntries={['/borsch/b-old']}>
        <Routes>
          <Route path="/borsch/:id" element={<BorschRename borschId="b-old" name={OLD} />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </UserProvider>
  </I18nProvider>
);

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 5 }));
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  borschAPI.rename.mockReset();
});

const proposeMenuName = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Інша назва в меню?' }));
  const field = screen.getByRole('textbox', { name: 'Як цей Борщ називається в меню?' });
  expect(field).toHaveValue(OLD);
  await user.clear(field);
  await user.type(field, `${MENU}  `);
  await user.click(screen.getByRole('button', { name: 'Надіслати' }));
};

test('a guest is taken to sign in first', async () => {
  const user = userEvent.setup();
  renderIt();
  await user.click(screen.getByRole('button', { name: 'Інша назва в меню?' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/register');
  expect(borschAPI.rename).not.toHaveBeenCalled();
});

test('a person proposes the menu name and is told AI checks it', async () => {
  signIn();
  borschAPI.rename.mockResolvedValue({ status: 'pending', name: MENU, check_id: 'c1' });
  const user = userEvent.setup();
  renderIt();
  await proposeMenuName(user);
  expect(borschAPI.rename).toHaveBeenCalledWith('b-old', MENU);
  expect(await screen.findByText('Дякуємо!')).toBeInTheDocument();
  expect(screen.getByText(/Нову назву перевіряє AI/)).toBeInTheDocument();
});

test('a moderator renames at once and the map reloads the card', async () => {
  signIn();
  borschAPI.rename.mockResolvedValue({ status: 'renamed', borsch: { id_borsch: 'b-old', name: MENU } });
  const reload = jest.fn();
  window.addEventListener('borschDataUpdated', reload);
  const user = userEvent.setup();
  renderIt();
  await proposeMenuName(user);
  expect(await screen.findByText('Назву змінено')).toBeInTheDocument();
  expect(reload).toHaveBeenCalledTimes(1);
  window.removeEventListener('borschDataUpdated', reload);
});

test('the API says why a name is not taken', async () => {
  signIn();
  borschAPI.rename.mockRejectedValue(Object.assign(new Error('x'), { status: 400, code: 'same' }));
  const user = userEvent.setup();
  renderIt();
  await proposeMenuName(user);
  expect(await screen.findByRole('alert')).toHaveTextContent('Це та сама назва.');
  expect(screen.getByRole('button', { name: 'Надіслати' })).toBeEnabled();
});

test('error codes map to their lines', () => {
  expect(renameErrorKey({ code: 'too_short' })).toBe('rename.errShort');
  expect(renameErrorKey({ code: 'too_long' })).toBe('rename.errLong');
  expect(renameErrorKey({ status: 429 })).toBe('rename.errTooMany');
  expect(renameErrorKey(new Error('offline'))).toBe('rename.errFailed');
});
