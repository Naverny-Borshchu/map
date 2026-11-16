/* Hand-made top-view bowl pictograms for the «скільки» answers (Оцінювання 3.0,
   NAV-216), ported as is from the approved prototype (nb-rating-v3/dist/proto/bowls.js).
   One plate, one broth, the same constant garnish in every bowl; only the thing
   being asked about changes, so each series reads as a scale. Drawn in the NB
   logo's language: cream plate with a double ink ring, a crimson broth with a
   darker fold at the lower right, red splashes on the rim.

   Static strings of our own drawing, no user data: BowlArt renders them with
   dangerouslySetInnerHTML. The plate keeps its ink on the dark theme
   (index.scss, .nb-plate). */

const INK = '#1A1A1A', CREAM = '#FFFAF5', RED = '#DC143C', DEEP = '#A00322', BEET = '#860130',
    DILL = '#40D05F', CARROT = '#FC7536', SOUR = '#FDE5CE',
    MEAT = '#8A3418', MEAT_HI = '#B85C31', MEAT_LO = '#5E1F0C';

function f(v) { return Math.round(v * 10) / 10; }

// Closed Catmull-Rom curve through points at equal angles: an organic, not quite round, broth.
function blob(cx, cy, rs, k) {
  k = k || 1;
  const n = rs.length, pts = [];
  let d, i;
  for (i = 0; i < n; i++) {
    const t = i / n * 2 * Math.PI - Math.PI / 2;
    pts.push([cx + Math.cos(t) * rs[i] * k, cy + Math.sin(t) * rs[i] * k]);
  }
  d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
  for (i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
      f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
  }
  return d + 'Z';
}
const RAD = [34, 32.6, 33.8, 32.4, 34.2, 32.8, 33.4, 32.2];
const BLOB = blob(50, 51, RAD), BLOB_IN = blob(48.6, 49.3, RAD, 0.95);

function plate() {
  return '<circle cx="50" cy="50" r="47" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="2.2"/>' +
    '<circle cx="50" cy="50" r="43.4" fill="none" stroke="' + INK + '" stroke-width=".9"/>' +
    '<ellipse cx="19.4" cy="24.6" rx="2.4" ry="1.5" transform="rotate(-40 19.4 24.6)" fill="' + RED + '"/>' +
    '<ellipse cx="88.6" cy="37" rx="1.5" ry="1.1" fill="' + RED + '"/>' +
    '<ellipse cx="74.4" cy="84.6" rx="2.1" ry="1.4" transform="rotate(-35 74.4 84.6)" fill="' + RED + '"/>';
}
function broth(fill, shade) {
  return '<path d="' + BLOB + '" fill="' + shade + '"/><path d="' + BLOB_IN + '" fill="' + fill + '"/>';
}
function tr(x, y, r, s) { return ' transform="translate(' + x + ' ' + y + ') rotate(' + (r || 0) + ')' + (s ? ' scale(' + s + ')' : '') + '"'; }

