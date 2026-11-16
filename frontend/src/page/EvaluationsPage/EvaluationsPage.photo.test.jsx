import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { borschAPI, commentsAPI } from '../../api';
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
 * NAV-218, the card's own rating («Оцінити» on a borshch) with a photo. A
 * regular user's photo waits for the AI check: the server answers 202
 * pending. It is sent (no «не вдалося», no retry), the closing screen says it
 * is being checked, and the card's gallery is the server's photo_urls, which
 * do not have it. Staff and an older backend answer 201 photo_url, as before.
 */

const ANSWERS = { meat_amount: 2, meat_taste: 3, beet_amount: 2, beet_flavor: 3, density: 5, salt: 5, sides: ['sour_cream'], serving_taste: 3, aftertaste: 3, overall: 8 };
const BORSCH = { id_borsch: 'b1', name: 'Борщ дня', type_meat: 'pork', price: '200', weight: '350', photo_urls: ['/media/old.jpg'], rating_count: 3 };

const rateWithPhoto = async (reply, lang = 'uk') => {
  localStorage.setItem('lang', lang);
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 7 }));
  // a reload on the comment screen: the answers are in the draft, the photo is a prop
  sessionStorage.setItem('nb:quest-draft:rate:b1', JSON.stringify({ version: 2, step: 8, values: { answers: ANSWERS, comment: '' } }));
  mockBorsch.loadBorschData.mockImplementation(async () => {});
  borschAPI.getById.mockResolvedValue(BORSCH);
  commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1' });
  reply(borschAPI.uploadPhoto);
  const photo = new File([new Uint8Array([0xff, 0xd8, 1])], 'card.jpg', { type: 'image/jpeg' });
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter>
          <EvaluationsPage borschId="b1" initialPhotos={[photo]} />
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );
  await user.click(await screen.findByRole('button', { name: lang === 'en' ? 'Send' : 'Надіслати' }));
  await waitFor(() => expect(borschAPI.uploadPhoto).toHaveBeenCalledWith('b1', expect.any(File)));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
  [commentsAPI.createByBorschId, borschAPI.getById, borschAPI.uploadPhoto].forEach((f) => f.mockReset());
});

test('202 pending: the rating is saved, the photo is said to be checked, nothing to retry', async () => {
  await rateWithPhoto((u) => u.mockResolvedValue({ photo_id: 'ph-1', status: 'pending', message: '' }));
  expect(await screen.findByTestId('photo-pending')).toHaveTextContent(
    'Фото на перевірці: зʼявиться, щойно переконаємось, що на ньому Борщ.'
  );
  expect(commentsAPI.createByBorschId).toHaveBeenCalledWith('b1', expect.objectContaining({ scheme: 3, overall_rating: 8 }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Спробувати ще раз' })).not.toBeInTheDocument();
  expect(borschAPI.uploadPhoto).toHaveBeenCalledTimes(1);
});

test('202 pending, in English', async () => {
  await rateWithPhoto((u) => u.mockResolvedValue({ photo_id: 'ph-1', status: 'pending', message: '' }), 'en');
  expect(await screen.findByTestId('photo-pending')).toHaveTextContent(
    'Your photo is being checked: it appears once we see borshch in it.'
  );
});

test('201 photo_url (staff, an older backend): saved, nothing about a check', async () => {
  await rateWithPhoto((u) => u.mockResolvedValue({ photo_url: '/media/borsches/b1/photos/new.jpg' }));
  expect(await screen.findByRole('heading', { name: 'Дякуємо за відгук!' })).toBeInTheDocument();
  expect(screen.queryByTestId('photo-pending')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed photo is still «не завантажилось» with a retry, and the retry into 202 says the check', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await rateWithPhoto((u) => u
    .mockRejectedValueOnce(Object.assign(new Error('HTTP error! status: 502'), { status: 502 }))
    .mockResolvedValue({ photo_id: 'ph-2', status: 'pending', message: '' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Оцінку збережено, але фото не завантажилось: 1 з 1.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
  expect(await screen.findByTestId('photo-pending')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Фото завантажено')).not.toBeInTheDocument();
  console.error.mockRestore();
});
