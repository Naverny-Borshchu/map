import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { tablesAPI } from '../../api/tables';
import { borschAPI } from '../../api';
import { TableCreate } from './TableCreate';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api/tables', () => {
  const actual = jest.requireActual('../../api/tables');
  return { ...actual, tablesAPI: { create: jest.fn() } };
});
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api');
  return { ...actual, borschAPI: { ...actual.borschAPI, rename: jest.fn() } };
});
jest.mock('../../services/googleMaps', () => ({ useGoogleMaps: () => ({ isLoaded: true, loadError: undefined }) }));
jest.mock('../../components/GoogleAuth', () => ({
  GoogleAuth: () => <button type="button">Google test</button>,
}));

/**
 * NAV-228. 24.11.2026 у «Глеку»: Борщ на мапі «з м‘ясною пампушкою», у меню
 * «з грибами та мʼясною пампушкою». Змінити назву було ніде, тож ведучий
 * зняв наявний Борщ і вписав назву з меню як новий: на мапі зʼявився двійник.
 * Тепер під вибраним Борщем є «Інша назва в меню?»: Стіл лишається з тим самим
 * Борщем (id), а назва з меню йде на перевірку AI.
 */

const HERE = { latitude: 50.456, longitude: 30.518 };
const GLEK = { id: 'p-glek', name: 'Глек', latitude: 50.456041, longitude: 30.518227, location: { lat: 50.456041, lng: 30.518227 }, city: 'Київ', address: 'вулиця Велика Житомирська, 6, Київ' };
const OLD = 'Справжній київський борщ з м‘ясною пампушкою';
const MENU = 'Справжній київський борщ з грибами та мʼясною пампушкою';
const BORSCH = [{ id_borsch: 'b-old', place_id: 'p-glek', name: OLD, rating_count: 1, price: '≈189 ₴', weight: '350 g.' }];
const mockPlaces = { allPlaces: [GLEK], loading: false, getPlaceById: (id) => (id === GLEK.id ? GLEK : undefined) };
const mockBorsch = { borsch: BORSCH, loading: false, getBorschById: (id) => BORSCH.find((b) => b.id_borsch === id) };
jest.mock('../../context/PlacesContext', () => ({ usePlaces: () => mockPlaces }));
jest.mock('../../context/BorschContext', () => ({ useBorsch: () => mockBorsch }));

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
};

const renderCreate = () => render(
  <I18nProvider>
    <UserProvider>
      <MemoryRouter initialEntries={['/table/new?from=chooser']}>
        <Routes>
          <Route path="/table/new" element={<TableCreate />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </UserProvider>
  </I18nProvider>
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'host-access');
  localStorage.setItem('refresh', 'host-refresh');
  localStorage.setItem('user', JSON.stringify({ id: 5, given_name: 'Андрій' }));
  tablesAPI.create.mockReset();
  borschAPI.rename.mockReset();
  Object.defineProperty(global.navigator, 'geolocation', {
    value: { getCurrentPosition: (ok) => ok({ coords: HERE }) },
    configurable: true,
  });
});

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 5));
});

const toBorschStep = async (user) => {
  renderCreate();
  await user.click((await screen.findByText('Глек')).closest('button'));
  expect(screen.getByRole('button', { name: new RegExp(OLD) })).toHaveAttribute('aria-pressed', 'true');
};

it('the menu name of the borshch on the map: the table keeps the same borshch, the name goes to the AI check', async () => {
  tablesAPI.create.mockResolvedValue({ code: '2TGH6K' });
  borschAPI.rename.mockResolvedValue({ status: 'pending', name: MENU, check_id: 'c1' });
  const user = userEvent.setup();
  await toBorschStep(user);

  // the hint next to «new borshch» points here instead
  expect(screen.getByText(/Той самий Борщ, але в меню назва інша\?/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Інша назва в меню?' }));
  const field = screen.getByLabelText('Назва в меню');
  expect(field).toHaveValue(OLD);
  await user.clear(field);
  await user.type(field, `  ${MENU} {Enter}`);
  expect(screen.getByRole('button', { name: `У меню: «${MENU}». Змінити` })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Далі' }));
  // price and weight from the menu, under the menu's name
  const [item] = screen.getAllByRole('listitem');
  expect(item).toHaveTextContent(MENU);
  await user.type(within(item).getByLabelText(/^Ціна/), '390');
  await user.type(within(item).getByLabelText(/^Порція/), '430');
  await user.click(screen.getByRole('button', { name: 'Далі' }));
  await user.click(screen.getByRole('button', { name: 'Створити дегустацію' }));

  expect(await screen.findByTestId('where')).toHaveTextContent('/t/2TGH6K');
  const payload = tablesAPI.create.mock.calls[0][0];
  expect(payload.borsches).toEqual([{ id: 'b-old', price_uah: 390, weight_grams: 430 }]);
  expect(JSON.stringify(payload)).not.toContain('грибами');
  expect(borschAPI.rename).toHaveBeenCalledWith('b-old', MENU);
});

it('the same name, or nothing changed, sends no rename', async () => {
  tablesAPI.create.mockResolvedValue({ code: 'AAAAAA' });
  const user = userEvent.setup();
  await toBorschStep(user);
  await user.click(screen.getByRole('button', { name: 'Інша назва в меню?' }));
  await user.click(screen.getByRole('button', { name: 'Готово' }));
  expect(screen.getByRole('button', { name: 'Інша назва в меню?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Далі' }));
  await user.click(screen.getByRole('button', { name: 'Далі' }));
  await user.click(screen.getByRole('button', { name: 'Створити дегустацію' }));
  expect(await screen.findByTestId('where')).toHaveTextContent('/t/AAAAAA');
  expect(borschAPI.rename).not.toHaveBeenCalled();
});

it('a name too short is not taken', async () => {
  const user = userEvent.setup();
  await toBorschStep(user);
  await user.click(screen.getByRole('button', { name: 'Інша назва в меню?' }));
  const field = screen.getByLabelText('Назва в меню');
  await user.clear(field);
  await user.type(field, 'Бо');
  await user.click(screen.getByRole('button', { name: 'Готово' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Назва має бути від 3 до 120 символів.');
});
