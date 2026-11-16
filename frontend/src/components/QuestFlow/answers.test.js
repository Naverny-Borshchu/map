import {
  RATING_SCHEME,
  SIDE_CODES,
  answersToReview,
  coinsEarned,
  emptyAnswers,
  legacyRatings,
  lowerFirst,
  ratingSteps,
  restoreAnswers,
  sidesPhrase,
  stepShare,
  summaryPhrases,
  visibleQuestions,
} from './answers';
import { translations } from '../../i18n/translations';

const t = (lang) => (key, vars) => {
  let s = translations[lang][key] ?? key;
  Object.entries(vars || {}).forEach(([k, v]) => { s = s.replace(`{${k}}`, String(v)); });
  return s;
};
const uk = t('uk');
const en = t('en');

const FULL = {
  meat_amount: 3, meat_taste: 4,
  beet_amount: 3, beet_flavor: 5,
  density: 7, salt: 5,
  sides: ['pampushky', 'sour_cream'],
  serving_taste: 4, aftertaste: 5,
  overall: 9,
};

describe('the screens', () => {
  test('six parts of the borshch, then «Загалом», in the order of the spec', () => {
    expect(ratingSteps().map((s) => s.key)).toEqual(['meat', 'beet', 'density', 'salt', 'serving', 'aftertaste', 'overall']);
    expect(ratingSteps().map((s) => s.type)).toEqual([...Array(6).fill('component'), 'overall']);
    const salt = ratingSteps().find((s) => s.key === 'salt').questions[0];
    // «саме те» is exactly the middle of the salt scale: four steps each way
    expect(salt.max).toBe(9);
    expect(salt.best).toBe(5);
    expect(salt.best - 1).toBe(salt.max - salt.best);
  });

  test('«Нема» мʼяса hides the question about its taste', () => {
    const meat = ratingSteps()[0];
    expect(visibleQuestions(meat, { meat_amount: 2 }).map((q) => q.key)).toEqual(['meat_amount', 'meat_taste']);
    expect(visibleQuestions(meat, { meat_amount: 0 }).map((q) => q.key)).toEqual(['meat_amount']);
  });

  test('a screen is shared by its answers: half a screen is half a segment', () => {
    const [meat, beet, , , serving] = ratingSteps();
    expect(stepShare(meat, {})).toBe(0);
    expect(stepShare(meat, { meat_amount: 2 })).toBe(0.5);
    expect(stepShare(meat, { meat_amount: 0 })).toBe(1);
    expect(stepShare(beet, { beet_amount: 1, beet_flavor: 2 })).toBe(1);
    // «Нічого» is an answer, an untouched question is not
    expect(stepShare(serving, { sides: [] })).toBe(0.5);
    expect(stepShare(serving, { sides: null })).toBe(0);
  });

  test('every word the flow can show exists in both languages', () => {
    const keys = new Set(['r3.kicker', 'r3.required', 'r3.optional', 'r3.best', 'r3.scaleOf', 'r3.scaleHint',
      'r3.overallLeft', 'r3.overallRight', 'r3.overallHint', 'r3.overallNote', 'r3.meatNone', 'r3.side.none',
      'r3.q.sidesHint', 'r3.q.comment', 'r3.comment.title', 'flow.send']);
    ratingSteps().forEach((step) => {
      keys.add(step.i18n);
      (step.questions || []).forEach((q) => {
        keys.add(`r3.q.${q.key}`);
        if (q.kind === 'amount') q.values.forEach((v) => keys.add(`r3.${q.key}.${v}`));
        if (q.kind === 'taste') [1, 2, 3, 4, 5].forEach((v) => keys.add(`r3.${q.key}.${v}`));
        if (q.kind === 'scale') {
          for (let v = 1; v <= q.max; v += 1) keys.add(`r3.${q.key}.${v}`);
          keys.add(`r3.${q.key}Left`);
          keys.add(`r3.${q.key}Right`);
        }
      });
    });
    SIDE_CODES.forEach((c) => ['r3.side', 'r3.sideWith', 'r3.sidePre'].forEach((p) => keys.add(`${p}.${c}`)));
    for (let v = 1; v <= 10; v += 1) keys.add(`r3.overall.${v}`);
    const missing = [];
    ['uk', 'en'].forEach((lang) => keys.forEach((k) => { if (!translations[lang][k]) missing.push(`${lang}:${k}`); }));
    expect(missing).toEqual([]);
  });

  test('the words of the spec, word for word', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => uk(`r3.density.${n}`))).toEqual([
      'як вода', 'водянистий', 'рідкий', 'рідкуватий', 'середній', 'густуватий', 'густий', 'дуже густий', 'майже пюре', 'ложка стоїть',
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => uk(`r3.salt.${n}`))).toEqual([
      'зовсім прісно', 'дуже недосолено', 'недосолено', 'трохи недосолено', 'саме те',
      'трохи пересолено', 'пересолено', 'дуже пересолено', 'сіль!',
    ]);
    expect([1, 2, 3, 4, 5].map((n) => uk(`r3.serving_taste.${n}`))).toEqual(['Абияк', 'Простенько', 'Охайно', 'Гарно', 'Хоч на обкладинку']);
    expect(SIDE_CODES.map((c) => uk(`r3.side.${c}`))).toEqual([
      'Сметана', 'Пампушки', 'Часник', 'Сало', 'Хліб', 'Грінки', 'Зелень', 'Цибуля', 'Хрін', 'Гострий перець',
    ]);
  });
});

