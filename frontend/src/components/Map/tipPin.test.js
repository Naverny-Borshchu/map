import { tipPinSvg } from './markerIcons';

/** «Кажуть, тут є Борщ»: grey, round, with a question mark; dashed until confirmed. */
const svg = (opts) => decodeURIComponent(tipPinSvg(opts).replace('data:image/svg+xml,', ''));

test('a tip is grey and never carries a score', () => {
  const open = svg({});
  expect(open).toContain('#8E8580');
  expect(open).toContain('>?</text>');
  expect(open).not.toMatch(/#DC143C/);
});

test('dashed while it is one person\'s word, solid once confirmed, red ring when open in the sheet', () => {
  expect(svg({})).toContain('stroke-dasharray');
  expect(svg({ confirmed: true })).not.toContain('stroke-dasharray');
  expect(svg({ selected: true })).toContain('#DC143C');
  expect(svg({ dark: true })).toContain('#5A514D');
});
