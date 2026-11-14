import { addressLine, borschTitle, divisiveLabel, formatAverage, nextUnrated } from './tableView';
import { storyContent } from './storyImage';
import { qrMatrix, qrPath } from './qr';
import { translations } from '../i18n/translations';

const t = (key, vars) => {
  let s = translations.uk[key] ?? key;
  if (vars && typeof vars.count === 'number') {
    const n = Math.abs(vars.count) % 100;
    const n1 = n % 10;
    if (vars.count === 1 && translations.uk[`${key}_one`]) s = translations.uk[`${key}_one`];
    else if (n1 >= 2 && n1 <= 4 && (n < 12 || n > 14) && translations.uk[`${key}_few`]) s = translations.uk[`${key}_few`];
  }
  Object.entries(vars || {}).forEach(([k, v]) => { s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)); });
  return s;
};

const RESULTS = {
  code: 'K7M2QX',
  title: 'День Борщу у Львові',
  status: 'closed',
  blind: true,
  names_hidden: false,
  closed_at: '2026-11-21T15:00:00+02:00',
  place: { name: 'Ватра', city: 'Львів' },
  raters_total: 14,
  overall_average: 7.4,
  borsches: [
    { position: 1, borsch: { id: 'b1', name: 'Червоний' }, rater_count: 14, averages: { overall_rating: 7.9, rating_salt: 6.1 }, most_divisive: { criterion: 'rating_salt', stddev: 2.31 } },
    { position: 2, borsch: { id: 'b2', name: 'Зелений' }, rater_count: 12, averages: { overall_rating: 6.8 }, most_divisive: null },
  ],
  most_divisive: { position: 1, criterion: 'rating_salt', stddev: 2.31 },
};

describe('reading a table', () => {
  it('a borshch of an open blind table is only its number', () => {
    expect(borschTitle({ position: 2, borsch: null }, t)).toBe('Борщ №2');
    expect(borschTitle({ position: 2, borsch: { name: 'Зелений' } }, t)).toBe('Зелений');
  });

  it('the next borshch to rate is the first one not rated yet', () => {
    const bs = [{ position: 1 }, { position: 2 }, { position: 3 }];
    expect(nextUnrated(bs, [])).toBe(1);
    expect(nextUnrated(bs, [1])).toBe(2);
    expect(nextUnrated(bs, [2, 1])).toBe(3);
    expect(nextUnrated(bs, [1, 2, 3])).toBeNull();
  });

  it('writes the city after the address only when the address lacks it', () => {
    expect(addressLine({ address: 'вул. Набережно-Хрещатицька, 10А, Київ, 04070', city: 'Київ' })).toBe('вул. Набережно-Хрещатицька, 10А, Київ, 04070');
    expect(addressLine({ address: 'пл. Ринок, 1', city: 'Львів' }, () => 'Lviv')).toBe('пл. Ринок, 1, Lviv');
    expect(addressLine({ address: '', city: 'Львів' })).toBe('Львів');
    expect(addressLine(null)).toBe('');
  });

  it('averages with one decimal at most', () => {
    expect(formatAverage(7.4)).toBe('7.4');
    expect(formatAverage(8)).toBe('8');
    expect(formatAverage(7.96)).toBe('8');
    expect(formatAverage(null)).toBe('');
  });

  it('names the most divisive criterion, and on a table of several, the borshch', () => {
    expect(divisiveLabel(RESULTS, t)).toEqual({ criterion: 'Солоність', borsch: 'Червоний' });
    const one = { ...RESULTS, borsches: [RESULTS.borsches[0]] };
    expect(divisiveLabel(one, t)).toEqual({ criterion: 'Солоність', borsch: null });
    expect(divisiveLabel({ ...RESULTS, most_divisive: null }, t)).toBeNull();
  });
});

describe('the story picture says', () => {
  const content = storyContent(RESULTS, { t, lang: 'uk' });

  it('the title, the venue, the table average and how many rated', () => {
    expect(content.title).toBe('День Борщу у Львові');
    expect(content.place).toBe('Ватра, Львів');
    expect(content.kicker).toMatch(/^Дегустація · 21 листопада$/);
    expect(content.average).toBe('7.4');
    expect(content.raters).toBe('14');
    expect(content.ratersLabel).toBe('людей оцінили');
  });

  it('each borshch with its revealed name and score, and the divisive criterion', () => {
    expect(content.rows).toEqual([
      { number: '№1', name: 'Червоний', value: '7.9', percent: 79 },
      { number: '№2', name: 'Зелений', value: '6.8', percent: 68 },
    ]);
    expect(content.divisive).toEqual({ label: 'Найсуперечливіше', criterion: 'Солоність', borsch: 'Червоний' });
  });

  it('keeps to the brand: no dashes, no hryvnia sign, no emoji', () => {
    const text = JSON.stringify({ ...content, moreLabel: content.moreLabel(3) });
    expect(text).not.toMatch(/[—–₴]/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('the QR code', () => {
  it('is made on the device, the same for the same link', () => {
    const m = qrMatrix('https://map.navernyborshchu.com/t/K7M2QX');
    expect(m.size).toBeGreaterThanOrEqual(21);
    const path = qrPath(m);
    expect(path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    expect(qrPath(qrMatrix('https://map.navernyborshchu.com/t/K7M2QX'))).toBe(path);
    expect(qrPath(qrMatrix('https://map.navernyborshchu.com/t/K7M2QY'))).not.toBe(path);
    expect(qrMatrix('')).toBeNull();
  });
});
