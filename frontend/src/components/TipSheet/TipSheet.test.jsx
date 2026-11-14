import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { UserProvider } from '../../context/UserContext';
import { track } from '../../analytics';
import { tipsAPI } from '../../api/tips';
import { googleAuth } from '../../services/googleAuth';
import { TipSheet } from './TipSheet';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));
jest.mock('../../api/tips', () => {
  const actual = jest.requireActual('../../api/tips');
  return { ...actual, tipsAPI: { get: jest.fn(), confirm: jest.fn(), gone: jest.fn() } };
});
jest.mock('../GoogleAuth', () => ({
  GoogleAuth: ({ onSuccess }) => <button type="button" onClick={() => onSuccess({ credential: 'cred' })}>Google test</button>,
}));
jest.mock('../../services/googleAuth', () => ({ ...jest.requireActual('../../services/googleAuth'), googleAuth: jest.fn() }));

/** What a grey bowl opens: «Кажуть, тут є Борщ», the votes and «Оцінити першим». */

const PLACE = { id: 'p1', name: 'Хата', address: 'вул. Сагайдачного, 5', city: 'Київ', latitude: 50.46, longitude: 30.52 };
const TIP = {
  id: 't1', status: 'open', note: 'Борщ у меню щодня', author_name: 'Оля', is_author: false,
  confirmations: 0, gone_votes: 0, my_vote: null, created_at: '2026-11-14T13:00:00+02:00', place: PLACE,
};

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where" data-state={JSON.stringify(loc.state || null)}>{loc.pathname + loc.search}</p>;
};

const renderSheet = (tip = TIP, props = {}) => {
  const onClose = jest.fn();
  const onChanged = jest.fn();
  render(
    <I18nProvider>
      <UserProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<TipSheet tip={tip} onClose={onClose} onChanged={onChanged} {...props} />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </UserProvider>
    </I18nProvider>
  );
  return { onClose, onChanged };
};
const signIn = () => {
  localStorage.setItem('auth', 'true');
  localStorage.setItem('access', 'a');
  localStorage.setItem('refresh', 'r');
  localStorage.setItem('user', JSON.stringify({ id: 7 }));
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  track.mockClear();
  Object.values(tipsAPI).forEach((fn) => fn.mockReset());
  tipsAPI.get.mockImplementation(async () => TIP);
});

test('says what it is: somebody\'s word, with the note, and opens the bowl at the venue', async () => {
  const user = userEvent.setup();
  const { onClose } = renderSheet();
  expect(screen.getByRole('heading', { name: 'Кажуть, тут є Борщ' })).toBeInTheDocument();
  expect(screen.getByText('«Борщ у меню щодня»')).toBeInTheDocument();
  expect(screen.getByText(/Автор підказки: Оля/)).toBeInTheDocument();
  expect(screen.getByText('Ще не перевірено')).toBeInTheDocument();
  expect(track).toHaveBeenCalledWith('tip_open', { tip_id: 't1', status: 'open', from: 'map' });
  await user.click(screen.getByRole('button', { name: 'Оцінити першим' }));
  expect(onClose).toHaveBeenCalled();
  expect(screen.getByTestId('where')).toHaveTextContent('/bowl/new?place=p1&tip=t1&from=tip');
  expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state'))).toMatchObject({ place: { id: 'p1', name: 'Хата' } });
});

test('«Так, є» signed in: the tip is confirmed and the map hears about it', async () => {
  signIn();
  tipsAPI.confirm.mockResolvedValue({ ...TIP, status: 'confirmed', confirmations: 1, my_vote: 'confirm' });
  const user = userEvent.setup();
  const { onChanged } = renderSheet();
  await user.click(screen.getByRole('button', { name: 'Так, є' }));
  expect(await screen.findByText('Дякуємо! Підказку підтверджено.')).toBeInTheDocument();
  expect(tipsAPI.confirm).toHaveBeenCalledWith('t1', { from: 'map' });
  expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
  expect(screen.getByText('1 людина підтвердила')).toBeInTheDocument();
});

test('not signed in: the vote waits for Google, then goes', async () => {
  tipsAPI.gone.mockResolvedValue({ ...TIP, status: 'gone', gone_votes: 2 });
  googleAuth.mockResolvedValue({ access: 'x', refresh: 'y', user: { id: 3 } });
  const user = userEvent.setup();
  renderSheet();
  await user.click(screen.getByRole('button', { name: 'Вже нема' }));
  expect(screen.getByText('Увійди через Google, і голос зарахується.')).toBeInTheDocument();
  expect(tipsAPI.gone).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Google test' }));
  expect(await screen.findByText('Дякуємо! Прибрали з мапи.')).toBeInTheDocument();
  expect(tipsAPI.gone).toHaveBeenCalledTimes(1);
});

test('the author sees no «Так, є», only «Вже нема»', async () => {
  signIn();
  const mine = { ...TIP, is_author: true };
  tipsAPI.get.mockResolvedValue(mine);
  renderSheet(mine);
  await waitFor(() => expect(tipsAPI.get).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Так, є' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Вже нема' })).toBeInTheDocument();
  expect(screen.getByText('Це твоя підказка. Підтвердити її може хтось інший.')).toBeInTheDocument();
});

test('the list was read without the account: the sheet asks again and shows my vote', async () => {
  signIn();
  tipsAPI.get.mockResolvedValue({ ...TIP, my_vote: 'confirm', confirmations: 1, status: 'confirmed' });
  renderSheet();
  expect(await screen.findByText('Твій голос: «Так, є».')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Так, є' })).toBeDisabled();
  expect(screen.getByText('Підтверджено')).toBeInTheDocument();
});

test('a tip closed meanwhile says so', async () => {
  signIn();
  tipsAPI.confirm.mockRejectedValue(Object.assign(new Error('closed'), { status: 409, code: 'tip_closed' }));
  const user = userEvent.setup();
  renderSheet();
  tipsAPI.get.mockResolvedValue({ ...TIP, status: 'converted' });
  await user.click(screen.getByRole('button', { name: 'Так, є' }));
  expect(await screen.findByText('Цю підказку вже закрито: Борщ оцінили або його вже нема.')).toBeInTheDocument();
  expect(await screen.findByText('Цей Борщ уже оцінили: він на мапі звичайною міткою.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Оцінити першим' })).not.toBeInTheDocument();
});
