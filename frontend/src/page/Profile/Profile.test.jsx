import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { Profile } from './Profile';
import { useMediaQuery } from '../../hook/useMediaQuery';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children),
    useNavigate: () => jest.fn(),
  };
}, { virtual: true });
jest.mock('../../assets/icons/arrow_back.svg', () => ({ ReactComponent: () => null }));
jest.mock('../../hook/useMediaQuery', () => ({
  useMediaQuery: jest.fn(),
}));
jest.mock('../PersonalInfo', () => ({ PersonalInfo: () => null }));
jest.mock('../AddedBorschesPage', () => ({ AddedBorschesPage: () => null }));
jest.mock('../PasswordChangePage', () => ({ PasswordChangePage: () => null }));
// «Мої миски» is a section of its own with its own test (MyBowls.test.jsx).
// It uses the router, and the partial virtual router mock above does not reach
// it on CI («Cannot find module 'react-router/dom'»), so it is stubbed like the
// other sections.
jest.mock('../../components/MyBowls', () => ({ MyBowls: () => null }));
// «Мої Столи» likewise: its own test, and here it would ask the API for tables.
jest.mock('../../components/MyTables', () => ({ MyTables: () => null }));
jest.mock('../../components/ModalLogout', () => {
  const React = require('react');
  return {
    ModalLogout: () => React.createElement('div', { role: 'dialog' }, 'logout confirmation'),
  };
});

const renderProfile = (desktop) => {
  useMediaQuery.mockReturnValue(desktop);
  localStorage.setItem('lang', 'uk');
  localStorage.setItem('userProfile', JSON.stringify({
    name: 'Тестова користувачка',
    email: 'test@example.com',
  }));

  render(
    <I18nProvider>
      <UserProvider>
        <Profile />
      </UserProvider>
    </I18nProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

it.each([
  ['mobile', false],
  ['desktop', true],
])('opens logout confirmation from the %s profile', (_viewport, desktop) => {
  renderProfile(desktop);

  fireEvent.click(screen.getByRole('button', { name: /вийти з акаунту/i }));

  expect(screen.getByRole('dialog')).toHaveTextContent('logout confirmation');
});
