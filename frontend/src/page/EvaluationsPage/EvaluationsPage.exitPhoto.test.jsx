import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { borschAPI, commentsAPI } from '../../api';
import { track } from '../../analytics';
import { EvaluationsPage } from './EvaluationsPage';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api');
  return {
    ...actual,
    commentsAPI: { createByBorschId: jest.fn() },
    borschAPI: { getById: jest.fn(), uploadPhoto: jest.fn(), confirmFacts: jest.fn(), update: jest.fn() },
  };
});
const mockBorsch = {
  getBorschById: () => undefined,
  getBorschExploration: () => 'confirmed',
  loadBorschData: jest.fn(async () => {}),
};
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));
jest.mock('../../context/CommentsContext', () => ({ useComments: () => ({ syncWithServer: async () => {} }) }));
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => ({ getPlaceById: () => undefined }) }));

/**
 * NAV-228. 24.11.2026 у «Глеку»: «Оцінити» на картці Борщу, на першому екрані
 * «Додати фото», фото вибрано, далі хрестик. Фото жило лише в памʼяті рейтингу
 * й пропало разом з ним; людина була певна, що його надіслала. Тепер хрестик
 * з вибраним фото питає, і «Надіслати фото й вийти» відправляє його до Борщу.
 */

const BORSCH = { id_borsch: 'b1', name: 'Справжній київський борщ', type_meat: 'no_meat', price: '189', weight: '350', photo_urls: [], rating_count: 1 };

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 5 }));
};

const openRatingWithPhoto = async () => {
  borschAPI.getById.mockResolvedValue(BORSCH);
  const photo = new File([new Uint8Array([0xff, 0xd8, 1])], 'glek.jpg', { type: 'image/jpeg' });
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={['/borsch/b1/evaluations']}>
          <Routes>
            <Route path="/borsch/:borschId/evaluations" element={<EvaluationsPage initialPhotos={[photo]} />} />
            <Route path="/borsch/:borschId" element={<p>Картка Борщу</p>} />
          </Routes>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );
  // the photo screen with the photo already picked, then on to the next screen, as on 24.11
  await user.click(await screen.findByRole('button', { name: 'Далі' }));
  await user.click(screen.getByRole('button', { name: 'Закрити' }));
  return user;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('lang', 'uk');
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
  [commentsAPI.createByBorschId, borschAPI.getById, borschAPI.uploadPhoto, track].forEach((f) => f.mockReset());
});

test('the cross with a picked photo asks, and «Надіслати фото й вийти» sends it to the borshch', async () => {
  signIn();
  borschAPI.uploadPhoto.mockResolvedValue({ photo_id: 'ph-1', status: 'pending', message: '' });
  const user = await openRatingWithPhoto();

  expect(screen.getByRole('dialog', { name: 'Вийти з оцінки?' })).toBeInTheDocument();
  expect(screen.getByTestId('exit-photo-note')).toHaveTextContent(
    'Фото ще не надіслане. Надішлемо його до Борщу зараз, а оцінку закінчиш пізніше.'
  );
  await user.click(screen.getByRole('button', { name: 'Надіслати фото й вийти' }));

  expect(await screen.findByText('Картка Борщу')).toBeInTheDocument();
  expect(borschAPI.uploadPhoto).toHaveBeenCalledTimes(1);
  expect(borschAPI.uploadPhoto).toHaveBeenCalledWith('b1', expect.any(File));
  expect(borschAPI.uploadPhoto.mock.calls[0][1].name).toBe('glek.jpg');
  // the rating itself is not sent: it stays a draft
  expect(commentsAPI.createByBorschId).not.toHaveBeenCalled();
  expect(track).toHaveBeenCalledWith('rate_exit_photos', { borsch_id: 'b1', count: 1, failed: 0, pending: 1 });
});

test('a failed send keeps the sheet open with a line about it, and a second try goes through', async () => {
  signIn();
  borschAPI.uploadPhoto.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
    .mockResolvedValueOnce({ photo_url: '/media/borsches/b1/photos/x.jpg' });
  const user = await openRatingWithPhoto();
  await user.click(screen.getByRole('button', { name: 'Надіслати фото й вийти' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Фото не надіслалось. Спробуй ще раз або вийди без фото.');
  expect(screen.getByRole('dialog', { name: 'Вийти з оцінки?' })).toBeInTheDocument();
  expect(screen.queryByText('Картка Борщу')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Надіслати фото й вийти' }));
  expect(await screen.findByText('Картка Борщу')).toBeInTheDocument();
  expect(borschAPI.uploadPhoto).toHaveBeenCalledTimes(2);
});

test('«Вийти без фото» leaves without sending anything', async () => {
  signIn();
  const user = await openRatingWithPhoto();
  await user.click(screen.getByRole('button', { name: 'Вийти без фото' }));
  expect(await screen.findByText('Картка Борщу')).toBeInTheDocument();
  expect(borschAPI.uploadPhoto).not.toHaveBeenCalled();
});

test('a guest is told the photo goes with the rating; there is nothing to send it with', async () => {
  const user = await openRatingWithPhoto();
  expect(screen.getByTestId('exit-photo-note')).toHaveTextContent(
    'Фото надсилається разом з оцінкою: якщо вийти зараз, воно не збережеться.'
  );
  expect(screen.queryByRole('button', { name: 'Надіслати фото й вийти' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Продовжити оцінку' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Закрити' }));
  await user.click(screen.getByRole('button', { name: 'Вийти без фото' }));
  expect(await screen.findByText('Картка Борщу')).toBeInTheDocument();
  expect(borschAPI.uploadPhoto).not.toHaveBeenCalled();
});
