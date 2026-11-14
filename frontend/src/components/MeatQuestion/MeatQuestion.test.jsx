import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { MeatQuestion } from './MeatQuestion';

jest.mock('../../api', () => ({ borschAPI: { update: jest.fn() } }));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/**
 * A bowl that put a new borshch on the map created it as «other»; its closing
 * screen asks the meat once, and the API lets the creator set it once.
 */

const NEW = { id_borsch: 'b1', name: 'Борщ з пампушками', type_meat: 'other' };

const renderQ = (props) => {
  const api = { update: jest.fn().mockResolvedValue({ ...NEW, type_meat: 'pork' }) };
  const utils = render(
    <I18nProvider>
      <MeatQuestion borsch={NEW} created api={api} context={{ from_bowl: true }} {...props} />
    </I18nProvider>
  );
  return { api, ...utils };
};

beforeEach(() => {
  localStorage.setItem('lang', 'uk');
  track.mockClear();
});

test('asks the creator of a new borshch, four meats and «Не знаю»', () => {
  renderQ();
  expect(screen.getByText('Новий Борщ на мапі')).toBeInTheDocument();
  expect(screen.getByText('Яке мʼясо в «Борщ з пампушками»?')).toBeInTheDocument();
  const chips = screen.getAllByRole('button').map((b) => b.textContent);
  expect(chips).toEqual(['Без мʼяса', 'Курка', 'Свинина', 'Яловичина', 'Не знаю']);
});

test('one tap saves the code alone and thanks', async () => {
  const onUpdate = jest.fn();
  window.addEventListener('borschDataUpdated', onUpdate);
  const { api } = renderQ();
  await userEvent.click(screen.getByRole('button', { name: 'Свинина' }));
  expect(api.update).toHaveBeenCalledWith('b1', { type_meat: 'pork' });
  expect(await screen.findByRole('status')).toHaveTextContent('Дякуємо! Записали на картку Борщу.');
  expect(track).toHaveBeenCalledWith('meat_set', { borsch_id: 'b1', type_meat: 'pork', from_bowl: true });
  expect(onUpdate).toHaveBeenCalled();
  window.removeEventListener('borschDataUpdated', onUpdate);
});

test('asks nothing when this device did not create it', () => {
  const { container } = renderQ({ created: false });
  expect(container).toBeEmptyDOMElement();
});

test('asks nothing when the meat is already known', () => {
  const { container } = renderQ({ borsch: { ...NEW, type_meat: 'beef' } });
  expect(container).toBeEmptyDOMElement();
});

test('asks nothing before the borshch exists', () => {
  const { container } = renderQ({ borsch: { ...NEW, id_borsch: null } });
  expect(container).toBeEmptyDOMElement();
});

test('the question stays put while the refresh after the save changes the type', async () => {
  const { api, rerender } = renderQ();
  await userEvent.click(screen.getByRole('button', { name: 'Курка' }));
  await screen.findByRole('status');
  rerender(
    <I18nProvider>
      <MeatQuestion borsch={{ ...NEW, type_meat: 'chicken' }} created api={api} />
    </I18nProvider>
  );
  expect(screen.getByRole('status')).toHaveTextContent('Дякуємо!');
});

test('a 403 (set by someone else, or not the creator) hides it without an error', async () => {
  const api = { update: jest.fn().mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 })) };
  const { container } = renderQ({ api });
  await userEvent.click(screen.getByRole('button', { name: 'Яловичина' }));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(track).toHaveBeenCalledWith('meat_set', expect.objectContaining({ result: 'forbidden', type_meat: 'beef' }));
});

test('a network failure says so and lets the person tap again', async () => {
  const api = {
    update: jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 }))
      .mockResolvedValueOnce({}),
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
  renderQ({ api });
  await userEvent.click(screen.getByRole('button', { name: 'Свинина' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося зберегти');
  await userEvent.click(screen.getByRole('button', { name: 'Свинина' }));
  expect(await screen.findByRole('status')).toBeInTheDocument();
  expect(api.update).toHaveBeenCalledTimes(2);
  console.error.mockRestore();
});

test('«Не знаю» closes it without a request', async () => {
  const { api, container } = renderQ();
  await userEvent.click(screen.getByRole('button', { name: 'Не знаю' }));
  expect(api.update).not.toHaveBeenCalled();
  expect(container).toBeEmptyDOMElement();
  expect(track).toHaveBeenCalledWith('meat_set', { borsch_id: 'b1', type_meat: 'unknown', from_bowl: true });
});
