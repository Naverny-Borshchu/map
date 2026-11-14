import { useCallback, useEffect, useRef } from 'react';
import { consumeFlowHandover, trackFlowExit, trackFlowStep } from '../services/flowAnalytics';

// A close button may ask «are you sure?» first, so the click itself is not the
// exit. It only labels an unmount that follows soon after as a deliberate one.
const CLOSE_WINDOW_MS = 2000;

/**
 * `flow_step` each time the visible step changes and `flow_exit` once if the
 * screen goes away before the flow is finished (see services/flowAnalytics).
 *
 * step      the step's stable name, or null while nothing is on screen yet
 * finished  true once the flow reached its end: nothing after that is an exit
 * context   extra properties sent with both events (entry point and the like)
 *
 * Returns { markClosing, exit }. markClosing() is for the close button: an
 * unmount right after it is reported as via 'close', any other unmount as via
 * 'away'. exit(via) reports a known way out at once (into another flow, say);
 * either way a flow reports its exit only once.
 */
export const useFlowTracking = ({ flow, step, index, total, finished = false, context = null }) => {
  const latest = useRef({});
  latest.current = { flow, step, index, total, finished, context };
  const lastShown = useRef(null);
  const exited = useRef(false);
  const closingAt = useRef(0);

  useEffect(() => {
    if (!step) return;
    const key = `${flow}:${step}:${index}`;
    if (lastShown.current === key) return;
    lastShown.current = key;
    trackFlowStep({ flow, step, index, total, ...(latest.current.context || {}) });
  }, [flow, step, index, total]);

  const exit = useCallback((via) => {
    const cur = latest.current;
    if (exited.current || cur.finished || !cur.step) return;
    exited.current = true;
    trackFlowExit({ flow: cur.flow, step: cur.step, index: cur.index, via, ...(cur.context || {}) });
  }, []);

  const markClosing = useCallback(() => {
    closingAt.current = Date.now();
  }, []);

  // Navigating elsewhere unmounts the screen. React's StrictMode unmounts and
  // remounts once in development, so the check waits a tick and only counts
  // an unmount that stayed unmounted.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const onPageHide = () => exit('pagehide');
    window.addEventListener('pagehide', onPageHide);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', onPageHide);
      setTimeout(() => {
        if (mounted.current) return;
        if (consumeFlowHandover(latest.current.flow)) return;
        exit(Date.now() - closingAt.current < CLOSE_WINDOW_MS ? 'close' : 'away');
      }, 0);
    };
  }, [exit]);

  return { markClosing, exit };
};
