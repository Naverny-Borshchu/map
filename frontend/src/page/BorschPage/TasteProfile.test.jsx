import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../i18n';
import { normalizeProfile } from '../../utils/tasteProfile';
import { PROFILE } from '../../utils/tasteProfile.fixture';
import { TasteProfile } from './TasteProfile';

// react-router-dom v7 pulls 'react-router/dom', which CRA's jest resolver cannot find
jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../components/RatingIconsSvg/icon_soup.svg', () => ({ ReactComponent: () => <i data-bowl="full" /> }));
jest.mock('../../components/RatingIconsSvg/icon_soup_light.svg', () => ({ ReactComponent: () => <i data-bowl="empty" /> }));

const renderCard = (profile, lang = 'uk') => {
  localStorage.setItem('lang', lang);
  return render(
    <MemoryRouter>
      <I18nProvider>
        <TasteProfile profile={profile} rateTo="/borsch/b1/evaluations" />
      </I18nProvider>
    </MemoryRouter>
  );
};

afterEach(() => localStorage.clear());

test('«Який він» from the profile: amounts, density and salt on their scales, sides', () => {
  renderCard(normalizeProfile(PROFILE));
  const desc = screen.getByRole('region', { name: 'Який він' });
  expect(within(desc).getByText('З 9 оцінок за новою схемою')).toBeInTheDocument();
  // meat: the most common amount and how many say so
  expect(within(desc).getByText('У кожній ложці')).toBeInTheDocument();
  expect(within(desc).getAllByText('так кажуть 6 з 9')).toHaveLength(2);
  // beetroot: the amount and how strongly it is felt
  expect(within(desc).getByText(/Багато/)).toBeInTheDocument();
  expect(within(desc).getByText(/яскраво на смак/)).toBeInTheDocument();
  // density: the mean with Pasha's word, masculine
  expect(within(desc).getByText('7,6')).toBeInTheDocument();
  expect(within(desc).getByText(/дуже густий/)).toBeInTheDocument();
  // salt on the 1..9 balance, with the low and high notes
  expect(within(desc).getByText('5,3')).toBeInTheDocument();
  expect(within(desc).getByText(/саме те/)).toBeInTheDocument();
  expect(within(desc).getByText('2 з 9: недосолено')).toBeInTheDocument();
  expect(within(desc).getByText(/1 з 9: пересолено/)).toBeInTheDocument();
  // sides: the ones at least half bring as chips, the rest mentioned
  ['Сметана', 'Пампушки', 'Сало'].forEach((c) => expect(within(desc).getByText(c)).toBeInTheDocument());
  expect(within(desc).getByText('ще згадують: часник, хліб, зелень')).toBeInTheDocument();
  // no old criteria bars, and no «be the first» when there is a description
  expect(screen.queryByText(/Смак за критеріями|Солоність/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Опис ще збираємо/)).not.toBeInTheDocument();
});

test('«Оцінки»: three tastes as a mean and five bowls each', () => {
  renderCard(normalizeProfile(PROFILE));
  const scores = screen.getByRole('region', { name: 'Оцінки' });
  expect(within(scores).getByText('Мʼясо на смак')).toBeInTheDocument();
  expect(within(scores).getByText('4,6')).toBeInTheDocument();
  expect(within(scores).getByText('неймовірне')).toBeInTheDocument();
  expect(within(scores).getByText('Післясмак')).toBeInTheDocument();
  expect(within(scores).getByText('4,4')).toBeInTheDocument();
  expect(within(scores).getByText('Подача')).toBeInTheDocument();
  expect(within(scores).getByRole('img', { name: '4,1 з 5' })).toBeInTheDocument();
  // 5 + 4 + 4 full bowls out of 3 × 5
  expect(scores.querySelectorAll('[data-bowl]')).toHaveLength(15);
  expect(scores.querySelectorAll('[data-bowl="full"]')).toHaveLength(13);
});

test('no profile at all (an API before scheme 3): «Опис ще збираємо» with the rate button, no crash', () => {
  renderCard(null);
  expect(screen.getByRole('heading', { name: 'Який він' })).toBeInTheDocument();
  expect(screen.getByText('Опис ще збираємо. Оціни першим за складниками')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Оцінити за складниками' })).toHaveAttribute('href', '/borsch/b1/evaluations');
  expect(screen.queryByRole('region', { name: 'Оцінки' })).not.toBeInTheDocument();
});

test('an empty profile reads the same as none', () => {
  renderCard(normalizeProfile({ reviews: 0 }));
  expect(screen.getByText('Опис ще збираємо. Оціни першим за складниками')).toBeInTheDocument();
});

test('only the founders’ catalogue: density and salt, and the invitation to describe the rest', () => {
  renderCard(normalizeProfile({
    reviews: 0,
    density: { mean: 6.2, n: 0, legacy_n: 3 },
    salt: { mean: 5, n: 0, legacy_n: 3, low: 0, high: 0 },
  }));
  expect(screen.getByText('Густина й сіль поки з каталогу засновників')).toBeInTheDocument();
  expect(screen.getByText(/густуватий/)).toBeInTheDocument();
  expect(screen.getAllByText('середнє з 3')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Оцінити за складниками' })).toBeInTheDocument();
});

test('English: borshch words and a point for decimals', () => {
  renderCard(normalizeProfile(PROFILE), 'en');
  expect(screen.getByRole('heading', { name: 'What it is like' })).toBeInTheDocument();
  expect(screen.getByText('7.6')).toBeInTheDocument();
  expect(screen.getByText('In every spoonful')).toBeInTheDocument();
  expect(screen.getByText('also mentioned: garlic, bread, greens')).toBeInTheDocument();
});

test('tastes answered but nothing described yet: the invitation, and the scores still show', () => {
  renderCard(normalizeProfile({ reviews: 2, aftertaste: { mean: 4.5, n: 2 } }));
  expect(screen.getByText('Опис ще збираємо. Оціни першим за складниками')).toBeInTheDocument();
  const scores = screen.getByRole('region', { name: 'Оцінки' });
  expect(within(scores).getByText('Післясмак')).toBeInTheDocument();
  expect(within(scores).queryByText('Подача')).not.toBeInTheDocument();
});
