import { useEffect, useRef } from 'react';

/**
 * Call `tick` every `ms` while the tab is visible, and once more the moment it
 * becomes visible again. A host holding a phone with the QR up, or a guest
 * waiting for the results, see fresh numbers without a reload, and a phone in
 * a pocket asks the API for nothing.
 */
export const useVisiblePolling = (tick, ms, enabled = true) => {
  const latest = useRef(tick);
  latest.current = tick;

  useEffect(() => {
    if (!enabled || !ms) return undefined;
    const run = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      latest.current();
    };
    const timer = setInterval(run, ms);
    const onVisible = () => { if (!document.hidden) latest.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled]);
};
