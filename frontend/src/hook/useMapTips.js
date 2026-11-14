import { useCallback, useEffect, useRef, useState } from 'react';
import { tipsAPI } from '../api/tips';

/** The map has to sit still this long before the tips of the view are asked. */
export const TIPS_IDLE_MS = 450;
/** A quarter of the view on every side is fetched too, so a small pan asks nothing. */
export const TIPS_PAD = 0.25;
const PAGE = 100;

const clampLat = (v) => Math.max(-90, Math.min(90, v));
const clampLng = (v) => Math.max(-180, Math.min(180, v));

/** { s, w, n, e } → 'south,west,north,east', as LatLngBounds#toUrlValue() prints it. */
export const boxToUrlValue = ({ s, w, n, e }) => [s, w, n, e].map((v) => Number(v.toFixed(6))).join(',');

export const padBox = ({ s, w, n, e }, pad = TIPS_PAD) => {
  const dLat = (n - s) * pad;
  const dLng = (e - w) * pad;
  return { s: clampLat(s - dLat), w: clampLng(w - dLng), n: clampLat(n + dLat), e: clampLng(e + dLng) };
};

export const boxContains = (outer, inner) =>
  Boolean(outer && inner)
  && inner.s >= outer.s && inner.n <= outer.n && inner.w >= outer.w && inner.e <= outer.e;

/** google.maps.Map → { s, w, n, e } of what is on screen, or null before it knows. */
export const viewBox = (map) => {
  const b = map?.getBounds?.();
  if (!b) return null;
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { s: sw.lat(), w: sw.lng(), n: ne.lat(), e: ne.lng() };
};

/**
 * The grey bowls of the visible part of the map («Кажуть, тут є Борщ»).
 *
 * Asked on the map's `idle` (it fires once the map stops moving), debounced,
 * for the view plus a margin; a view that stays inside the last complete
 * answer asks nothing, and an answer that a newer pan made stale is dropped
 * (aborted when the browser can).
 *
 * enabled  false while the map shows city markers or a pin is being placed
 */
export const useMapTips = ({ enabled = true, api = tipsAPI, delay = TIPS_IDLE_MS } = {}) => {
  const [tips, setTips] = useState([]);
  const last = useRef({ box: null, complete: false });
  const timer = useRef(null);
  const controller = useRef(null);
  const request = useRef(0);

  useEffect(() => () => {
    clearTimeout(timer.current);
    controller.current?.abort?.();
  }, []);

  const load = useCallback(async (view, { force = false } = {}) => {
    if (!view) return;
    if (!force && last.current.complete && boxContains(last.current.box, view)) return;
    const box = padBox(view);
    const id = ++request.current;
    controller.current?.abort?.();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    controller.current = ctrl;
    try {
      const list = await api.inView(boxToUrlValue(box), ctrl ? { signal: ctrl.signal } : {});
      if (id !== request.current) return;
      last.current = { box, complete: list.length < PAGE };
      setTips(list);
    } catch (e) {
      if (e?.name === 'AbortError' || id !== request.current) return;
      // the grey bowls are a bonus: a failed read must not cost the map
      console.warn('Не вдалося завантажити підказки «тут є Борщ»:', e?.message || e);
    }
  }, [api]);

  /** For GoogleMap's onIdle: (map) → a debounced read of its view. */
  const onIdle = useCallback((map) => {
    if (!enabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(viewBox(map)), delay);
  }, [enabled, load, delay]);

  /** A vote changed a tip: keep it if it is still on the map, drop it otherwise. */
  const replaceTip = useCallback((tip) => {
    if (!tip?.id) return;
    setTips((prev) => (['open', 'confirmed'].includes(tip.status)
      ? prev.map((x) => (x.id === tip.id ? { ...x, ...tip } : x))
      : prev.filter((x) => x.id !== tip.id)));
  }, []);

  return { tips: enabled ? tips : [], onIdle, replaceTip, reload: (map) => load(viewBox(map), { force: true }) };
};
