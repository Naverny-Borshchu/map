import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserProvider, useUser } from './UserContext';

const SessionProbe = () => {
  const { isAuthenticated, logout } = useUser();
  return (
    <>
      <span>{isAuthenticated ? 'authenticated' : 'guest'}</span>
      <button onClick={logout}>logout</button>
    </>
  );
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('access', 'test-access');
  localStorage.setItem('refresh', 'test-refresh');
  localStorage.setItem('auth', 'true');
  localStorage.setItem('user', JSON.stringify({ id: 1 }));
  localStorage.setItem('userProfile', JSON.stringify({ id: 1 }));
});

it('moves the auth context to guest immediately when logout runs', async () => {
  render(
    <UserProvider>
      <SessionProbe />
    </UserProvider>
  );

  await screen.findByText('authenticated');
  fireEvent.click(screen.getByRole('button', { name: 'logout' }));

  await waitFor(() => expect(screen.getByText('guest')).toBeInTheDocument());
  expect(localStorage.getItem('access')).toBeNull();
  expect(localStorage.getItem('refresh')).toBeNull();
  expect(localStorage.getItem('auth')).toBeNull();
  expect(localStorage.getItem('userProfile')).toBeNull();
});