function dill(x, y, r, s) {
  return '<g' + tr(x, y, r, s) + ' fill="none" stroke="' + DILL + '" stroke-width="1.5" stroke-linecap="round">' +
    '<path d="M0 0 L0 -13"/><path d="M0 -3.5 l-3.6 -3 M0 -3.5 l3.6 -3 M0 -7.5 l-3 -2.6 M0 -7.5 l3 -2.6 M0 -11 l-2.2 -2 M0 -11 l2.2 -2"/></g>';
}
function carrot(x, y, r) {
  return '<rect x="-2.6" y="-2.6" width="5.2" height="5.2" rx="1.2"' + tr(x, y, r) + ' fill="' + CARROT + '"/>';
}
function chunk(x, y, r, s) {
  return '<g' + tr(x, y, r, s) + '>' +
    '<rect x="-6.4" y="-5.2" width="12.8" height="10.4" rx="2.6" fill="' + MEAT + '" stroke="' + INK + '" stroke-width=".8"/>' +
    '<path d="M-6 -1.4 Q0 -3.6 6 -1.4 L6 -2.6 Q6 -4.8 3.6 -4.8 L-3.6 -4.8 Q-6 -4.8 -6 -2.6Z" fill="' + MEAT_HI + '"/>' +
    '<path d="M-3.2 .6 l-.6 3 M0 .4 l-.5 3.3 M3.2 .6 l-.6 3" stroke="' + MEAT_LO + '" stroke-width=".9" stroke-linecap="round"/></g>';
}
function fibre(x, y, r) {
  // a thin torn sliver of boiled meat, pointed at both ends
  return '<g' + tr(x, y, r) + '><path d="M-7.5 .4 Q-2 -2.6 7.5 -.6 Q1 2.2 -7.5 .4Z" fill="#C98059" stroke="' + INK + '" stroke-width=".8" stroke-linejoin="round"/>' +
    '<path d="M-4.5 .1 Q0 -1 4.5 -.4" fill="none" stroke="' + MEAT_LO + '" stroke-width=".6" stroke-linecap="round" opacity=".7"/></g>';
}
function strip(x, y, r, len) {
  len = len || 13;
  return '<rect x="-1.7" y="' + (-len / 2) + '" width="3.4" height="' + len + '" rx="1.7"' + tr(x, y, r) +
    ' fill="' + BEET + '" stroke="#4A0019" stroke-width=".55"/>';
}
function cabbage(x, y, r) {
  return '<path d="M-5 1 Q0 -2.4 5 .6"' + tr(x, y, r) + ' fill="none" stroke="' + SOUR + '" stroke-width="2.2" stroke-linecap="round"/>';
}
function ripple(cx, cy, rx, ry, a0, a1) {
  const p = function (a) { return [f(cx + Math.cos(a) * rx), f(cy + Math.sin(a) * ry)]; };
  const s = p(a0), e = p(a1);
  return '<path d="M' + s[0] + ' ' + s[1] + ' A' + rx + ' ' + ry + ' 0 0 1 ' + e[0] + ' ' + e[1] + '" fill="none" stroke="rgba(255,250,245,.75)" stroke-width="1.5" stroke-linecap="round"/>';
}
function spoon() {
  // a wooden spoon stuck upright in the middle: the handle rises out of the bowl toward the viewer
  return '<path d="M51 57 L77 66 Q80 68 76 70 L50 62Z" fill="#5C0018" opacity=".4"/>' +
    '<ellipse cx="50.5" cy="58" rx="6" ry="3.2" fill="#7A0020" stroke="' + INK + '" stroke-width=".8"/>' +
    '<path d="M46.6 57.6 L55.2 9 Q56.2 3.6 61.6 4.4 Q66.6 5.4 65.6 10.6 L54.6 58.6 Q50.6 60.6 46.6 57.6Z" fill="#C98A53" stroke="' + INK + '" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M51 52 L58.6 10.4" stroke="#E7B585" stroke-width="2" stroke-linecap="round"/>';
}

function svg(onPlate, label) {
  return '<svg class="picto" viewBox="0 0 100 100" ' + (label ? 'role="img" aria-label="' + label + '"' : 'aria-hidden="true" focusable="false"') + '>' +
    plate() + '<g transform="translate(50 51) scale(1.09) translate(-50 -51)">' + onPlate + '</g></svg>';
}

// constant garnish under each series (drawn first, so dense bowls cover it naturally)
const GARNISH = carrot(37, 67, 18) + carrot(67, 37, -12) + dill(64, 72, 38, 0.95);

