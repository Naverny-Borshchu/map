import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { borschAPI, commentsAPI, placesAPI } from '../../api';
import { createDraft, getDraft, updateDraft } from '../../services/bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from '../../services/bowlPhotoStore';
import { BowlRatePage } from './BowlRatePage';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api');
  return {
    ...actual,
    commentsAPI: { createByBorschId: jest.fn() },
    borschAPI: { getById: jest.fn(), getByPlaceId: jest.fn(), create: jest.fn(), uploadPhoto: jest.fn(), confirmFacts: jest.fn(), update: jest.fn() },
    placesAPI: { create: jest.fn() },
  };
});
const mockBorsch = {
  getBorschById: () => undefined,
  getBorschExploration: (b) => (b && !b.rating_count && b.community_review_count === 0 ? 'virgin' : 'confirmed'),
  loadBorschData: jest.fn(async () => {}),
};
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));
jest.mock('../../context/CommentsContext', () => ({ useComments: () => ({ syncWithServer: async () => {} }) }));
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => ({ getPlaceById: () => undefined }) }));

/**
 * Moment 2 of a bowl whose venue came from Google Places and whose borshch was
 * typed in by name: both are created right before the rating, then the
 * photo goes onto the new borshch and the facts it lacks are asked.
 */

const GOOGLE = { googlePlaceId: 'g-new', name: 'Криївка', address: 'пл. Ринок, 14', city: 'Львів', country: 'Україна', location: { lat: 49.8419, lng: 24.0322 } };
// Оцінювання 3.0 answers, as a draft keeps them (sessionDraft version 2)
const ANSWERS = { meat_amount: 2, meat_taste: 3, beet_amount: 2, beet_flavor: 3, density: 5, salt: 5, sides: ['sour_cream'], serving_taste: 3, aftertaste: 3, overall: 4 };

const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 7 }));
};

const renderRate = (bowlId) =>
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={[`/bowl/${bowlId}/rate`]}>
          <Routes>
            <Route path="/bowl/:bowlId/rate" element={<BowlRatePage />} />
          </Routes>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('lang', 'uk');
  setPhotoStoreForTests(createMemoryPhotoStore());
  track.mockClear();
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
  [commentsAPI.createByBorschId, borschAPI.getByPlaceId, borschAPI.getById, borschAPI.create, borschAPI.update, borschAPI.uploadPhoto, placesAPI.create].forEach((f) => f.mockReset());
});

