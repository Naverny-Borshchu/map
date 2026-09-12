import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { RateFlow } from './RateFlow';

jest.mock('../GoogleAuth', () => ({
  GoogleAuth: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess({ credential: 'google-id-token' })}>
      Продовжити з Google
    </button>
  ),
}));

/**
 * A guest used to be able to answer all seven taste questions and only then be
 * told "Не вдалося зберегти" — the API refuses an anonymous POST /reviews/, and
 * seven screens of work went with it. The flow must ask for an account BEFORE
 * it ever tries to save.
 */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
});

const CRITERIA = [
  { key: 'meat', i18n: 'flow.q.meat' },
  { key: 'beetroot', i18n: 'flow.q.beetroot' },
];

const renderFlow = () =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <UserProvider>
          <RateFlow
            criteria={CRITERIA}
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
    </MemoryRouter>
  );

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u' }));
  localStorage.setItem('access', 'header.payload.signature');
};

const signInWithRefreshOnly = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u' }));
  localStorage.setItem('refresh', 'header.payload.signature');
};

describe('RateFlow account wall', () => {
  it('forwards the Google credential callback from the guest sign-in step', async () => {
    const onSignIn = jest.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
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
              onSignIn={onSignIn}
              saving={false}
              isSent={false}
              error=""
              borschName="Борщ"
            />
          </UserProvider>
        </I18nProvider>
      </MemoryRouter>
    );

    userEvent.click(screen.getByRole('button', { name: /Пропустити/i }));
    await screen.findByText(/Крок 2 з 3/i);
    userEvent.click(screen.getByRole('button', { name: /Пропустити/i }));
    const googleCta = await screen.findByRole('button', { name: /Продовжити з Google/i });
    userEvent.click(googleCta);

    await waitFor(() =>
      expect(onSignIn).toHaveBeenCalledWith({ credential: 'google-id-token' })
    );
  });

  it('adds a sign-in step for a guest, so the save is never attempted anonymously', () => {
    renderFlow();
    // 2 criteria + photo + comment + signin = 5 answerable steps
    expect(screen.getByText(/КРОК 1 З 5/i)).toBeInTheDocument();
  });

  it('drops the sign-in step once an account is present', () => {
    signIn();
    renderFlow();
    // 2 criteria + photo + comment = 4, no wall
    expect(screen.getByText(/КРОК 1 З 4/i)).toBeInTheDocument();
  });

  it('does not treat a stale auth flag with no token as signed in', () => {
    // exactly the state that produced the 400: flag set, both tokens gone
    localStorage.setItem('auth', 'true');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u' }));
    renderFlow();
    expect(screen.getByText(/КРОК 1 З 5/i)).toBeInTheDocument();
  });

  it('keeps a session active when only its refresh token remains', () => {
    signInWithRefreshOnly();
    renderFlow();
    expect(screen.getByText(/КРОК 1 З 4/i)).toBeInTheDocument();
  });
});
