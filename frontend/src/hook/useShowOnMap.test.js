import { renderHook } from '@testing-library/react';
import { useShowOnMap, SPLIT_QUERY } from './useShowOnMap';
import { usePlaces } from '../context/PlacesContext';
import { useMediaQuery } from './useMediaQuery';

jest.mock('../context/PlacesContext', () => ({ usePlaces: jest.fn() }));
jest.mock('./useMediaQuery', () => ({ useMediaQuery: jest.fn() }));

// 21.11.2026: a borshch card beside the map selects its place, so the map shows that borshch (Map.jsx, focusPlan)
describe('useShowOnMap', () => {
  let setSelectedPlaceId;
  beforeEach(() => {
    setSelectedPlaceId = jest.fn();
    usePlaces.mockReturnValue({ setSelectedPlaceId });
  });

  it('asks for the same width at which Layout puts the card beside the map', () => {
    useMediaQuery.mockReturnValue(true);
    renderHook(() => useShowOnMap('place-1'));
    expect(useMediaQuery).toHaveBeenCalledWith(SPLIT_QUERY);
    expect(SPLIT_QUERY).toBe('(min-width: 1280px)');
  });

  it('selects the card\'s place on desktop', () => {
    useMediaQuery.mockReturnValue(true);
    renderHook(() => useShowOnMap('place-gudauri'));
    expect(setSelectedPlaceId).toHaveBeenCalledWith('place-gudauri');
  });

  it('follows the card to another borshch', () => {
    useMediaQuery.mockReturnValue(true);
    const { rerender } = renderHook(({ id }) => useShowOnMap(id), { initialProps: { id: 'place-1' } });
    rerender({ id: 'place-2' });
    expect(setSelectedPlaceId).toHaveBeenLastCalledWith('place-2');
  });

  it('does nothing on a phone: there is no map beside the card, and the visitor\'s map view is kept', () => {
    useMediaQuery.mockReturnValue(false);
    renderHook(() => useShowOnMap('place-gudauri'));
    expect(setSelectedPlaceId).not.toHaveBeenCalled();
  });

  it('waits for the borshch to load', () => {
    useMediaQuery.mockReturnValue(true);
    renderHook(() => useShowOnMap(undefined));
    expect(setSelectedPlaceId).not.toHaveBeenCalled();
  });
});
