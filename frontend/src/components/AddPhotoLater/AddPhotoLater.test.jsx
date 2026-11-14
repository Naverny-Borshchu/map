import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { AddPhotoLater } from './AddPhotoLater';

jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/** «Фото пізніше» in «Мої відгуки»: the photo goes to the borshch that was rated. */

const pic = (name) => new File([new Uint8Array([0xff, 0xd8, 1])], name, { type: 'image/jpeg' });

const renderBtn = (upload) =>
  render(
    <I18nProvider>
      <AddPhotoLater borschId="b1" upload={upload} />
    </I18nProvider>
  );

beforeEach(() => {
  localStorage.setItem('lang', 'uk');
  track.mockClear();
});

test('opens the photo library, not the camera, and uploads each picture to the borshch', async () => {
  const upload = jest.fn().mockResolvedValue({});
  const refreshed = jest.fn();
  window.addEventListener('borschDataUpdated', refreshed);
  renderBtn(upload);

  expect(screen.getByRole('button', { name: 'Додати фото' })).toBeInTheDocument();
  const input = screen.getByTestId('add-photo-b1');
  expect(input).not.toHaveAttribute('capture');
  fireEvent.change(input, { target: { files: [pic('a.jpg'), pic('b.jpg')] } });

  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  expect(upload.mock.calls.map(([id, f]) => [id, f.name])).toEqual([['b1', 'a.jpg'], ['b1', 'b.jpg']]);
  await waitFor(() => expect(refreshed).toHaveBeenCalled());
  expect(track).toHaveBeenCalledWith('photo_added_later', { borsch_id: 'b1', count: 2, failed: 0 });
  window.removeEventListener('borschDataUpdated', refreshed);
});

test('reports a failed upload instead of pretending', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const upload = jest.fn().mockRejectedValue(new Error('413'));
  const toast = jest.fn();
  window.addEventListener('nb:toast', toast);
  renderBtn(upload);
  fireEvent.change(screen.getByTestId('add-photo-b1'), { target: { files: [pic('a.jpg')] } });
  await waitFor(() => expect(toast).toHaveBeenCalled());
  expect(toast.mock.calls[0][0].detail.message).toBe('Фото не завантажилось: 1 з 1. Спробуй ще раз.');
  window.removeEventListener('nb:toast', toast);
  console.error.mockRestore();
});