describe('the payload, scheme 3', () => {
  test('every answer under its contract name, the overall as overall_rating', () => {
    const body = answersToReview(FULL, '  Пампушки ще теплі  ');
    expect(body).toMatchObject({
      scheme: RATING_SCHEME,
      meat_amount: 3, meat_taste: 4,
      beet_amount: 3, beet_flavor: 5,
      density: 7, salt: 5,
      // in the contract's order, whatever order they were tapped in
      sides: ['sour_cream', 'pampushky'],
      serving_taste: 4, aftertaste: 5,
      overall_rating: 9,
      message: 'Пампушки ще теплі',
    });
    expect(RATING_SCHEME).toBe(3);
  });

  test('a skipped part is null, never a made-up middle', () => {
    const body = answersToReview({ overall: 6 });
    ['meat_amount', 'meat_taste', 'beet_amount', 'beet_flavor', 'density', 'salt', 'sides', 'serving_taste', 'aftertaste']
      .forEach((k) => expect(body[k]).toBeNull());
    expect(body.overall_rating).toBe(6);
    ['rating_meat', 'rating_beet', 'rating_density', 'rating_salt', 'rating_serving', 'rating_aftertaste']
      .forEach((k) => expect(body[k]).toBeNull());
  });

  test('«Нема» мʼяса: amount 0, no taste even if one was tapped before, and the old meat field empty', () => {
    const body = answersToReview({ ...FULL, meat_amount: 0, meat_taste: 5 });
    expect(body.meat_amount).toBe(0);
    expect(body.meat_taste).toBeNull();
    expect(body.rating_meat).toBeNull();
  });

  test('sides: null is skipped, [] is «Нічого»', () => {
    expect(answersToReview({ ...FULL, sides: [] }).sides).toEqual([]);
    expect(answersToReview({ ...FULL, sides: null }).sides).toBeNull();
    expect(answersToReview({ ...FULL, sides: ['croutons', 'chili', 'nonsense'] }).sides).toEqual(['croutons', 'chili']);
  });

  test('out-of-range answers are dropped, not sent', () => {
    const body = answersToReview({ salt: 10, density: 0, meat_amount: 4, beet_flavor: 2.5, overall: 11 });
    expect(body.salt).toBeNull(); // salt is 1..9 now
    expect(body.density).toBeNull();
    expect(body.meat_amount).toBeNull();
    expect(body.beet_flavor).toBeNull();
    expect(body.overall_rating).toBeNull();
  });

  test('the old 1..10 fields follow «Як це стає рейтингом»', () => {
    expect(legacyRatings(FULL)).toEqual({
      rating_meat: 9,        // у кожній ложці 10, смачне 8
      rating_beet: 10,       // багато 10, аж на губах 10
      rating_density: 7,
      rating_salt: 5,
      rating_serving: 8,
      rating_aftertaste: 10,
    });
    // one half of a part answered: that half alone
    expect(legacyRatings({ meat_amount: 1 }).rating_meat).toBe(4);
    expect(legacyRatings({ beet_flavor: 1 }).rating_beet).toBe(2);
    expect(legacyRatings({ beet_amount: 2, beet_flavor: 3 }).rating_beet).toBe(6);
    // salt 1..9 onto the old 1..10: 1..8 as is, «сіль!» is 10
    expect(legacyRatings({ salt: 8 }).rating_salt).toBe(8);
    expect(legacyRatings({ salt: 9 }).rating_salt).toBe(10);
  });
});

