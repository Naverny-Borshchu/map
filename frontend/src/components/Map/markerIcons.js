// Crisp, self-contained SVG markers for the map, as data-URI icons.
//
// Why SVG data URIs instead of the old beet-icon.png + Google label:
//   * The PNG (69x45) was upscaled to 74–90px → blurry.
//   * The rating number was a *separate* Google Maps label placed at an
//     x-offset (0.72 * width) with random jitter → it never sat in the middle
//     of the bubble and drifted marker-to-marker ("криво").
//   Baking the number straight into the vector fixes both: it is part of the
//   shape, perfectly centered, and stays sharp at any zoom or DPI.
//
// Colours of the Naverny Borshchu identity (src/index.scss):
//   borshch #DC143C (the pins' red), deep #A00322, beet #860130,
//   cream #FFFAF5, sour cream #FDE5CE, ink #1A1A1A.
// The pin's disc carries a bowl, the brand's rating sign (ratings are bowls,
// never stars), instead of the old beet bulb on a light-green disc.

const RED = '#DC143C';
const RED_DEEP = '#A00322';
const BEET = '#860130';
const CREAM = '#FFFAF5';
const SMETANA_LINE = '#F0D2C3';
const INK = '#1A1A1A';
const SURFACE_DARK = '#2A1617';
const INK_DARK = '#FFFAF5';

const encode = (svg) =>
  `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

// A bowl with two wisps of steam, drawn in a 0..24 box.
const bowlGlyph = (tx, ty, color) => `
  <g transform="translate(${tx},${ty})">
    <path d="M4 11.4h16c0 3.7-2.8 6.6-6 7.4v1.2h-4v-1.2c-3.2-.8-6-3.7-6-7.4Z" fill="${color}"/>
    <path d="M9.6 4.2c-.7.9-.7 1.8 0 2.7s.7 1.8 0 2.7M14.4 4.2c-.7.9-.7 1.8 0 2.7s.7 1.8 0 2.7"
          stroke="${color}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
  </g>`;

// ---- Rating pin: pill + tail, a bowl disc on the left, grade baked in ----
// Geometry (viewBox 0 0 72 46): pill body is 34 tall, tail drops to y=42.
const PIN_BODY_H = 34;
const PIN_TAIL_Y = 42; // tail tip → the marker's anchor point
const PIN_VB_H = 46; // extra room so the drop shadow is not clipped
// One padding value used everywhere inside the pill, so the three gaps read as
// equal: edge→beet, beet→score, score→edge. (They used to be 5 / 2 / 13.)
const PAD = 7;
const DISC_R = 12;
const DISC_X = 1 + PAD; // left edge of the beet disc, after the 1px stroke
const DISC_CX = DISC_X + DISC_R;
const TEXT_START = DISC_X + DISC_R * 2 + PAD; // beet's right edge + one gap

// Rough advance widths at font-size 16 bold, enough to size the pill: scores
// are only digits and a dot. Keeps "8" from reserving the room "10.5" needs.
const textWidth = (s) =>
  [...s].reduce((sum, ch) => sum + (ch === '.' ? 4.5 : 9), 0);

const pinGeometry = (grade) => {
  const tw = grade ? textWidth(grade) : 0;
  // no score → just the beet disc, padded equally on both sides
  const w = grade
    ? Math.round(TEXT_START + tw + PAD + 1)
    : DISC_X + DISC_R * 2 + PAD + 1;
  return { w, textCx: TEXT_START + tw / 2 };
};

/**
 * @param {string} grade  e.g. "8" or "8.5" (already formatted) — empty shows just the beet
 * @param {boolean} selected  emphasised colours for the active marker
 * @param {boolean} dark  dark-theme surface
 * @param {'virgin'|'unverified'|'confirmed'|'unknown'} state  "Розвідка борщу":
 *   'virgin' places (no review at all) trade their empty score for a bold
 *   beet-filled "?" so they read as a quest worth tapping; 'unverified' ones
 *   keep the catalogue score — it is a real tasting — and only wear a beet
 *   ring saying "спільнота ще не підтвердила".
 * @returns {string} data-URI SVG
 */
export const ratingPinSvg = (grade, selected = false, dark = false, state = 'confirmed') => {
  const virgin = state === 'virgin';
  const unverified = state === 'unverified';
  const { w: PIN_W, textCx } = pinGeometry(grade);
  const rx = PIN_BODY_H / 2;
  const cx = PIN_W / 2; // tail centre
  // Selected: the brand red, cream type. Virgin (nobody has tasted it yet):
  // deep beet, so the eye lands on it as the quest it is. Otherwise a white
  // pill with a red bowl disc and ink numbers.
  const filled = selected || virgin;
  const surface = selected ? RED : virgin ? BEET : dark ? SURFACE_DARK : '#ffffff';
  const stroke = selected
    ? RED_DEEP
    : virgin
      ? BEET
      : unverified
        ? RED
        : (dark ? '#4A2E2E' : SMETANA_LINE);
  const strokeWidth = virgin || unverified || selected ? 1.8 : 1.4;
  const dash = unverified && !selected ? ' stroke-dasharray="5 4"' : '';
  const numberColor = filled ? CREAM : (dark ? INK_DARK : INK);
  const discFill = filled ? CREAM : RED;
  const bowlColor = filled ? RED : CREAM;
  const number = grade
    ? `<text x="${textCx.toFixed(1)}" y="18.5" text-anchor="middle" dominant-baseline="central"
             font-family="Roboto, Arial, sans-serif" font-size="${virgin ? 19 : 16}" font-weight="${virgin ? 800 : 700}"
             fill="${numberColor}">${grade}</text>`
    : '';

  return encode(`
