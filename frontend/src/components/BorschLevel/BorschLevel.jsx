/**
 * The rating icon set, drawn rather than typed.
 *
 * The flow used to answer every question with a stock emoji (😶 🔎 🙂 😋 🍖).
 * They come from the reader's font, so the same screen looks different on every
 * phone, none of them look like this brand, and "🔎 Пару волокон" asks you to
 * read a magnifying glass as an amount of meat.
 *
 * One parametric bowl replaces the lot: a plate seen from the side that fills
 * with borsch as the level rises, gets a sour-cream swirl once it is generous,
 * and steams at the top of the scale. Ten levels come out of one drawing, so
 * the set cannot drift out of style — and it scales to any criterion, because
 * it reads as "how much of this was there", which is what every question asks.
 *
 * Colours are the landing's: borsch #BF4408 over cream #F5D1B0, deepening to
 * #920806 at the top. Everything is currentColor-free on purpose so the icon
 * looks identical in light and dark.
 */
const BORSCH_LIGHT = '#D9633B';
const BORSCH_DEEP = '#BF4408';
const BORSCH_DARKEST = '#920806';
const CREAM = '#F5D1B0';
const SMETANA = '#FBFAF9';
const RIM = '#1A1A1A';

/** Level 1..10 → how full the bowl is, as a fraction of the inner height. */
const fillFor = (level) => Math.max(0, Math.min(1, (level - 0.5) / 10));

/** Deeper colour as the bowl fills, so level reads even without the height. */
const colourFor = (level) => (level >= 8 ? BORSCH_DARKEST : level >= 5 ? BORSCH_DEEP : BORSCH_LIGHT);

export const BorschLevel = ({ level = 5, size = 34, title }) => {
  const lvl = Math.max(1, Math.min(10, Number(level) || 1));
  const fill = fillFor(lvl);

  // Bowl interior spans y=13 (rim) to y=25 (base) in a 40x40 viewBox.
  const top = 25 - 12 * fill;
  const clipId = `nbclip-${lvl}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          {/* the bowl silhouette: soup can never spill outside the china */}
          <path d="M7 13 h26 a1 1 0 0 1 1 1 c0 7.2 -6.3 13 -14 13 s-14 -5.8 -14 -13 a1 1 0 0 1 1 -1 z" />
        </clipPath>
      </defs>

      {/* steam — only once the borsch is worth talking about */}
      {lvl >= 9 && (
        <g stroke={colourFor(lvl)} strokeWidth="1.6" strokeLinecap="round" opacity="0.55" fill="none">
          <path d="M15 9 c1.6 -1.5 -1.6 -3.2 0 -4.8" />
          <path d="M20 8 c1.6 -1.5 -1.6 -3.2 0 -4.8" />
          <path d="M25 9 c1.6 -1.5 -1.6 -3.2 0 -4.8" />
        </g>
      )}

      {/* empty china */}
      <path
        d="M7 13 h26 a1 1 0 0 1 1 1 c0 7.2 -6.3 13 -14 13 s-14 -5.8 -14 -13 a1 1 0 0 1 1 -1 z"
        fill={CREAM}
      />

      {/* the borsch itself */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="4" y={top} width="32" height="26" fill={colourFor(lvl)} />
      </g>

      {/* sour cream, generous portions only */}
      {lvl >= 7 && (
        <g fill={SMETANA} opacity="0.95">
          <circle cx="20" cy={top + 2.6} r="2.5" />
          {lvl >= 9 && <circle cx="15.4" cy={top + 3.4} r="1.35" />}
        </g>
      )}

      {/* rim and foot, drawn last so nothing paints over the outline */}
      <path
        d="M7 13 h26 a1 1 0 0 1 1 1 c0 7.2 -6.3 13 -14 13 s-14 -5.8 -14 -13 a1 1 0 0 1 1 -1 z"
        fill="none"
        stroke={RIM}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M5 13 h30" stroke={RIM} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M15 31 h10" stroke={RIM} strokeWidth="1.7" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
};

export default BorschLevel;
