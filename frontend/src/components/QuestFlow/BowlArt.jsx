import { bowlArt, densityRail } from './bowlArt';

/**
 * A top-view bowl of bowlArt: kind 'meat' (0..3), 'beet' (1..3), 'broth'
 * (1..4, density) or 'empty'. Decorative: the word next to it carries the
 * meaning. `.nb-plate` keeps the plate's ink rings dark on the dark theme.
 */
export const BowlArt = ({ kind, level, className = '' }) => {
  const draw = bowlArt[kind];
  if (!draw) return null;
  const html = kind === 'empty' ? draw() : draw(level);
  return (
    <span
      className={`nb-plate ${className}`}
      aria-hidden="true"
      // our own static drawing (bowlArt.js), no user data
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/** The density wedge, watery pink to deep beet. */
export const DensityRail = ({ id, className = '' }) => (
  <span
    className={className}
    aria-hidden="true"
    // our own static drawing (bowlArt.js), no user data
    dangerouslySetInnerHTML={{ __html: densityRail(id) }}
  />
);
