import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { borschAPI } from '../../api';
import { track } from '../../analytics';
import { FactsQuestion } from './FactsQuestion';

jest.mock('../../api', () => ({ borschAPI: { getById: jest.fn(), update: jest.fn() } }));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/**
 * After the rating is saved: one optional question about whatever the card is
 * missing, saved only into empty fields.
 */

const NO_WEIGHT = { id_borsch: 'b1', weight: '', price: '≈185 ₴' };
const NOTHING = { id_borsch: 'b1', weight: '', price: '' };
const FULL = { id_borsch: 'b1', weight: '400 g.', price: '≈185 ₴' };

const renderQ = (borsch) =>
  render(
    <I18nProvider>
      <FactsQuestion borsch={borsch} context={{ from_bowl: true }} />
    </I18nProvider>
  );

beforeEach(() => {
  localStorage.setItem('lang', 'uk');
  borschAPI.getById.mockReset();
  borschAPI.update.mockReset();
  track.mockClear();
});

test('asks only about the weight when the price is there', () => {
  renderQ(NO_WEIGHT);
  expect(screen.getByText('Скільки грамів була порція?')).toBeInTheDocument();
  expect(screen.queryByText('Скільки коштував Борщ?')).not.toBeInTheDocument();
  // the add flow's chips: no bare 200 or 300
  const chips = screen.getAllByRole('button').map((b) => b.textContent);
  expect(chips).toEqual(['250 г', '280 г', '350 г', '400 г', '500 г', 'Не знаю']);
});

test('asks nothing about a borshch that has both', () => {
  const { container } = renderQ(FULL);
  expect(container).toBeEmptyDOMElement();
});

test('«Не знаю» to the only question closes it without writing', async () => {
  const user = userEvent.setup();
  const { container } = renderQ(NO_WEIGHT);
  await user.click(screen.getByRole('button', { name: 'Не знаю' }));
  expect(container).toBeEmptyDOMElement();
  expect(borschAPI.update).not.toHaveBeenCalled();
});

test('saves the chosen weight into the empty field only', async () => {
  const user = userEvent.setup();
  borschAPI.getById.mockResolvedValue(NO_WEIGHT);
  borschAPI.update.mockResolvedValue({});
  renderQ(NO_WEIGHT);
  await user.click(screen.getByRole('button', { name: '350 г' }));
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await waitFor(() => expect(screen.getByText('Дякуємо! Записали на картку Борщу.')).toBeInTheDocument());
  expect(borschAPI.update).toHaveBeenCalledWith('b1', { weight: 350 });
  expect(track).toHaveBeenCalledWith('bowl_weight_added', { borsch_id: 'b1', weight_grams: 350, from_bowl: true });
});

test('a price somebody added meanwhile is not overwritten', async () => {
  const user = userEvent.setup();
  // the card had neither; by the time of saving the price is there
  borschAPI.getById.mockResolvedValue(NO_WEIGHT);
  borschAPI.update.mockResolvedValue({});
  renderQ(NOTHING);
  await user.click(screen.getByRole('button', { name: '280 г' }));
  await user.click(screen.getByRole('button', { name: '160 грн' }));
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  await waitFor(() => expect(borschAPI.update).toHaveBeenCalledTimes(1));
  expect(borschAPI.update).toHaveBeenCalledWith('b1', { weight: 280 });
  expect(track).not.toHaveBeenCalledWith('bowl_price_added', expect.anything());
});

test('says so when the save fails, and the rating is untouched', async () => {
  const user = userEvent.setup();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  borschAPI.getById.mockRejectedValue(new Error('offline'));
  renderQ(NO_WEIGHT);
  await user.click(screen.getByRole('button', { name: '250 г' }));
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося зберегти. Спробуй ще раз.');
  console.error.mockRestore();
});
