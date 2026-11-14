import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { borschAPI, commentsAPI, placesAPI } from '../../api';
import { createDraft, getDraft } from '../../services/bowlDrafts';
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
['meat', 'beetroot', 'vegetable', 'salt', 'aftertaste', 'serving'].forEach((name) => {
  jest.mock(`../EvaluationsPage/${name}.svg`, () => ({ ReactComponent: () => null }));
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
const GRADES = { meat: 4, beetroot: 4, density: 4, salt: 4, aftertaste: 4, serving: 4, overall: 4 };

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
  [commentsAPI.createByBorschId, borschAPI.getByPlaceId, borschAPI.create, borschAPI.uploadPhoto, placesAPI.create].forEach((f) => f.mockReset());
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
  // the seven answers are there already (a reload in the middle of moment 2)
  sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify({ version: 1, step: 7, values: { grades: GRADES, comment: '' } }));
  placesAPI.create.mockResolvedValue({ id: 'p-new', reused: false });
  borschAPI.getByPlaceId.mockResolvedValue([]);
  borschAPI.create.mockResolvedValue({ id_borsch: 'b-new', name: 'Борщ з квасолею', place_id: 'p-new', price: '', weight: '', price_value: 0, weight_value: 0 });
  commentsAPI.createByBorschId.mockResolvedValue({ id: 'r1' });
  borschAPI.uploadPhoto.mockResolvedValue({});

  const user = userEvent.setup();
  renderRate(bowl.id);
  // nobody rated a borshch that did not exist: Першовар
  expect(await screen.findByText(/Борщ з квасолею · Крок 8/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Готово' }));

  await waitFor(() => expect(commentsAPI.createByBorschId).toHaveBeenCalledWith('b-new', expect.objectContaining({ overall_rating: 4 })));
  expect(placesAPI.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Криївка', google_place_id: 'g-new', via: 'bowl' }));
  expect(borschAPI.create).toHaveBeenCalledWith({ name: 'Борщ з квасолею', place_id: 'p-new', type_meat: 'other' });
  await waitFor(() => expect(borschAPI.uploadPhoto).toHaveBeenCalledWith('b-new', expect.any(File)));
  await waitFor(() => expect(getDraft(bowl.id)).toBeNull());
  expect(track).toHaveBeenCalledWith('bowl_rated', expect.objectContaining({ borsch_id: 'b-new', new_borsch: true }));
  // the new card has neither price nor weight: both «only if missing» questions
  expect(await screen.findByText('Скільки грамів була порція?')).toBeInTheDocument();
  expect(screen.getByText('Скільки коштував Борщ?')).toBeInTheDocument();
});

test('a failed rating keeps the created ids in the bowl: the retry creates nothing twice', async () => {
  signIn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const bowl = await createDraft({ place: { id: null, name: 'Криївка', google: GOOGLE }, borsch: { id: null, name: 'Борщ дня' } });
  sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify({ version: 1, step: 8, values: { grades: GRADES, comment: '' } }));
  placesAPI.create.mockResolvedValue({ id: 'p-new', reused: true });
  borschAPI.getByPlaceId.mockResolvedValue([]);
  borschAPI.create.mockResolvedValue({ id_borsch: 'b-new', name: 'Борщ дня', price: '', weight: '' });
  commentsAPI.createByBorschId.mockRejectedValueOnce(new Error('500')).mockResolvedValue({ id: 'r1' });

  const user = userEvent.setup();
  renderRate(bowl.id);
  await user.click(await screen.findByRole('button', { name: 'Готово' }));
  await user.click(await screen.findByRole('button', { name: 'Спробувати ще раз' }));
  await waitFor(() => expect(commentsAPI.createByBorschId).toHaveBeenCalledTimes(2));
  expect(placesAPI.create).toHaveBeenCalledTimes(1);
  expect(borschAPI.create).toHaveBeenCalledTimes(1);
  expect(commentsAPI.createByBorschId.mock.calls.map(([id]) => id)).toEqual(['b-new', 'b-new']);
  console.error.mockRestore();
});
