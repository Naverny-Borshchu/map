import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { AddPhotoLater } from './AddPhotoLater';

jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/** «Фото пізніше» in «Мої відгуки»: the photo goes to the borshch that was rated. */

const pic = (name) => new File([new Uint8Array([0xff, 0xd8, 1])], name, { type: 'image/jpeg' });

const renderBtn = (upload, onUploaded) =>
  render(
    <I18nProvider>
      <AddPhotoLater borschId="b1" upload={upload} onUploaded={onUploaded} />
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
  expect(track).toHaveBeenCalledWith('photo_added_later', { borsch_id: 'b1', count: 2, failed: 0, pending: 0 });
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

// NAV-218: a regular user's photo waits for the AI check (202 pending). It is
// sent: no «не завантажилось», the caller hears it landed (the tasting prompt
// marks the borshch done), and the toast says it is being checked.
describe('202 pending or 201 published', () => {
  const send = async (reply, files, lang = 'uk') => {
    localStorage.setItem('lang', lang);
    const upload = jest.fn();
    reply(upload);
    const onUploaded = jest.fn();
    const toast = jest.fn();
    window.addEventListener('nb:toast', toast);
    renderBtn(upload, onUploaded);
    fireEvent.change(screen.getByTestId('add-photo-b1'), { target: { files } });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    window.removeEventListener('nb:toast', toast);
    return { onUploaded, detail: toast.mock.calls[0][0].detail };
  };
  const PENDING = { photo_id: 'ph-1', status: 'pending', message: '' };

  test('202 pending: sent, the toast says it is being checked, and the caller hears it landed', async () => {
    const { onUploaded, detail } = await send((u) => u.mockResolvedValue(PENDING), [pic('a.jpg')]);
    expect(detail.message).toBe('Фото на перевірці: зʼявиться, щойно переконаємось, що на ньому Борщ.');
    expect(onUploaded).toHaveBeenCalledWith(1);
    expect(track).toHaveBeenCalledWith('photo_added_later', { borsch_id: 'b1', count: 1, failed: 0, pending: 1 });
  });

  test('two photos waiting: the plural, in English too', async () => {
    const { detail } = await send((u) => u.mockResolvedValue(PENDING), [pic('a.jpg'), pic('b.jpg')], 'en');
    expect(detail.message).toBe('Your photos are being checked: they appear once we see borshch in them.');
  });

  test('one photo waiting, in English: the words of the spec', async () => {
    const { detail } = await send((u) => u.mockResolvedValue(PENDING), [pic('a.jpg')], 'en');
    expect(detail.message).toBe('Your photo is being checked: it appears once we see borshch in it.');
  });

  test('201 photo_url (staff): «Фото додано до Борщу», as before', async () => {
    const { onUploaded, detail } = await send((u) => u.mockResolvedValue({ photo_url: '/media/x.jpg' }), [pic('a.jpg')]);
    expect(detail.message).toBe('Фото додано до Борщу');
    expect(onUploaded).toHaveBeenCalledWith(1);
  });
});