test('a new venue and a new borshch are created at the rating, and the photo lands on the new borshch', async () => {
  signIn();
  const photo = new File([new Uint8Array([0xff, 0xd8, 1])], 'bowl.jpg', { type: 'image/jpeg' });
  const bowl = await createDraft({
    place: { id: null, name: 'Криївка', city: 'Львів', google: GOOGLE },
    borsch: { id: null, name: 'Борщ з квасолею' },
    photoMode: 'now',
    photos: [photo],
  });
  // the answers are there already (a reload in the middle of moment 2)
  sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify({ version: 2, step: 7, values: { answers: ANSWERS, comment: '' } }));
  placesAPI.create.mockResolvedValue({ id: 'p-new', reused: false });
  borschAPI.getByPlaceId.mockResolvedValue([]);
  borschAPI.create.mockResolvedValue({ id_borsch: 'b-new', name: 'Борщ з квасолею', place_id: 'p-new', type_meat: 'other', price: '', weight: '', price_value: 0, weight_value: 0 });
  borschAPI.update.mockResolvedValue({ id_borsch: 'b-new', type_meat: 'pork' });
  commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1' });
  borschAPI.uploadPhoto.mockResolvedValue({});

  const user = userEvent.setup();
  renderRate(bowl.id);
  // nobody rated a borshch that did not exist: Першовар
  expect(await screen.findByRole('heading', { name: 'Коментар' })).toBeInTheDocument();
  expect(screen.getByText('Борщ з квасолею')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Надіслати' }));

  await waitFor(() => expect(commentsAPI.createByBorschId).toHaveBeenCalledWith('b-new', expect.objectContaining({
    scheme: 3, overall_rating: 4, meat_amount: 2, salt: 5, sides: ['sour_cream'],
  })));
  expect(placesAPI.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Криївка', google_place_id: 'g-new', via: 'bowl' }));
  expect(borschAPI.create).toHaveBeenCalledWith({ name: 'Борщ з квасолею', place_id: 'p-new', type_meat: 'other' });
  await waitFor(() => expect(borschAPI.uploadPhoto).toHaveBeenCalledWith('b-new', expect.any(File)));
  await waitFor(() => expect(getDraft(bowl.id)).toBeNull());
  expect(track).toHaveBeenCalledWith('bowl_rated', expect.objectContaining({ borsch_id: 'b-new', new_borsch: true }));
  // the new card has neither price nor weight: both «only if missing» questions
  expect(await screen.findByText('Скільки грамів була порція?')).toBeInTheDocument();
  expect(screen.getByText('Скільки коштував Борщ?')).toBeInTheDocument();
  // and the meat, which the bowl never asked: the creator sets it once
  expect(screen.getByText('Яке мʼясо в «Борщ з квасолею»?')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Свинина' }));
  expect(borschAPI.update).toHaveBeenCalledWith('b-new', { type_meat: 'pork' });
});

test('a bowl that rated a borshch already on the map asks no meat', async () => {
  signIn();
  const bowl = await createDraft({ place: { id: null, name: 'Криївка', google: GOOGLE }, borsch: { id: null, name: 'борщ  ЧЕРВОНИЙ' } });
  sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify({ version: 2, step: 8, values: { answers: ANSWERS, comment: '' } }));
  placesAPI.create.mockResolvedValue({ id: 'p-new', reused: true });
  borschAPI.getByPlaceId.mockResolvedValue([{ id_borsch: 'b-old', name: 'Борщ червоний' }]);
  borschAPI.getById.mockResolvedValue({ id_borsch: 'b-old', name: 'Борщ червоний', type_meat: 'other', price: '', weight: '' });
  commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1' });

  const user = userEvent.setup();
  renderRate(bowl.id);
  await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
  await waitFor(() => expect(commentsAPI.createByBorschId).toHaveBeenCalledWith('b-old', expect.anything()));
  expect(await screen.findByText('Скільки грамів була порція?')).toBeInTheDocument();
  expect(screen.queryByTestId('meat-question')).not.toBeInTheDocument();
  expect(borschAPI.create).not.toHaveBeenCalled();
});

test('reopened after a failed rating, the bowl still knows it created the borshch and asks the meat', async () => {
  signIn();
  // what ensureBowlTargets left in the bowl before the rating failed
  const bowl = await createDraft({ place: { id: 'p-new', name: 'Криївка' }, borsch: { id: 'b-new', name: 'Борщ дня' } });
  updateDraft(bowl.id, { borsch: { id: 'b-new', name: 'Борщ дня', created: true } });
  sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify({ version: 2, step: 8, values: { answers: ANSWERS, comment: '' } }));
  borschAPI.getById.mockResolvedValue({ id_borsch: 'b-new', name: 'Борщ дня', type_meat: 'other', price: '', weight: '' });
  commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1' });

  const user = userEvent.setup();
  renderRate(bowl.id);
  await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
  expect(await screen.findByText('Яке мʼясо в «Борщ дня»?')).toBeInTheDocument();
  expect(borschAPI.create).not.toHaveBeenCalled();
});

test('a failed rating keeps the created ids in the bowl: the retry creates nothing twice', async () => {
  signIn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const bowl = await createDraft({ place: { id: null, name: 'Криївка', google: GOOGLE }, borsch: { id: null, name: 'Борщ дня' } });
  sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify({ version: 2, step: 8, values: { answers: ANSWERS, comment: '' } }));
  placesAPI.create.mockResolvedValue({ id: 'p-new', reused: true });
  borschAPI.getByPlaceId.mockResolvedValue([]);
  borschAPI.create.mockResolvedValue({ id_borsch: 'b-new', name: 'Борщ дня', price: '', weight: '' });
  commentsAPI.createByBorschId.mockRejectedValueOnce(new Error('500')).mockResolvedValue({ id: 'r1' });

  const user = userEvent.setup();
  renderRate(bowl.id);
  await user.click(await screen.findByRole('button', { name: 'Надіслати' }));
  await user.click(await screen.findByRole('button', { name: 'Спробувати ще раз' }));
  await waitFor(() => expect(commentsAPI.createByBorschId).toHaveBeenCalledTimes(2));
  expect(placesAPI.create).toHaveBeenCalledTimes(1);
  expect(borschAPI.create).toHaveBeenCalledTimes(1);
  expect(commentsAPI.createByBorschId.mock.calls.map(([id]) => id)).toEqual(['b-new', 'b-new']);
  console.error.mockRestore();
});