describe('drafts', () => {
  test('a restored draft keeps what fits and drops the rest', () => {
    expect(restoreAnswers({ meat_amount: 2, salt: 9, sides: ['salo'], overall: 7, meat: 8, beetroot: 4 })).toEqual({
      ...emptyAnswers(), meat_amount: 2, salt: 9, sides: ['salo'], overall: 7,
    });
    expect(restoreAnswers(null)).toEqual(emptyAnswers());
    expect(restoreAnswers({ meat_amount: 0, meat_taste: 3 }).meat_taste).toBeNull();
  });
});

describe('test БорщКоіни', () => {
  test('every screen pays in proportion to what was answered, a comment pays one screen', () => {
    const steps = [...ratingSteps(), { type: 'comment', key: 'comment' }];
    expect(coinsEarned(steps, {})).toBe(0);
    expect(coinsEarned(steps, { overall: 8 })).toBe(10);
    expect(coinsEarned(steps, { meat_amount: 2, overall: 8 })).toBe(15);
    expect(coinsEarned(steps, { ...FULL, comment: 'смачно' })).toBe(80);
    expect(coinsEarned(steps, { ...FULL, comment: '   ' })).toBe(70);
  });
});

describe('«Твій Борщ у двох словах»', () => {
  test('the phrases of the prototype, in the order of the screens', () => {
    expect(summaryPhrases(FULL, uk, 'uk')).toEqual([
      'Мʼяса в кожній ложці',
      'Буряку багато, аж на губах',
      'Густий',
      'Сіль саме те',
      'Зі сметаною й пампушками',
    ]);
    expect(summaryPhrases({ meat_amount: 0, sides: [] }, uk, 'uk')).toEqual(['Без мʼяса', 'Без додатків']);
    expect(summaryPhrases({ beet_flavor: 4 }, uk, 'uk')).toEqual(['Буряк яскраво на смак']);
    expect(summaryPhrases({ overall: 8 }, uk, 'uk')).toEqual([]);
  });

  test('sides: з / зі / із by the first word, і / й by the sounds around the last', () => {
    expect(sidesPhrase(['sour_cream', 'salo'], uk, 'uk')).toBe('Зі сметаною й салом');
    expect(sidesPhrase(['greens'], uk, 'uk')).toBe('Із зеленню');
    expect(sidesPhrase(['garlic', 'bread', 'croutons'], uk, 'uk')).toBe('З часником, хлібом і грінками');
    expect(sidesPhrase(['onion', 'horseradish', 'chili'], uk, 'uk')).toBe('З цибулею, хроном і гострим перцем');
    expect(sidesPhrase(['sour_cream', 'pampushky', 'chili'], en, 'en')).toBe('With sour cream, pampushky and chilli');
  });
});

describe('lowerFirst', () => {
  test('a capitalised answer reads as a word inside a line, the English I stays', () => {
    expect(lowerFirst('Хочу ще, зараз!', 'uk')).toBe('хочу ще, зараз!');
    expect(lowerFirst('Гострий перець', 'uk')).toBe('гострий перець');
    expect(lowerFirst('I want more, now!', 'en')).toBe('I want more, now!');
    expect(lowerFirst('I need to eat something else', 'en')).toBe('I need to eat something else');
    expect(lowerFirst('Pleasant', 'en')).toBe('pleasant');
  });
});
