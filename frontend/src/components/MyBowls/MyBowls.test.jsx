import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { borschAPI } from '../../api';
import { createDraft, getDraft, listDrafts, updateDraft } from '../../services/bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from '../../services/bowlPhotoStore';
import { MyBowls, bowlAge } from './MyBowls';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../api', () => ({ borschAPI: { uploadPhoto: jest.fn() } }));

/** «Мої миски» in the profile: every bowl still waiting, with its actions. */

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const renderMine = () =>
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="*" element={<><MyBowls /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  setPhotoStoreForTests(createMemoryPhotoStore());
  URL.createObjectURL = jest.fn(() => 'blob:qa');
  URL.revokeObjectURL = jest.fn();
});

test('renders nothing when no bowl is waiting', () => {
  renderMine();
  expect(screen.queryByRole('heading', { name: 'Мої миски' })).not.toBeInTheDocument();
});

test('lists each bowl and opens its rating', async () => {
  const user = userEvent.setup();
  const now = Date.now();
  const a = await createDraft({ place: { id: 'p1', name: 'Ватра' }, borsch: { id: 'b1', name: 'Борщ український' } }, now - 25 * 60000);
  await createDraft({ place: { id: 'p2', name: 'Пузата хата' }, borsch: { id: 'b2', name: 'Борщ' } }, now - 2 * 60000);
  renderMine();

  expect(screen.getByRole('heading', { name: 'Мої миски' })).toBeInTheDocument();
  const venues = screen.getAllByText(/^(Ватра|Пузата хата)$/).map((n) => n.textContent);
  expect(venues).toEqual(['Пузата хата', 'Ватра']);
  expect(screen.getByText(/Борщ український · 25 хв тому · без фото/)).toBeInTheDocument();

  await user.click(screen.getAllByRole('button', { name: 'Оцінити' })[1]);
  expect(screen.getByTestId('where')).toHaveTextContent(`/bowl/${a.id}/rate`);
});

test('adds a photo to a bowl and removes one', async () => {
  const user = userEvent.setup();
  const d = await createDraft({ place: { id: 'p1', name: 'Ватра' }, borsch: { id: 'b1', name: 'Борщ' } });
  const { container } = renderMine();

  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], 'late.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(getDraft(d.id).photoCount).toBe(1));
  await waitFor(() => expect(screen.getByText(/1 фото/)).toBeInTheDocument());

  window.confirm = jest.fn(() => true);
  await user.click(screen.getByRole('button', { name: 'Прибрати' }));
  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(listDrafts()).toEqual([]));
});

test('says how long ago the borshch was brought', () => {
  const t = (key, v) => ({ 'bowl.justNow': 'щойно', 'bowl.agoMinutes': `${v?.n} хв тому`, 'bowl.agoHours': `${v?.n} год тому` }[key]);
  const now = Date.UTC(2026, 10, 14, 15, 0);
  expect(bowlAge(now - 20 * 1000, now, t)).toBe('щойно');
  expect(bowlAge(now - 25 * 60000, now, t)).toBe('25 хв тому');
  expect(bowlAge(now - 3 * 3600000, now, t)).toBe('3 год тому');
  expect(bowlAge(now - 30 * 3600000, now, t, 'uk')).toMatch(/13\u00a0листопада/);
});

// NAV-218: a rated bowl whose photo did not reach the server, sent from here.
// 202 pending is sent all the same (the bowl goes), but it is not on the card
// yet, so the toast says it is being checked instead of «Фото додано».
describe('«Завантажити фото» of a rated bowl, 202 pending or 201 published', () => {
  const sendFromMine = async (reply) => {
    const d = await createDraft({
      place: { id: 'p1', name: 'Ватра' },
      borsch: { id: 'b1', name: 'Борщ' },
      photoMode: 'now',
      photos: [new File([new Uint8Array([0xff, 0xd8])], 'bowl.jpg', { type: 'image/jpeg' })],
    });
    updateDraft(d.id, { reviewedAt: Date.now() });
    borschAPI.uploadPhoto.mockReset();
    reply(borschAPI.uploadPhoto);
    const toast = jest.fn();
    window.addEventListener('nb:toast', toast);
    const user = userEvent.setup();
    renderMine();
    await user.click(await screen.findByRole('button', { name: 'Завантажити фото' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    window.removeEventListener('nb:toast', toast);
    return { d, detail: toast.mock.calls[0][0].detail };
  };

  test('202 pending: the bowl goes, the toast says the photo is being checked', async () => {
    const { d, detail } = await sendFromMine((u) => u.mockResolvedValue({ photo_id: 'ph-1', status: 'pending', message: '' }));
    expect(detail.message).toBe('Фото на перевірці: зʼявиться, щойно переконаємось, що на ньому Борщ.');
    // a sentence to read: it stays longer than a short confirmation
    expect(detail.ms).toBeGreaterThan(3200);
    expect(borschAPI.uploadPhoto).toHaveBeenCalledWith('b1', expect.any(File));
    await waitFor(() => expect(getDraft(d.id)).toBeNull());
  });

  test('201 photo_url: the bowl goes, «Фото додано до Борщу» as before', async () => {
    const { d, detail } = await sendFromMine((u) => u.mockResolvedValue({ photo_url: '/media/x.jpg' }));
    expect(detail.message).toBe('Фото додано до Борщу');
    await waitFor(() => expect(getDraft(d.id)).toBeNull());
  });

  test('a failure keeps the bowl and says so', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { d, detail } = await sendFromMine((u) => u.mockRejectedValue(new Error('502')));
    expect(detail.message).toBe('Фото не завантажилось: 1 з 1. Спробуй ще раз.');
    expect(getDraft(d.id)).not.toBeNull();
    console.error.mockRestore();
  });
});
