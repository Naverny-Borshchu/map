import { SCALE_ANSWERS, SCALE_KEYS, tasteSteps, gradesToReview, optionForValue, scaleEnds } from './answers';
import { translations } from '../../i18n/translations';

test('every criterion offers five answers mapped onto the 1–10 scale', () => {
  SCALE_KEYS.forEach((key) => {
    const options = SCALE_ANSWERS[key];
    expect(options.map((o) => o.value)).toEqual([2, 4, 6, 8, 10]);
    options.forEach((o) => {
      expect(o.emoji).toBeTruthy();
      expect(['sad', 'meh', 'happy', 'love']).toContain(o.mood);
    });
  });
});

test('salt is bipolar: its best answer is the middle one, not the last', () => {
  const salt = SCALE_ANSWERS.salt;
  expect(salt[2].mood).toBe('love');
  expect(salt[4].mood).toBe('sad');
  // and the criteria where more really is better keep their top answer on top
  expect(SCALE_ANSWERS.meat[4].mood).toBe('love');
});

test('every string the flow can render exists in both languages', () => {
  const keys = new Set();
  tasteSteps().forEach((step) => {
    keys.add(step.i18n);
    step.options.forEach((o) => {
      keys.add(o.i18n);
      keys.add(o.praise);
    });
  });

  const missing = [];
  ['uk', 'en'].forEach((lang) => {
    keys.forEach((k) => {
      if (!translations[lang][k]) missing.push(`${lang}:${k}`);
    });
  });
  expect(missing).toEqual([]);
});

test('a 1–10 score lands in the answer bucket it belongs to', () => {
  // two numbers per answer, in order
  expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => optionForValue('meat', n).value))
    .toEqual([2, 2, 4, 4, 6, 6, 8, 8, 10, 10]);
  // and out-of-range values do not fall off the table
  expect(optionForValue('meat', 0).value).toBe(2);
  expect(optionForValue('meat', 99).value).toBe(10);
  expect(optionForValue('meat', null)).toBeNull();
  expect(optionForValue('nonsense', 5)).toBeNull();
});

test('the ten-point arm keeps salt honest: the middle is the good news', () => {
  expect(optionForValue('salt', 6).mood).toBe('love');   // саме як треба
  expect(optionForValue('salt', 10).mood).toBe('sad');   // пересолений
  expect(optionForValue('salt', 1).mood).toBe('sad');    // прісний
  // while on a criterion where more is better, 10 still applauds
  expect(optionForValue('meat', 10).mood).toBe('love');
});

test('both scale anchors exist in both languages for every criterion', () => {
  const missing = [];
  SCALE_KEYS.forEach((key) => {
    const ends = scaleEnds(key);
    ['uk', 'en'].forEach((lang) => {
      [ends.left, ends.right].forEach((k) => {
        if (!translations[lang][k]) missing.push(`${lang}:${k}`);
      });
    });
  });
  expect(missing).toEqual([]);
});

test('grades are mapped onto the field names the reviews endpoint expects', () => {
  const review = gradesToReview(
    { meat: 2, beetroot: 4, density: 6, salt: 8, aftertaste: 10, serving: 2, overall: 6 },
    '  ось так  '
  );
  expect(review).toEqual({
    rating_meat: 2,
    rating_beet: 4,
    rating_density: 6,
    rating_salt: 8,
    rating_aftertaste: 10,
    rating_serving: 2,
    overall_rating: 6,
    message: 'ось так',
  });
});

test('a missing overall falls back to the mid score rather than sending null', () => {
  expect(gradesToReview({}).overall_rating).toBe(5);
});
