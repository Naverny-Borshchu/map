/**
 * Theme resolution.
 *
 * Preference (localStorage `themePref`): 'auto' | 'light' | 'dark'.
 *  - 'auto' (default) → dark between 20:00 and 06:00 in the visitor's OWN
 *    timezone (device clock — no geolocation, no server call), re-checked on a
 *    timer and on visibilitychange so a session left open across the boundary
 *    flips over.
 *  - 'light' / 'dark' → pinned, the clock is ignored.
 */
const DARK_FROM_HOUR = 20;
const DARK_UNTIL_HOUR = 6;
const RECHECK_MS = 10 * 60 * 1000;
const PREF_KEY = 'themePref';

export const isNight = (date = new Date()) => {
  const hour = date.getHours();
  return hour >= DARK_FROM_HOUR || hour < DARK_UNTIL_HOUR;
};

export const getThemePreference = () => {
  try {
    const p = localStorage.getItem(PREF_KEY);
    if (p === 'light' || p === 'dark' || p === 'auto') return p;
  } catch (e) { /* storage unavailable */ }
  return 'auto';
};

const resolveTheme = () => {
  const pref = getThemePreference();
  if (pref === 'light' || pref === 'dark') return pref;
  return isNight() ? 'dark' : 'light';
};

const listeners = new Set();
export const onThemeChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

let applied = null;
const apply = () => {
  const next = resolveTheme();
  if (next === applied) return;
  applied = next;
  document.documentElement.setAttribute('data-theme', next);
  // keep the browser UI (address bar, form controls, scrollbars) in step
  document.documentElement.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#101010' : '#F2F2F2');
  listeners.forEach((fn) => fn(next));
};

/** Persist a preference and apply it immediately. */
export const setThemePreference = (pref) => {
  try { localStorage.setItem(PREF_KEY, pref); } catch (e) { /* ignore */ }
  apply();
};

export function applyTimeTheme() {
  apply();
  // the timer only ever matters for 'auto'
  setInterval(apply, RECHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) apply();
  });
}

export const getTheme = () =>
  document.documentElement.getAttribute('data-theme') || resolveTheme();