const MEAT_LV = [
  [],
  [fibre(40, 43, -18), fibre(59, 54, 28), fibre(44, 62, -4)],
  [chunk(40, 41, -14), chunk(61, 50, 18), chunk(45, 63, 6)],
  [chunk(37, 36.5, -12), chunk(53, 31.5, 10), chunk(67.5, 40, -20), chunk(44, 48.5, 14), chunk(60, 52, -6),
    chunk(74, 56.5, 22), chunk(30.5, 55, 8), chunk(39.5, 66, -10), chunk(55, 66, -16), chunk(68.5, 70.5, 12)]
];
const BEET_LV = [
  null,
  [strip(42, 45, 32), strip(59, 59, -40)],
  [strip(38, 41, 30), strip(55, 37, -62), strip(64, 52, 12), strip(45, 55, -28), strip(34, 59, 70), strip(57, 66, 48), strip(70, 63, -10)],
  [strip(33, 40, 30), strip(44, 33, -64), strip(57, 32, 20), strip(68, 41, -30), strip(48, 44, 78), strip(39, 52, -12),
    strip(60, 48, 40), strip(73, 52, 6), strip(29, 58, 60), strip(51, 57, -50), strip(66, 61, 74), strip(40, 66, 28),
    strip(56, 69, -18), strip(71, 70, 52), strip(47, 76, 84), strip(33, 70, -36)]
];
const BROTH_LV = [
  null,
  { fill: '#E7536F', shade: '#CC3553', bits: ripple(50, 51, 25, 21, 3.5, 5.3) + ripple(50, 51, 17, 14, 3.7, 5.0) + ripple(50, 51, 20, 16, 0.5, 1.9) + strip(41, 58, 40, 10) + carrot(60, 44, 20) + dill(36, 44, -30, .9) },
  { fill: '#E02D50', shade: '#B90F36', bits: ripple(50, 51, 22, 18, 3.7, 5.1) + strip(40, 44, 32, 11) + strip(60, 60, -36, 11) + cabbage(58, 42, -10) + carrot(42, 63, 15) + dill(66, 68, 35, .9) },
  { fill: RED, shade: DEEP, bits: cabbage(38, 40, -20) + cabbage(60, 36, 15) + cabbage(46, 58, 30) + cabbage(68, 58, -35) +
      strip(48, 41, 70, 11) + strip(34, 52, 20, 11) + strip(58, 50, -30, 11) + strip(55, 67, 60, 11) +
      carrot(42, 67, 12) + carrot(67, 46, -20) + carrot(52, 31, 30) + dill(30, 62, -40, .9) },
  { fill: '#C8102E', shade: '#8E0225', bits: cabbage(36, 39, -20) + cabbage(48, 32, 10) + cabbage(64, 35, 25) + cabbage(31, 55, 60) +
      cabbage(66, 66, -35) + cabbage(43, 70, 15) + cabbage(74, 50, 80) +
      strip(42, 46, 70, 11) + strip(70, 41, 20, 11) + strip(36, 64, -30, 11) + strip(59, 72, 60, 11) + strip(64, 56, -60, 10) +
      carrot(44, 39, 12) + carrot(58, 42, -20) + carrot(27, 47, 30) + carrot(52, 76, 0) + carrot(72, 62, 40) +
      dill(39, 60, -40, .85) + spoon() }
];

// nothing chosen yet: a clean plate, no broth, no splashes
export const emptyPlate = () =>
  '<svg class="picto" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
  '<circle cx="50" cy="50" r="47" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="2.2"/>' +
  '<circle cx="50" cy="50" r="43.4" fill="none" stroke="' + INK + '" stroke-width=".9"/>' +
  '<circle cx="50" cy="51" r="34" fill="none" stroke="#C9AEA6" stroke-width="1.8" stroke-dasharray="5 5"/></svg>';

export const bowlArt = {
  empty: emptyPlate,
  meat: (v) => svg(broth(RED, DEEP) + GARNISH + MEAT_LV[v].join('')),
  beet: (v) => svg(broth(RED, DEEP) + carrot(66, 36, -12) + dill(64, 73, 38, 0.95) + BEET_LV[v].join('')),
  broth: (v) => {
    const b = BROTH_LV[v];
    return svg(broth(b.fill, b.shade) + b.bits);
  },
};

/** The density rail: a wedge from watery pink to deep beet. `id` keeps two on one page apart. */
export const densityRail = (id) =>
  '<svg viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>' +
  '<linearGradient id="' + id + '" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#F7C6D0"/><stop offset=".5" stop-color="#E02D50"/><stop offset="1" stop-color="#8E0225"/></linearGradient></defs>' +
  '<path d="M8 18.5 L292 2 Q300 1.5 300 9 L300 35 Q300 42.5 292 42 L8 25.5 Q3 25.2 3 22 Q3 18.8 8 18.5Z" fill="url(#' + id + ')"/></svg>';
