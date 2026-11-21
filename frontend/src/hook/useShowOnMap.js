import { useEffect } from 'react';
import { usePlaces } from '../context/PlacesContext';
import { useMediaQuery } from './useMediaQuery';

/** The width at which Layout puts the card beside the map (renderSplit). */
export const SPLIT_QUERY = '(min-width: 1280px)';

/**
 * A borshch card beside the map shows its borshch on that map (21.11.2026, Andrii: a card for Gudauri with Kyiv on
 * the map, «I would like to show on map because it shows in general Kyiv in many cases»). It selects the card's
 * place: the pin is highlighted, and Map moves there if it is off screen (focusPlan in utils/mapZoom).
 * Phones have no map beside the card, so nothing changes there: coming back to the map keeps the visitor's view.
 */
export const useShowOnMap = (placeId) => {
  const isSplit = useMediaQuery(SPLIT_QUERY);
  const { setSelectedPlaceId } = usePlaces();
  useEffect(() => {
    if (isSplit && placeId) setSelectedPlaceId(placeId);
  }, [isSplit, placeId, setSelectedPlaceId]);
};
