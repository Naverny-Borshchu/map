import { render, screen } from '@testing-library/react';
import { I18nProvider, useCityLabel } from './index';
import { CITY_LABELS } from './translations';

// Every city the database had on 14.11.2026 once its names were unified
// (backend migration: «Berlin», «Lisboa», «Tel Aviv-Yafo» stored in
// Ukrainian). Before, the English map showed most of them in Cyrillic.
const DB_CITIES = [
  'Івано-Франківськ', 'Буковель', 'Витачів', 'Вінниця', 'Дніпро', 'Житомир', 'Запоріжжя',
  "Кам'янець-Подільський", 'Київ', 'Кривий Ріг', 'Кропивницький', 'Луцьк', 'Львів', 'Миколаїв',
  'Одеса', 'Полтава', 'Рівне', 'Ріга', 'Суми', 'Тернопіль', 'Ужгород', 'Харків', 'Хмельницький',
  'Черкаси', 'Чернівці', 'Чернігів', 'Чорна Тиса', 'Яремче', 'Берлін', 'Лісабон', 'Тель-Авів',
];

// The canonical names of the backend's dictionary (core/geo.py _CITIES): a
// new venue in one of these cities is stored under this name.
const GEO_CITIES = [
  'Київ', 'Львів', 'Одеса', 'Харків', 'Дніпро', 'Запоріжжя', 'Вінниця', 'Івано-Франківськ', 'Тернопіль',
  'Ужгород', 'Чернівці', 'Луцьк', 'Рівне', 'Полтава', 'Суми', 'Чернігів', 'Черкаси', 'Житомир', 'Миколаїв',
  'Херсон', 'Кропивницький', 'Кривий Ріг', 'Хмельницький', 'Мукачево', 'Біла Церква', 'Буковель', 'Яремче',
  'Берлін', 'Мюнхен', 'Гамбург', 'Лісабон', 'Порту', 'Тель-Авів', 'Єрусалим', 'Хайфа', 'Ріга', 'Варшава',
  'Краків', 'Вроцлав', 'Гданськ', 'Прага', 'Відень', 'Лондон', 'Париж', 'Таллінн', 'Вільнюс', 'Будапешт',
  'Братислава', 'Барселона', 'Мадрид', 'Рим', 'Мілан', 'Амстердам', 'Брюссель', 'Копенгаген', 'Стокгольм',
  'Осло', 'Гельсінкі', 'Дублін', 'Цюрих', 'Кишинів', 'Тбілісі', 'Бухарест', 'Нью-Йорк', 'Торонто',
];

test.each([['the database', DB_CITIES], ['the backend dictionary', GEO_CITIES]])(
  'every city of %s has an English label in Latin letters',
  (_, cities) => {
    const missing = cities.filter((c) => !/^[A-Za-z][A-Za-z .'-]*$/.test(CITY_LABELS.en[c] || ''));
    expect(missing).toEqual([]);
  }
);

// abroad (11.2026): a city from Google abroad is stored in English («Tokyo»);
// with no label of ours it shows as stored, in both languages
describe('a foreign city without a label of ours', () => {
  const Show = ({ city }) => <span data-testid="city">{useCityLabel()(city)}</span>;
  it.each([['uk'], ['en']])('shows its stored name (%s)', (lang) => {
    localStorage.setItem('lang', lang);
    const { unmount } = render(<I18nProvider><Show city="Tokyo" /></I18nProvider>);
    expect(screen.getByTestId('city')).toHaveTextContent(/^Tokyo$/);
    unmount();
    render(<I18nProvider><Show city="Київ" /></I18nProvider>);
    expect(screen.getByTestId('city')).toHaveTextContent(lang === 'en' ? 'Kyiv' : 'Київ');
  });
});
