import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { QuestFlow } from './QuestFlow';

beforeEach(() => localStorage.setItem('lang', 'uk'));

// Starts directly on the closing screen, already saved, the way both flows
// leave it after a submit whose photos partly failed.
const renderDone = (status, onRetryPhotos = jest.fn()) => {
  render(
    <I18nProvider>
      <QuestFlow
        steps={[{ type: 'done', key: 'done' }]}
        values={{}}
        onChange={() => {}}
        onSubmit={() => {}}
        onExit={() => {}}
        onRetryPhotos={onRetryPhotos}
        status={{ saving: false, sent: true, error: '', ...status }}
        done={{ title: 'Борщ на мапі! 🎉', text: '', cta: 'До борщу' }}
      />
    </I18nProvider>
  );
  return onRetryPhotos;
};

test('says how many photos did not upload and offers to retry just those', async () => {
  const user = userEvent.setup();
  const retry = renderDone({ photosFailed: 3, photosTotal: 3 });

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Оцінку збережено, але фото не завантажилось: 3 з 3.'
  );
  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('the retry button is locked while the retry is running', () => {
  renderDone({ photosFailed: 1, photosTotal: 2, photoRetrying: true });
  expect(screen.getByRole('button', { name: 'Завантажуємо фото…' })).toBeDisabled();
});

test('a retry that lands everything says so instead of just going quiet', () => {
  const host = (status) => (
    <I18nProvider>
      <QuestFlow
        steps={[{ type: 'done', key: 'done' }]}
        values={{}}
        onChange={() => {}}
        onSubmit={() => {}}
        onExit={() => {}}
        onRetryPhotos={() => {}}
        status={{ saving: false, sent: true, error: '', photosTotal: 2, ...status }}
        done={{ title: 'ok', text: '', cta: 'ok' }}
      />
    </I18nProvider>
  );
  const { rerender } = render(host({ photosFailed: 2 }));
  rerender(host({ photosFailed: 0 }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Фото завантажено');
});

test('a clean save says nothing about photos', () => {
  renderDone({ photosFailed: 0, photosTotal: 2 });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Спробувати ще раз' })).not.toBeInTheDocument();
  expect(screen.queryByText('Фото завантажено ✅')).not.toBeInTheDocument();
});
