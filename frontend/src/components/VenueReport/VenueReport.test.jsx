import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { VenueReport } from './VenueReport';
import { reportVenue } from '../../analytics';

jest.mock('../../analytics', () => ({ reportVenue: jest.fn() }));

const open = (props = {}) => {
  render(
    <I18nProvider>
      <VenueReport placeName="BEEF" placeId="p-1" borschId="b-1" {...props} />
    </I18nProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Заклад зачинився або переїхав?' }));
};

describe('VenueReport', () => {
  beforeEach(() => {
    localStorage.setItem('lang', 'uk');
    reportVenue.mockReset();
    reportVenue.mockReturnValue({ delivered: true });
  });

  // Скарга має бути одним тапом: людина під зачиненими дверима не пише текст.
  it('sends on a single tap, with no text typed', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Зачинився' }));
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(reportVenue).toHaveBeenCalledWith({
      reason: 'closed',
      note: '',
      placeId: 'p-1',
      placeName: 'BEEF',
      borschId: 'b-1',
    });
    expect(screen.getByText('Дякуємо!')).toBeInTheDocument();
  });

  it('keeps send disabled until something is chosen', () => {
    open();
    const send = screen.getByRole('button', { name: 'Надіслати' });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Переїхав' }));
    expect(send).toBeEnabled();
  });

  it('carries the optional detail, trimmed', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Переїхав' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  тепер у дворі на Костьольній  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(reportVenue).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'moved', note: 'тепер у дворі на Костьольній' })
    );
  });

  // Той самий чесний шлях, що й у BugReport: канал один і відвалюється тихо.
  it('says so when the signal did not go anywhere', () => {
    reportVenue.mockReturnValue({ delivered: false });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Зачинився' }));
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(screen.queryByText('Дякуємо!')).not.toBeInTheDocument();
    expect(screen.getByText('Не вдалося надіслати')).toBeInTheDocument();
  });

  it('shows which venue is being reported', () => {
    open({ placeLabel: 'Остання барикада' });
    expect(screen.getByText('«Остання барикада»')).toBeInTheDocument();
  });
});
