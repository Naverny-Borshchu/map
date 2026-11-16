import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { borschAPI } from '../../api';
import { NewBorschPrompt } from './NewBorschPrompt';

jest.mock('../../api', () => ({ borschAPI: { uploadPhoto: jest.fn() }, placesAPI: {} }));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/**
 * The tasting's «Додай фото» for the borshch the table put on the map
 * (NAV-218): a regular user's photo waits for the AI check, so the server
 * answers 202 pending. The photo is sent all the same: the borshch is done in
 * the prompt, nothing says «не вдалося», and the toast says it is being
 * checked. Staff (201 photo_url) get «Фото додано», as before.
 */

const RESULTS = {
  status: 'closed',
  borsches: [
    { borsch: { id: 'b1', name: 'Червоний', photo_urls: ['/media/a.jpg'] } },
    { borsch: { id: 'b2', name: 'Зелений', photo_urls: [] } },
  ],
};
const pic = () => new File([new Uint8Array([0xff, 0xd8, 1])], 'green.jpg', { type: 'image/jpeg' });

const sendPhoto = async (reply) => {
  borschAPI.uploadPhoto.mockReset();
  reply(borschAPI.uploadPhoto);
  const toast = jest.fn();
  window.addEventListener('nb:toast', toast);
  render(
    <I18nProvider>
      <NewBorschPrompt code="K7M2QX" results={RESULTS} />
    </I18nProvider>
  );
  const card = screen.getByTestId('new-borsch-prompt');
  expect(within(card).getByText('Зелений')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('add-photo-b2'), { target: { files: [pic()] } });
  await waitFor(() => expect(toast).toHaveBeenCalled());
  window.removeEventListener('nb:toast', toast);
  return toast.mock.calls[0][0].detail.message;
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  localStorage.setItem('access', 'a');
  localStorage.setItem('nb:table-host:K7M2QX', JSON.stringify({ newNames: ['Зелений'], prompted: false }));
});

test('202 pending: the photo is sent, the borshch is done in the prompt, the toast says it is being checked', async () => {
  const message = await sendPhoto((u) => u.mockResolvedValue({ photo_id: 'ph-1', status: 'pending', message: '' }));
  expect(message).toBe('Фото на перевірці: зʼявиться, щойно переконаємось, що на ньому Борщ.');
  expect(borschAPI.uploadPhoto).toHaveBeenCalledWith('b2', expect.any(File));
  // the only new borshch is done: the prompt is gone and will not come back
  await waitFor(() => expect(screen.queryByTestId('new-borsch-prompt')).not.toBeInTheDocument());
  const record = JSON.parse(localStorage.getItem('nb:table-host:K7M2QX'));
  expect(record).toMatchObject({ done: ['b2'], prompted: true });
});

test('201 photo_url (staff): «Фото додано до Борщу», the borshch done the same way', async () => {
  const message = await sendPhoto((u) => u.mockResolvedValue({ photo_url: '/media/b.jpg' }));
  expect(message).toBe('Фото додано до Борщу');
  await waitFor(() => expect(screen.queryByTestId('new-borsch-prompt')).not.toBeInTheDocument());
});

test('a failed upload keeps the borshch in the prompt and says so', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const message = await sendPhoto((u) => u.mockRejectedValue(new Error('502')));
  expect(message).toBe('Фото не завантажилось: 1 з 1. Спробуй ще раз.');
  expect(screen.getByTestId('new-borsch-prompt')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('nb:table-host:K7M2QX')).done || []).toEqual([]);
  console.error.mockRestore();
});
