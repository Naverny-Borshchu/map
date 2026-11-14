import { render, screen } from '@testing-library/react';
import { I18nProvider, useT } from './index';

/** Names typed by people (venues, guests, tip authors) go into strings exactly as typed. */
const Line = ({ k, vars }) => <p>{useT()(k, vars)}</p>;

test('«$&» and «$1» in a value stay literal', () => {
  localStorage.setItem('lang', 'uk');
  render(
    <I18nProvider>
      <Line k="table.atVenue" vars={{ venue: 'Бар $& $1 $$' }} />
    </I18nProvider>
  );
  expect(screen.getByText('Дегустація в закладі «Бар $& $1 $$»')).toBeInTheDocument();
});
