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
// Brand colours are taken from the live app design system (src/index.scss):
//   green primary  #638758  (--color-text-active, Green/900)
//   green 400      #BAE9AC  (--color-add-btn)
//   beet accent    #A71E5B  (existing beet/city-marker colour)
//   text           #1A1A1A  (--color-text-btn)

const GREEN = '#638758';
const GREEN_400 = '#BAE9AC';
const BEET = '#A71E5B';
const INK = '#1A1A1A';
const SURFACE_DARK = '#242424';
const INK_DARK = '#ECECEC';

const encode = (svg) =>
  `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

// A compact beet bulb (body + stem/leaves), drawn in a 0..24 box.
const beetGlyph = (tx, ty) => `
  <g transform="translate(${tx},${ty})">
    <path d="M12 8 C8.7 8 6.5 10.4 6.5 13.2 C6.5 16.4 9.4 19.2 12 21
             C14.6 19.2 17.5 16.4 17.5 13.2 C17.5 10.4 15.3 8 12 8 Z" fill="${BEET}"/>
    <path d="M12 8 L12 4 M12 5.4 L14.7 3.7 M12 5.4 L9.3 3.7"
          stroke="${GREEN}" stroke-width="1.6" stroke-linecap="round" fill="none"/>
  </g>`;

// ---- Rating pin: white pill + tail, beet on the left, grade baked in ----
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
  // A virgin pin inverts: solid beet body, white glyph. That contrast is what
  // makes it the thing your eye lands on and your thumb goes for.
  const surface = virgin ? BEET : dark ? SURFACE_DARK : '#ffffff';
  const stroke = selected
    ? GREEN
    : virgin
      ? BEET
      : unverified
        ? BEET
        : (dark ? '#3A3A3A' : '#D8D8D8');
  const strokeWidth = virgin || unverified ? 1.8 : 1.2;
  const dash = unverified && !selected ? ' stroke-dasharray="5 4"' : '';
  const numberColor = virgin
    ? '#ffffff'
    : selected
      ? GREEN
      : (dark ? INK_DARK : INK);
  const number = grade
    ? `<text x="${textCx.toFixed(1)}" y="18.5" text-anchor="middle" dominant-baseline="central"
             font-family="Roboto, Arial, sans-serif" font-size="${virgin ? 19 : 16}" font-weight="${virgin ? 800 : 700}"
             fill="${numberColor}">${grade}</text>`
    : '';

  return encode(`
<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_VB_H}" viewBox="0 0 ${PIN_W} ${PIN_VB_H}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-color="#000000" flood-opacity="0.28"/>
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
  <circle cx="${DISC_CX}" cy="17" r="${DISC_R}" fill="${virgin ? '#ffffff' : GREEN_400}"/>
  ${beetGlyph(DISC_CX - 12, 3)}
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

// ---- Grouping bubble: solid brand-green circle with the count inside ----
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
      <feDropShadow dx="0" dy="1" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="${c}" cy="${c}" r="${c - 3}" fill="${GREEN}" stroke="${dark ? SURFACE_DARK : '#ffffff'}" stroke-width="3" filter="url(#s)"/>
  ${inner}
</svg>`);
};

export const clusterCircleSvg = (diameter, dark = false) => circleBody(diameter, '', dark);

/**
 * City aggregate marker: same green circle, count baked into the vector so it
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
