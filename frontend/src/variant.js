// Design-experiment variants.
//
// A variant is chosen at BUILD time via REACT_APP_VARIANT (map1, map2, ...).
// When it is empty — which is the case for the production map. build — every
// helper here is inert and the app renders exactly as it always has.
//
// Each variant gets its own stylesheet under src/styles/variants/, scoped to
// html[data-variant="<name>"], so variant CSS can never leak into production.
// Components expose stable `nb-*` hook classes for those stylesheets to target
// (CSS-module class names are hashed and unusable from a global stylesheet).

export const VARIANT = (process.env.REACT_APP_VARIANT || '').trim();

export const isVariant = (name) => VARIANT === name;

// Variants that render the map edge-to-edge with floating chrome on top
// (Google-Maps-style). Add future variants here to opt them into the same
// behaviour instead of duplicating the checks at call sites.
export const FULLSCREEN_MAP_VARIANTS = ['map1'];

/**
 * Bottom-nav A/B arm, set per site in .env as REACT_APP_NAV.
 *
 * 'wide'  — Мапа, Обране | + | Відгуки, Ви   (production)
 * default — Мапа | + | Ви                     (map1)
 *
 * Deliberately NOT keyed off REACT_APP_VARIANT: production builds with
 * REACT_APP_VARIANT=map1 (that is how it renders this design at all), so the
 * variant cannot tell the two sites apart.
 */
export const hasWideNav = (process.env.REACT_APP_NAV || '').trim() === 'wide';

/**
 * Rating scale arm, set per site in .env as REACT_APP_RATE_SCALE.
 *
 * '10' — the 1–10 strip the flow used before the answer cards: ten tap targets
 *        per question with the criterion's two anchors underneath.
 * default — five worded answers ("Щедро", "У кожній ложці"), mapped onto the
 *        same 1–10 field so both arms write the same shape of review.
 */
export const hasTenPointScale = (process.env.REACT_APP_RATE_SCALE || '').trim() === '10';

export const hasFullscreenMap = FULLSCREEN_MAP_VARIANTS.includes(VARIANT);

/**
 * Stamp the variant onto <html> and opt into safe-area insets.
 *
 * viewport-fit=cover is set here rather than in public/index.html on purpose:
 * it makes the page extend under the notch / home indicator, which only makes
 * sense together with the env(safe-area-inset-*) padding the variant
 * stylesheets apply. Production must keep the stock viewport meta.
 */
export function applyVariant() {
  if (!VARIANT) return;

  document.documentElement.setAttribute('data-variant', VARIANT);

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && !/viewport-fit/.test(meta.getAttribute('content') || '')) {
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, viewport-fit=cover'
    );
  }
}
