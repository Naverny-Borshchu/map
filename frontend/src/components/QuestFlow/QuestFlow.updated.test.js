import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { QuestFlow } from './QuestFlow';
import { ratingSteps } from './answers';

/**
 * One rating per person per borshch (11.2026): a second rating updates the
 * first. The closing screen says so, pays nothing for it, and keeps the total.
 */

const steps = [...ratingSteps(), { type: 'done', key: 'done' }];
const values = { meat_amount: 2, meat_taste: 4, overall: 8 };

const renderDone = (status, lang = 'uk') => {
  localStorage.setItem('lang', lang);
  return render(
    <I18nProvider>
      <QuestFlow
        steps={steps}
        values={values}
        onChange={() => {}}
        onSubmit={() => {}}
        onExit={() => {}}
        initialStep={steps.length - 1}
        xp={{ perStep: 10, multiplier: 3, total: 120 }}
        status={{ saving: false, sent: true, error: '', ...status }}
        done={{ title: 'Дякуємо за відгук!', text: '', cta: 'До Борщу' }}
      />
    </I18nProvider>
  );
};

test('an updated rating: +0, no multiplier, the total as it was, and the note', () => {
  renderDone({ updated: true });
  expect(screen.getByText('+0 BRSH')).toBeInTheDocument();
  expect(screen.queryByText('×3')).not.toBeInTheDocument();
  expect(screen.getByText('Разом у тебе: 120 BRSH')).toBeInTheDocument();
  expect(screen.getByTestId('review-updated')).toHaveTextContent(
    'Твою попередню оцінку цього Борщу оновлено. Нових BRSH за повторну оцінку нема.'
  );
});

test('in English', () => {
  renderDone({ updated: true }, 'en');
  expect(screen.getByTestId('review-updated')).toHaveTextContent(
    'You had rated this borshch before, so we updated your rating. A second rating earns no new BRSH.'
  );
});

test('a new rating (or an older backend that says nothing): paid as before, no note', () => {
  renderDone({});
  expect(screen.queryByText('+0 BRSH')).not.toBeInTheDocument();
  expect(screen.getAllByText('×3').length).toBeGreaterThan(0);
  expect(screen.queryByTestId('review-updated')).not.toBeInTheDocument();
});