<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_VB_H}" viewBox="0 0 ${PIN_W} ${PIN_VB_H}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#5a0a1e" flood-opacity="0.32"/>
    </filter>
  </defs>
  <path filter="url(#s)"
        d="M${rx + 1} 1 H${PIN_W - rx - 1}
           A${rx} ${rx} 0 0 1 ${PIN_W - 1} ${rx + 1}
           V${PIN_BODY_H - rx}
           A${rx} ${rx} 0 0 1 ${PIN_W - rx - 1} ${PIN_BODY_H}
           H${cx + 6} L${cx} ${PIN_TAIL_Y} L${cx - 6} ${PIN_BODY_H}
           H${rx + 1}
           A${rx} ${rx} 0 0 1 1 ${PIN_BODY_H - rx}
           V${rx + 1}
           A${rx} ${rx} 0 0 1 ${rx + 1} 1 Z"
        fill="${surface}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>
  <circle cx="${DISC_CX}" cy="17" r="${DISC_R}" fill="${discFill}"/>
  ${bowlGlyph(DISC_CX - 12, 5.4, bowlColor)}
  ${number}
</svg>`);
};

/**
 * Size + anchor for a rating pin at a given rendered HEIGHT — the width follows
 * from the score's own width, so every pin is the same height while short
 * scores get a shorter pill. Anchor is the tail tip, so it points at the place.
 */
export const ratingPinIcon = (grade, { height, selected = false, dark = false, state = 'confirmed' }) => {
  const { w: vbW } = pinGeometry(grade);
  // A virgin pin is deliberately the tallest thing on the map: an untasted
  // borsch is the one place a tap changes something.
  const h = state === 'virgin' ? Math.round(height * 1.12) : height;
  const w = Math.round(h * (vbW / PIN_VB_H));
  return {
    url: ratingPinSvg(grade, selected, dark, state),
    scaledSize: new window.google.maps.Size(w, h),
    anchor: new window.google.maps.Point(
      Math.round(w / 2),
      Math.round((PIN_TAIL_Y / PIN_VB_H) * h)
    ),
  };
};

// ---- Grouping bubble: solid brand-red circle with the count inside ----
// Used in two places, so grouped borsches look the same at every zoom:
//   * the marker clusterer (count supplied by the clusterer as centred text —
//     it cannot be baked in, since the style list is static)
//   * the per-city aggregate markers at low zoom (count baked in below)
const circleBody = (diameter, inner = '', dark = false) => {
  const c = diameter / 2;
  return encode(`
<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}">
  <defs>
    <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.6" flood-color="#5a0a1e" flood-opacity="0.35"/>
    </filter>
  </defs>
  <circle cx="${c}" cy="${c}" r="${c - 3}" fill="${RED}" stroke="${dark ? SURFACE_DARK : CREAM}" stroke-width="3" filter="url(#s)"/>
  ${inner}
</svg>`);
};

export const clusterCircleSvg = (diameter, dark = false) => circleBody(diameter, '', dark);

/**
 * City aggregate marker: same red circle, count baked into the vector so it
 * is centred exactly and stays sharp (the old city-marker.svg positioned its
 * label by hand at labelOrigin, which drifted as the count grew from 1 to 3
 * digits).
 */
export const countCircleIcon = (count, diameter = 44, dark = false) => {
  const c = diameter / 2;
  const text = String(count ?? '');
  // shrink the type for 3+ digits so it never touches the ring
  const fontSize = text.length >= 3 ? diameter * 0.3 : diameter * 0.38;
  const inner = `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central"
        font-family="Roboto, Arial, sans-serif" font-size="${fontSize.toFixed(1)}"
        font-weight="700" fill="#ffffff">${text}</text>`;
  return {
    url: circleBody(diameter, inner, dark),
    scaledSize: new window.google.maps.Size(diameter, diameter),
    anchor: new window.google.maps.Point(c, c),
  };
};
