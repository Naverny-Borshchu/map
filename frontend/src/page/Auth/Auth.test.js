import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider, useUser } from '../../context/UserContext';
import { googleAuth } from '../../services/googleAuth';
import { Auth } from './Auth';

// CRA's jest cannot resolve react-router 7's package exports for react-router-dom; the repo maps it like this.
jest.mock('react-router-dom', () => require('react-router'));

// The real persistGoogleAuthSession runs: the bug was that storage and context disagreed, so both are checked.
jest.mock('../../services/googleAuth', () => ({
  ...jest.requireActual('../../services/googleAuth'),
  googleAuth: jest.fn(),
}));

const RESPONSE = {
  access: 'access-token',
  refresh: 'refresh-token',
  user: { id: 7, email: 'qa@example.invalid', name: 'Олена' },
  profile: { id: 9 },
};

// What the header and PrivateRoute read: the context, not localStorage.
const SessionProbe = () => {
  const { isAuthenticated } = useUser();
  return <p data-testid="session">{isAuthenticated ? 'signed-in' : 'guest'}</p>;
};

beforeEach(() => {
  localStorage.clear();
  googleAuth.mockReset();
  // Google Identity Services: initialize() hands us the callback, prompt() answers it like One Tap does.
  let callback = null;
  window.google = {
    accounts: {
      id: {
        initialize: ({ callback: cb }) => { callback = cb; },
        prompt: () => callback && callback({ credential: 'google-id-token' }),
      },
    },
  };
});

afterEach(() => {
  delete window.google;
});

test('a Google sign-in on /login signs the app in at once, without a reload', async () => {
  // map1, 14.11.2026: /auth/google/ answered 200, the success dialog showed, but the header still offered
  // «Увійти» and the next protected page bounced back to /login, because only localStorage was updated.
  const user = userEvent.setup();
  googleAuth.mockResolvedValue(RESPONSE);

  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={['/login']}>
          <SessionProbe />
          <Auth />
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );

  expect(screen.getByTestId('session')).toHaveTextContent('guest');

  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: /Google/ }));

  await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed-in'));
  expect(googleAuth).toHaveBeenCalledWith('google-id-token');
  expect(localStorage.getItem('access')).toBe('access-token');
  expect(localStorage.getItem('refresh')).toBe('refresh-token');
  expect(localStorage.getItem('auth')).toBe('true');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('a failed Google sign-in leaves the app signed out and says so', async () => {
  const user = userEvent.setup();
  googleAuth.mockRejectedValue(new Error('Google auth request failed'));
  jest.spyOn(console, 'error').mockImplementation(() => {});

  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={['/login']}>
          <SessionProbe />
          <Auth />
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );

  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: /Google/ }));

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByTestId('session')).toHaveTextContent('guest');
  expect(localStorage.getItem('access')).toBeNull();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  console.error.mockRestore();
});
