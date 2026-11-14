import { dayMonth, joinMeta, NBSP } from './dates';

// «14» at the end of a line and «листопада» on the next (Мої дегустації,
// 14.11.2026): the day, the month and a number with its word never part.
test('the day and the month are joined by a no-break space', () => {
  expect(dayMonth(new Date(2026, 10, 14), 'uk')).toBe(`14${NBSP}листопада`);
  expect(dayMonth(new Date(2026, 10, 14), 'en')).toBe(`14${NBSP}November`);
});

test('a meta line wraps only after a «·», and numbers keep their words', () => {
  expect(joinMeta(['Хуторець на Дніпрі', null, '3 Борщі', '', '12 оцінок']))
    .toBe(`Хуторець на Дніпрі${NBSP}· 3${NBSP}Борщі${NBSP}· 12${NBSP}оцінок`);
});
