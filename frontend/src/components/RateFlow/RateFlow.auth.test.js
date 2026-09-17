import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { RateFlow } from './RateFlow';
import { googleAuth, persistGoogleAuthSession } from '../../services/googleAuth';

jest.mock('../QuestFlow', () => ({
  XP_PER_STEP: 10,
  QuestFlow: ({ onSignIn }) => (
    <button type="button" onClick={() => onSignIn({ credential: 'google-id-token' })}>
      Complete Google auth
    </button>
  ),
}));

jest.mock('../../services/googleAuth', () => ({
  googleAuth: jest.fn(),
  persistGoogleAuthSession: jest.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  googleAuth.mockReset();
  persistGoogleAuthSession.mockReset();
});

test('uses the auth response contract and persists JWTs before resuming', async () => {
  const user = userEvent.setup();
  const response = {
    access: 'access-token',
    refresh: 'refresh-token',
    user: { id: 7, username: 'guest-now-user' },
    profile: { id: 9 },
  };
  googleAuth.mockResolvedValue(response);

  render(
    <I18nProvider>
      <UserProvider>
        <RateFlow
          criteria={[]}
          grades={{}}
          onGrade={() => {}}
          comment=""
          onComment={() => {}}
          photos={[]}
          onPhotos={() => {}}
          onSubmit={() => {}}
          onExit={() => {}}
          saving={false}
          isSent={false}
          error=""
          borschName="Борщ"
        />
      </UserProvider>
    </I18nProvider>
  );

  await user.click(screen.getByRole('button', { name: 'Complete Google auth' }));
  await waitFor(() => expect(persistGoogleAuthSession).toHaveBeenCalledWith(response));
  expect(googleAuth).toHaveBeenCalledWith('google-id-token');
  expect(localStorage.getItem('auth')).toBe('true');
});