// Оцінювання 3.0: a draft of the old seven scores (draft version 1) opened on
// the comment screen with keys the new flow does not know. It is dropped: the
// rating starts at its first part, and the old draft is gone from the session.
test('a draft of the old seven scores is dropped: the rating starts again at its first part', async () => {
  signIn();
  const bowl = await createDraft({ place: { id: 'p1', name: 'Криївка' }, borsch: { id: 'b1', name: 'Борщ дня' } });
  const key = `nb:quest-draft:bowl:${bowl.id}`;
  sessionStorage.setItem(key, JSON.stringify({ version: 1, step: 8, values: { grades: { meat: 8, salt: 10, overall: 9 }, comment: 'старе' } }));
  borschAPI.getById.mockResolvedValue({ id_borsch: 'b1', name: 'Борщ дня', type_meat: 'pork', price: '', weight: '' });

  renderRate(bowl.id);
  // no photo was taken: the rating opens on its first screen, not on the old comment step
  expect(await screen.findByRole('heading', { name: 'Покажи свій Борщ' })).toBeInTheDocument();
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(key)).version).toBe(2));
  const stored = JSON.parse(sessionStorage.getItem(key));
  expect(stored.values.answers.overall).toBeNull();
  expect(stored.values.comment).toBe('');
  expect(stored.values).not.toHaveProperty('grades');
});

// NAV-218: a photo from a regular user waits for the AI check. The server
// answers 202 pending: the photo is sent (no retry, no «не вдалося»), the
// closing screen says it is being checked, and the bowl is done with it.
describe('the photo of a rated bowl, 202 pending or 201 published', () => {
  const rateWithPhoto = async (uploadReply) => {
    signIn();
    // CRA resets mock implementations between tests; the context's is async
    mockBorsch.loadBorschData.mockImplementation(async () => {});
    const photo = new File([new Uint8Array([0xff, 0xd8, 1])], 'bowl.jpg', { type: 'image/jpeg' });
    const bowl = await createDraft({
      place: { id: 'p1', name: 'Криївка' },
      borsch: { id: 'b1', name: 'Борщ дня' },
      photoMode: 'now',
      photos: [photo],
    });
    sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify({ version: 2, step: 7, values: { answers: ANSWERS, comment: '' } }));
    borschAPI.getById.mockResolvedValue({ id_borsch: 'b1', name: 'Борщ дня', type_meat: 'pork', price: '', weight: '', photo_urls: [] });
    commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1' });
    uploadReply(borschAPI.uploadPhoto);

    const user = userEvent.setup();
    renderRate(bowl.id);
    expect(await screen.findByRole('heading', { name: 'Коментар' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() => expect(borschAPI.uploadPhoto).toHaveBeenCalledWith('b1', expect.any(File)));
    return { bowl, user };
  };

  test('202 pending: sent, said to be checked, no retry, and the bowl is done', async () => {
    const { bowl } = await rateWithPhoto((upload) => upload.mockResolvedValue({
      photo_id: 'ph-1', status: 'pending', message: 'Фото на перевірці: зʼявиться, щойно переконаємось, що на ньому Борщ.',
    }));
    expect(await screen.findByTestId('photo-pending')).toHaveTextContent(
      'Фото на перевірці: зʼявиться, щойно переконаємось, що на ньому Борщ.'
    );
    expect(screen.queryByText(/фото не завантажилось/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Спробувати ще раз' })).not.toBeInTheDocument();
    expect(screen.queryByText('Фото завантажено')).not.toBeInTheDocument();
    await waitFor(() => expect(getDraft(bowl.id)).toBeNull());
    expect(borschAPI.uploadPhoto).toHaveBeenCalledTimes(1);
  });

  test('201 photo_url (staff, an older backend): published, nothing about a check', async () => {
    const { bowl } = await rateWithPhoto((upload) => upload.mockResolvedValue({ photo_url: '/media/borsches/b1/photos/x.jpg' }));
    await waitFor(() => expect(getDraft(bowl.id)).toBeNull());
    expect(await screen.findByText('Скільки грамів була порція?')).toBeInTheDocument();
    expect(screen.queryByTestId('photo-pending')).not.toBeInTheDocument();
    expect(screen.queryByText(/фото не завантажилось/i)).not.toBeInTheDocument();
  });

  test('a failed photo retried into 202: the failure goes, the check is said instead of «Фото завантажено»', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { bowl, user } = await rateWithPhoto((upload) => upload
      .mockRejectedValueOnce(Object.assign(new Error('HTTP error! status: 502'), { status: 502 }))
      .mockResolvedValue({ photo_id: 'ph-2', status: 'pending', message: '' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Оцінку збережено, але фото не завантажилось: 1 з 1.');
    // the photo exists nowhere else: the bowl keeps it until it is sent
    expect(getDraft(bowl.id)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
    expect(await screen.findByTestId('photo-pending')).toHaveTextContent('Фото на перевірці');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Фото завантажено')).not.toBeInTheDocument();
    await waitFor(() => expect(getDraft(bowl.id)).toBeNull());
    expect(borschAPI.uploadPhoto).toHaveBeenCalledTimes(2);
    console.error.mockRestore();
  });
});
