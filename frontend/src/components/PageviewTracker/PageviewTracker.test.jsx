import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { PageviewTracker } from './PageviewTracker';
import { trackPageview } from '../../analytics';

// react-router-dom v7 тягне підшлях 'react-router/dom', якого резолвер jest у
// CRA не бачить, і сюїта падає ще до першого тесту. Для тестів підміняємо його
// ядром: MemoryRouter, useLocation і useNavigate — саме там.
jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ trackPageview: jest.fn() }));

const Harness = () => {
  const navigate = useNavigate();
  return (
    <>
      <PageviewTracker />
      <button onClick={() => navigate('/?city=Kyiv')}>filter</button>
      <button onClick={() => navigate('/list')}>list</button>
    </>
  );
};

const renderHarness = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Harness />
    </MemoryRouter>
  );

beforeEach(() => trackPageview.mockClear());

test('перший рендер дає рівно один перегляд', () => {
  renderHarness();
  expect(trackPageview).toHaveBeenCalledTimes(1);
});

test('дописаний фільтр у рядку запиту переглядом не рахується', () => {
  renderHarness();
  // Саме це й ламало дані: FilterUrlSync дописує ?city= одразу після
  // монтування, і кожне відкриття мапи давало два перегляди замість одного.
  fireEvent.click(screen.getByText('filter'));
  expect(trackPageview).toHaveBeenCalledTimes(1);
});

test('перехід на інший шлях дає новий перегляд', () => {
  renderHarness();
  fireEvent.click(screen.getByText('list'));
  expect(trackPageview).toHaveBeenCalledTimes(2);
});
