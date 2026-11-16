import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { emptyAnswers } from '../QuestFlow/answers';
import { RateFlow, rateStepCount } from './RateFlow';

jest.mock('../GoogleAuth', () => ({
  GoogleAuth: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess({ credential: 'google-id-token' })}>
      Продовжити з Google
    </button>
  ),
}));

/**
 * A guest used to be able to answer every question and only then be told
 * "Не вдалося зберегти": the API refuses an anonymous POST /reviews/, and the
 * work went with it. The flow must ask for an account BEFORE it ever tries to
 * save.
 */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
});

const renderFlow = (props = {}) =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <UserProvider>
          <RateFlow
            answers={emptyAnswers()}
            onAnswer={() => {}}
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
            placeName="Ватра"
            {...props}
          />
        </UserProvider>
      </I18nProvider>
    </MemoryRouter>
  );

const screens = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuemax'));

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
    const user = userEvent.setup();
    const onSignIn = jest.fn().mockResolvedValue(undefined);
    // a restored draft that already stands on the comment, «Загалом» answered
    renderFlow({ onSignIn, answers: { ...emptyAnswers(), overall: 8 }, initialStep: 8 });

    expect(screen.getByRole('heading', { name: 'Коментар' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    const googleCta = await screen.findByRole('button', { name: /Продовжити з Google/i });
    await user.click(googleCta);

    await waitFor(() =>
      expect(onSignIn).toHaveBeenCalledWith({ credential: 'google-id-token' })
    );
  });

  it('adds a sign-in step for a guest, so the save is never attempted anonymously', () => {
    renderFlow();
    // photo + six parts + «Загалом» + comment + sign-in
    expect(screens()).toBe(10);
  });

  it('drops the sign-in step once an account is present', () => {
    signIn();
    renderFlow();
    expect(screens()).toBe(9);
  });

  it('does not treat a stale auth flag with no token as signed in', () => {
    // exactly the state that produced the 400: flag set, both tokens gone
    localStorage.setItem('auth', 'true');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u' }));
    renderFlow();
    expect(screens()).toBe(10);
  });

  it('keeps a session active when only its refresh token remains', () => {
    signInWithRefreshOnly();
    renderFlow();
    expect(screens()).toBe(9);
  });
});

/**
 * The photo used to sit second from the end, after all the questions about
 * the meal, so the app asked for a picture when there was nothing left to
 * photograph. Reported from the table: "не зміг додати фото, бо вже зʼїв борщ".
 */
describe('the photo is asked for while there is still a borsch to photograph', () => {
  it('opens on the photo, not on a question about the meal', () => {
    renderFlow();
    expect(screen.getByRole('heading', { name: 'Покажи свій Борщ' })).toBeInTheDocument();
    expect(screen.getByText('Необовʼязково')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'М’ясо' })).not.toBeInTheDocument();
  });

  it('says when to take it, so the first step does not read as a demand', () => {
    renderFlow();
    expect(screen.getByText(/поки не взяв ложку/i)).toBeInTheDocument();
  });

  it('is still skippable: nobody is blocked by not having a photo', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole('button', { name: /Пропустити/i }));
    expect(await screen.findByRole('heading', { name: 'М’ясо' })).toBeInTheDocument();
  });

  it('shows which borshch is being rated, with its venue', () => {
    renderFlow();
    expect(screen.getByText('Борщ')).toBeInTheDocument();
    expect(screen.getByText(/· Ватра/)).toBeInTheDocument();
  });
});

describe('RateFlow for a bowl (moment 2)', () => {
  it('skips the photo screen when the bowl already brought a photo', () => {
    renderFlow({ withPhotoStep: false });
    expect(screen.getByRole('heading', { name: 'М’ясо' })).toBeInTheDocument();
    expect(screen.queryByText('Покажи свій Борщ')).not.toBeInTheDocument();
  });

  it('counts its screens for a picker in front of it', () => {
    // photo + 7 + comment + done; sign-in when needed
    expect(rateStepCount({ withPhoto: true, needsSignIn: false })).toBe(10);
    expect(rateStepCount({ withPhoto: false, needsSignIn: true })).toBe(10);
    expect(rateStepCount({ withPhoto: true, needsSignIn: true })).toBe(11);
  });
});
