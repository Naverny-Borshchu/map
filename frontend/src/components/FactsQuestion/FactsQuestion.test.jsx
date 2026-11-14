import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { borschAPI } from '../../api';
import { track } from '../../analytics';
import { FactsQuestion } from './FactsQuestion';

jest.mock('../../api', () => ({ borschAPI: { getById: jest.fn(), update: jest.fn(), confirmFacts: jest.fn() } }));
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
  borschAPI.confirmFacts.mockReset();
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


// --- «Ціна досі 330 грн?» ---------------------------------------------------

const OLD_PRICE = {
  id_borsch: 'b2', weight: '400 g.', price: '≈330 ₴',
  price_value: 330, weight_value: 400, price_needs_confirmation: true, weight_needs_confirmation: true,
};
const OLD_WEIGHT_ONLY = { ...OLD_PRICE, price_needs_confirmation: false };
const fresh = { ...OLD_PRICE, price_needs_confirmation: false, weight_needs_confirmation: false };

describe('one tap for a value nobody confirmed for half a year', () => {
  test('asks about the price first, and «Так» confirms just the price', async () => {
    const user = userEvent.setup();
    borschAPI.confirmFacts.mockResolvedValue({});
    renderQ(OLD_PRICE);
    expect(screen.getByText('Ціна досі 330 грн?')).toBeInTheDocument();
    // one question: not the weight as well
    expect(screen.queryByText(/Порція досі/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Так' }));
    await waitFor(() => expect(screen.getByText('Дякуємо! Оновили на картці Борщу.')).toBeInTheDocument());
    expect(borschAPI.confirmFacts).toHaveBeenCalledWith('b2', { confirm: ['price'] });
    expect(track).toHaveBeenCalledWith('fact_confirm', { field: 'price', action: 'yes', borsch_id: 'b2', from_bowl: true });
  });

  test('«Ні, інша» takes a chip or a number and sends the new price', async () => {
    const user = userEvent.setup();
    borschAPI.confirmFacts.mockResolvedValue({});
    renderQ(OLD_PRICE);
    await user.click(screen.getByRole('button', { name: 'Ні, інша' }));
    // no chip for the price it already has, and no bare 200 or 300
    const chips = screen.getAllByRole('button').map((b) => b.textContent);
    expect(chips).toEqual(expect.arrayContaining(['120 грн', '160 грн', '220 грн', '250 грн', '280 грн']));
    expect(chips).not.toContain('330 грн');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
    await user.type(screen.getByTestId('fact-other'), '345');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(borschAPI.confirmFacts).toHaveBeenCalledWith('b2', { price_uah: 345 }));
    expect(track).toHaveBeenCalledWith('fact_confirm', expect.objectContaining({ field: 'price', action: 'changed', value: 345 }));
  });

  test('a price that cannot be right is not sent', async () => {
    const user = userEvent.setup();
    renderQ(OLD_PRICE);
    await user.click(screen.getByRole('button', { name: 'Ні, інша' }));
    await user.type(screen.getByTestId('fact-other'), '0');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
  });

  test('«Пропустити» closes it without writing', async () => {
    const user = userEvent.setup();
    const { container } = renderQ(OLD_PRICE);
    await user.click(screen.getByRole('button', { name: 'Пропустити' }));
    expect(container).toBeEmptyDOMElement();
    expect(borschAPI.confirmFacts).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('fact_confirm', { field: 'price', action: 'skip', borsch_id: 'b2', from_bowl: true });
  });

  test('the weight when the price is fresh', async () => {
    const user = userEvent.setup();
    borschAPI.confirmFacts.mockResolvedValue({});
    renderQ(OLD_WEIGHT_ONLY);
    expect(screen.getByText('Порція досі 400 г?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Так' }));
    await waitFor(() => expect(borschAPI.confirmFacts).toHaveBeenCalledWith('b2', { confirm: ['weight'] }));
  });

  test('nothing when both values are fresh', () => {
    const { container } = renderQ(fresh);
    expect(container).toBeEmptyDOMElement();
  });

  test('a missing weight keeps its question, and the old price is the second and last', () => {
    renderQ({ ...OLD_PRICE, weight: '', weight_value: 0 });
    expect(screen.getByText('Скільки грамів була порція?')).toBeInTheDocument();
    expect(screen.getByText('Ціна досі 330 грн?')).toBeInTheDocument();
  });

  test('both missing: the two «only if missing» questions and no third', () => {
    renderQ({ ...NOTHING, price_needs_confirmation: true, weight_needs_confirmation: true });
    expect(screen.getByText('Скільки грамів була порція?')).toBeInTheDocument();
    expect(screen.getByText('Скільки коштував Борщ?')).toBeInTheDocument();
    expect(screen.queryByTestId('fact-confirm')).not.toBeInTheDocument();
  });

  test('says so when the confirmation fails', async () => {
    const user = userEvent.setup();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    borschAPI.confirmFacts.mockRejectedValue(new Error('offline'));
    renderQ(OLD_PRICE);
    await user.click(screen.getByRole('button', { name: 'Так' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося зберегти. Спробуй ще раз.');
    console.error.mockRestore();
  });

  test('a euro venue asks in euro', () => {
    render(
      <I18nProvider>
        <FactsQuestion borsch={{ ...OLD_PRICE, price: '≈12 ₴', price_value: 12 }} country="Німеччина" />
      </I18nProvider>
    );
    expect(screen.getByText('Ціна досі 12 €?')).toBeInTheDocument();
  });
});
