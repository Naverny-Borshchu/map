import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { createDraft, getDraft, listDrafts } from '../../services/bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from '../../services/bowlPhotoStore';
import { MyBowls, bowlAge } from './MyBowls';

jest.mock('react-router-dom', () => require('react-router'));

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
