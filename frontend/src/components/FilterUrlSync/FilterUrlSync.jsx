import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useFilters } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { filtersToParams, paramsToFilters, sameParams } from '../../utils/filterUrl';

const SYNCED_ROUTES = ['/', '/list'];

/**
 * Keeps the map/list view and the address bar in agreement, in both directions:
 * a link with filters arrives applied, and changing filters updates the link.
 *
 * Renders nothing; it lives inside the Router so it can use useSearchParams,
 * while the filter state itself stays in context above it.
 */
export const FilterUrlSync = () => {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const { filters, updateFilters, city, updateCity } = useFilters();
  const { applyFilters, allPlaces } = usePlaces();
  const { borsch } = useBorsch();

  const hydrated = useRef(false);
  const appliedToMap = useRef(false);
  // Parsed once, at first render. The map effect applies THESE filters rather
  // than reading them back out of context: context updates land a render later,
  // and whichever of borsch/places arrives first would otherwise race the
  // hydration and apply an empty filter set.
  const incoming = useRef(paramsToFilters(params));

  // --- URL → state, once per page load -------------------------------------
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const { filters: f, city: c, hasAny } = incoming.current;
    if (!hasAny) return;

    // City first: switching city clears filters by design, so applying the
    // link's filters afterwards is what makes a shared link land intact.
    if (c && c !== city) updateCity(c);
    updateFilters(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The map renders a pre-filtered list held in PlacesContext, so hydrating the
  // filter state is not enough — it has to be pushed through the matcher once
  // the borsch data actually exists.
  useEffect(() => {
    if (!incoming.current.hasAny || appliedToMap.current) return;
    if (!borsch?.length || !allPlaces?.length) return;
    appliedToMap.current = true;
    applyFilters({ filters: incoming.current.filters, borsch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borsch, allPlaces]);

  // --- state → URL ---------------------------------------------------------
  useEffect(() => {
    if (!hydrated.current) return;
    if (!SYNCED_ROUTES.includes(pathname)) return;

    const next = filtersToParams(filters, { city, sort: params.get('sort') });
    if (sameParams(next, params)) return;
    // replace, not push: dragging a slider should not fill the Back stack
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, city, pathname]);

  return null;
};
