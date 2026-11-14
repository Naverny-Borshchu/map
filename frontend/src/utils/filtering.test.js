import { borschMatches, categorizeMeat, categorizePlaceType, EMPTY_FILTERS } from './filtering';

// 14.11.2026 type_meat у базі зведено до кодів бекенду. До того фільтр
// відносив pork / beef / chicken до «інше», і Борщ зі свининою зникав із
// фільтра «Свинина».
describe('categorizeMeat', () => {
  it.each([
    ['no_meat', "без м'яса"],
    ['chicken', 'курка'],
    ['pork', 'свинина'],
    ['beef', 'телятина'],
    ['other', 'інше'],
    ['PORK', 'свинина'],
    ['Свинячі ребра', 'свинина'],
    ['на яловичому бульйон', 'телятина'],
    ['з телятиною', 'телятина'],
    ["без м'яса", "без м'яса"],
    ['курка', 'курка'],
    ['качка', 'інше'],
    ['Невідомо', null],
    ['', null],
    [null, null],
  ])('%s → %s', (raw, cat) => {
    expect(categorizeMeat(raw)).toBe(cat);
  });

  it('a pork borshch passes the pork filter and not the chicken one', () => {
    const pork = { type_meat: 'pork' };
    expect(borschMatches(pork, null, { ...EMPTY_FILTERS, meats: ['свинина'] })).toBe(true);
    expect(borschMatches(pork, null, { ...EMPTY_FILTERS, meats: ['курка'] })).toBe(false);
    expect(borschMatches({ type_meat: 'beef' }, null, { ...EMPTY_FILTERS, meats: ['телятина'] })).toBe(true);
  });
});


// 28.10.2026 типи закладів у базі перекладено з російської (NAV-184), а
// російські основи («бистро», «пиц») звідси прибрано. Ці мітки — те, що
// /api/place-types/ віддає тепер; кожна мусить потрапити в ту саму групу
// фільтра, що й її російський попередник.
describe('categorizePlaceType', () => {
  it.each([
    ['Піцерія', 'Ресторан'],
    ['Бургерна', 'Ресторан'],
    ['Мʼясний ресторан', 'Ресторан'],
    ['Ресторан української кухні', 'Ресторан'],
    ['Сімейний ресторан', 'Ресторан'],
    ['Стейк-хаус', 'Ресторан'],
    ['Кондитерська', 'Кафе'],
    ['пекарня', 'Кафе'],
    ['Бістро', 'Бістро'],
    ['Винний бар', 'Паб'],
    ['Коктейль-бар', 'Паб'],
    ['Бізнес-центр', null],
  ])('%s → %s', (label, group) => {
    expect(categorizePlaceType(label)).toBe(group);
  });
});
