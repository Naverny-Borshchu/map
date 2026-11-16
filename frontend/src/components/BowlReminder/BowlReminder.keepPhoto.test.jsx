import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { borschAPI } from '../../api';
import { createDraft, listDrafts } from '../../services/bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from '../../services/bowlPhotoStore';
import { BowlReminder } from './BowlReminder';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api', () => ({ borschAPI: { uploadPhoto: jest.fn() } }));

/**
 * Stage 1 follow-up: «Не оцінюватиму» on a bowl that has a photo, from a
 * person who is signed in, first asks «Лишити фото на картці Борщу?». Most
 * borshch on the map have no photo, and this one is of an untouched bowl.
 */

const MIN = 60 * 1000;
const photo = () => new File(['jpeg'], 'bowl.jpg', { type: 'image/jpeg' });

const renderBanner = () =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <BowlReminder />
      </MemoryRouter>
    </I18nProvider>
  );

const dueBowl = (photos) => createDraft({
  place: { id: 'p1', name: 'Ватра', city: 'Київ' },
  borsch: { id: 'b1', name: 'Борщ український' },
  photoMode: photos.length ? 'now' : 'later',
  photos,
}, Date.now() - 25 * MIN);

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  setPhotoStoreForTests(createMemoryPhotoStore());
  track.mockClear();
  borschAPI.uploadPhoto.mockReset();
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
});

describe('«Не оцінюватиму» with a photo', () => {
  it('signed in: «Так, лишити» puts the photo on the borshch, then drops the bowl', async () => {
    signIn();
    borschAPI.uploadPhoto.mockResolvedValue({ photo_url: '/media/x.jpg' });
    await dueBowl([photo()]);
    const user = userEvent.setup();
    renderBanner();
    await user.click(await screen.findByRole('button', { name: 'Не оцінюватиму' }));

    expect(screen.getByText('Лишити фото на картці Борщу?')).toBeInTheDocument();
    expect(listDrafts()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Так, лишити' }));

    await waitFor(() => expect(listDrafts()).toEqual([]));
    expect(borschAPI.uploadPhoto).toHaveBeenCalledTimes(1);
    expect(borschAPI.uploadPhoto.mock.calls[0][0]).toBe('b1');
    expect(track).toHaveBeenCalledWith('bowl_photo_kept', expect.objectContaining({ borsch_id: 'b1', photos: 1, failed: 0 }));
    expect(track).toHaveBeenCalledWith('bowl_reminder', expect.objectContaining({ action: 'drop_keep_photo' }));
  });

  it('signed in: «Ні, прибрати» drops the bowl and its photo, nothing uploaded', async () => {
    signIn();
    await dueBowl([photo()]);
    const user = userEvent.setup();
    renderBanner();
    await user.click(await screen.findByRole('button', { name: 'Не оцінюватиму' }));
    await user.click(screen.getByRole('button', { name: 'Ні, прибрати' }));
    await waitFor(() => expect(listDrafts()).toEqual([]));
    expect(borschAPI.uploadPhoto).not.toHaveBeenCalled();
  });

  it('a photo that does not upload keeps the bowl: the shot exists nowhere else', async () => {
    signIn();
    borschAPI.uploadPhoto.mockRejectedValue(Object.assign(new Error('413'), { status: 413 }));
    await dueBowl([photo()]);
    const user = userEvent.setup();
    renderBanner();
    await user.click(await screen.findByRole('button', { name: 'Не оцінюватиму' }));
    await user.click(screen.getByRole('button', { name: 'Так, лишити' }));
    await waitFor(() => expect(borschAPI.uploadPhoto).toHaveBeenCalled());
    expect(listDrafts()).toHaveLength(1);
    expect(screen.getByText('Лишити фото на картці Борщу?')).toBeInTheDocument();
  });

  it('not signed in, or no photo: drops at once, as before', async () => {
    await dueBowl([photo()]);
    const user = userEvent.setup();
    const { unmount } = renderBanner();
    await user.click(await screen.findByRole('button', { name: 'Не оцінюватиму' }));
    expect(screen.queryByText('Лишити фото на картці Борщу?')).not.toBeInTheDocument();
    expect(listDrafts()).toEqual([]);
    unmount();

    signIn();
    await dueBowl([]);
    renderBanner();
    await user.click(await screen.findByRole('button', { name: 'Не оцінюватиму' }));
    expect(screen.queryByText('Лишити фото на картці Борщу?')).not.toBeInTheDocument();
    expect(listDrafts()).toEqual([]);
  });
});

// NAV-218: «Фото вже на картці Борщу» is true for 201 only; a 202 photo waits
// for the AI check, and the toast says so. Either way the bowl goes.
describe('«Так, лишити»: 202 pending or 201 published', () => {
  const keep = async (reply) => {
    signIn();
    reply(borschAPI.uploadPhoto);
    await dueBowl([photo()]);
    const toast = jest.fn();
    window.addEventListener('nb:toast', toast);
    const user = userEvent.setup();
    renderBanner();
    await user.click(await screen.findByRole('button', { name: 'Не оцінюватиму' }));
    await user.click(screen.getByRole('button', { name: 'Так, лишити' }));
    await waitFor(() => expect(listDrafts()).toEqual([]));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    window.removeEventListener('nb:toast', toast);
    return toast.mock.calls[toast.mock.calls.length - 1][0].detail.message;
  };

  it('202 pending: the bowl goes and the photo is said to be checked', async () => {
    const message = await keep((u) => u.mockResolvedValue({ photo_id: 'ph-1', status: 'pending', message: '' }));
    expect(message).toBe('Фото на перевірці: зʼявиться, щойно переконаємось, що на ньому Борщ.');
    expect(track).toHaveBeenCalledWith('bowl_photo_kept', expect.objectContaining({ failed: 0, pending: 1 }));
  });

  it('201 photo_url: «Фото вже на картці Борщу», as before', async () => {
    const message = await keep((u) => u.mockResolvedValue({ photo_url: '/media/x.jpg' }));
    expect(message).toBe('Фото вже на картці Борщу, миску прибрано');
    expect(track).toHaveBeenCalledWith('bowl_photo_kept', expect.objectContaining({ failed: 0, pending: 0 }));
  });
});
