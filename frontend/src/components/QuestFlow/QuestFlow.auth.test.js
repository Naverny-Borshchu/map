import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { QuestFlow } from './QuestFlow';

jest.mock('../GoogleAuth', () => ({
  GoogleAuth: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess({ credential: 'google-id-token' })}>
      Google test
    </button>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
});

test('successful auth resumes the final step and submits exactly once', async () => {
  const onSubmit = jest.fn();
  const onSignIn = jest.fn(async () => {
    localStorage.setItem('auth', 'true');
    localStorage.setItem('access', 'header.payload.signature');
  });

  render(
    <I18nProvider>
      <QuestFlow
        steps={[
          { type: 'signin', key: 'signin', i18n: 'flow.signinTitle' },
          { type: 'done', key: 'done' },
        ]}
        values={{}}
        onChange={() => {}}
        onSignIn={onSignIn}
        onSubmit={onSubmit}
        onRetry={onSubmit}
        onExit={() => {}}
        status={{ saving: false, sent: true, error: '' }}
        done={{ title: 'done', text: '', cta: 'ok' }}
      />
    </I18nProvider>
  );

  expect(onSubmit).not.toHaveBeenCalled();
  userEvent.click(screen.getByRole('button', { name: 'Google test' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSignIn).toHaveBeenCalledWith({ credential: 'google-id-token' });
});

test('restores the persisted current step instead of starting over', () => {
  render(
    <I18nProvider>
      <QuestFlow
        steps={[
          { type: 'comment', key: 'comment', i18n: 'flow.commentTitle' },
          { type: 'signin', key: 'signin', i18n: 'flow.signinTitle' },
          { type: 'done', key: 'done' },
        ]}
        values={{ comment: 'draft' }}
        initialStep={1}
        onChange={() => {}}
        onExit={() => {}}
        status={{ saving: false, sent: false, error: '' }}
      />
    </I18nProvider>
  );

  expect(screen.getByText('Збережемо твій борщ?')).toBeInTheDocument();
  expect(screen.getByText(/КРОК 2 З 2/i)).toBeInTheDocument();
});
