import { act, renderHook } from '@testing-library/react';
import { boxContains, boxToUrlValue, padBox, useMapTips, viewBox } from './useMapTips';

/** The grey bowls of the view: asked on idle, debounced, padded, stale answers dropped. */

const mapAt = (s, w, n, e) => ({
  getBounds: () => ({
    getSouthWest: () => ({ lat: () => s, lng: () => w }),
    getNorthEast: () => ({ lat: () => n, lng: () => e }),
  }),
});
const tip = (id, status = 'open') => ({ id, status, place: { id: `p-${id}`, latitude: 50.45, longitude: 30.52 } });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('the bbox is south,west,north,east like toUrlValue, padded a quarter each side', () => {
  const box = padBox({ s: 50, w: 30, n: 51, e: 32 });
  expect(box).toEqual({ s: 49.75, w: 29.5, n: 51.25, e: 32.5 });
  expect(boxToUrlValue({ s: 50.1234567, w: 30.1, n: 51, e: 32 })).toBe('50.123457,30.1,51,32');
  expect(boxContains(box, { s: 50.1, w: 30.1, n: 50.9, e: 31.9 })).toBe(true);
  expect(boxContains(box, { s: 49, w: 30, n: 51, e: 32 })).toBe(false);
  expect(padBox({ s: -89.9, w: -179.9, n: 89.9, e: 179.9 })).toEqual({ s: -90, w: -180, n: 90, e: 180 });
  expect(viewBox(mapAt(1, 2, 3, 4))).toEqual({ s: 1, w: 2, n: 3, e: 4 });
  expect(viewBox({ getBounds: () => null })).toBeNull();
});

test('asks once the map sits still, and a small pan inside a complete answer asks nothing', async () => {
  const api = { inView: jest.fn(async () => [tip('a')]) };
  const { result } = renderHook(() => useMapTips({ api, delay: 400 }));
  act(() => { result.current.onIdle(mapAt(50, 30, 51, 31)); });
  act(() => { result.current.onIdle(mapAt(50, 30, 51, 31)); });
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(api.inView).toHaveBeenCalledTimes(1);
  expect(api.inView.mock.calls[0][0]).toBe('49.75,29.75,51.25,31.25');
  expect(result.current.tips.map((x) => x.id)).toEqual(['a']);

  act(() => { result.current.onIdle(mapAt(50.1, 30.1, 51.1, 31.1)); });
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(api.inView).toHaveBeenCalledTimes(1);

  act(() => { result.current.onIdle(mapAt(52, 30, 53, 31)); });
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(api.inView).toHaveBeenCalledTimes(2);
});

test('nothing while disabled (city markers); a vote that closes a tip takes it off', async () => {
  const api = { inView: jest.fn(async () => [tip('a'), tip('b')]) };
  const { result, rerender } = renderHook(({ enabled }) => useMapTips({ api, enabled, delay: 10 }), { initialProps: { enabled: false } });
  act(() => { result.current.onIdle(mapAt(50, 30, 51, 31)); });
  await act(async () => { jest.advanceTimersByTime(20); });
  expect(api.inView).not.toHaveBeenCalled();

  rerender({ enabled: true });
  act(() => { result.current.onIdle(mapAt(50, 30, 51, 31)); });
  await act(async () => { jest.advanceTimersByTime(20); });
  expect(result.current.tips).toHaveLength(2);
  act(() => { result.current.replaceTip({ id: 'a', status: 'confirmed', confirmations: 1 }); });
  expect(result.current.tips.find((x) => x.id === 'a')).toMatchObject({ status: 'confirmed', confirmations: 1 });
  act(() => { result.current.replaceTip({ id: 'b', status: 'gone' }); });
  expect(result.current.tips.map((x) => x.id)).toEqual(['a']);
});

test('a failed read keeps the map quiet', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const api = { inView: jest.fn(async () => { throw new Error('offline'); }) };
  const { result } = renderHook(() => useMapTips({ api, delay: 10 }));
  act(() => { result.current.onIdle(mapAt(50, 30, 51, 31)); });
  await act(async () => { jest.advanceTimersByTime(20); });
  expect(result.current.tips).toEqual([]);
  console.warn.mockRestore();
});
