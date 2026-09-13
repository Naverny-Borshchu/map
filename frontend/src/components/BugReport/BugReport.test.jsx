import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { BugReport } from './BugReport';
import { reportBug } from '../../analytics';

jest.mock('../../analytics', () => ({ reportBug: jest.fn() }));

const open = () => {
  render(
    <I18nProvider>
      <BugReport />
    </I18nProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Повідомити про помилку' }));
};

const type = (text) =>
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });

describe('BugReport', () => {
  beforeEach(() => {
    localStorage.setItem('lang', 'uk');
    reportBug.mockReset();
    reportBug.mockReturnValue({ delivered: true });
  });

  it('keeps the send button disabled until there is something to read', () => {
    open();
    const send = screen.getByRole('button', { name: 'Надіслати' });
    expect(send).toBeDisabled();

    type('ой');
    expect(send).toBeDisabled();

    type('не зберігається оцінка');
    expect(send).toBeEnabled();
  });

  it('sends the trimmed message and thanks the reporter', () => {
    open();
    type('  оцінка зникла після фото  ');
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(reportBug).toHaveBeenCalledWith('оцінка зникла після фото');
    expect(screen.getByText('Дякуємо!')).toBeInTheDocument();
  });

  // Канал доставки один, і він відвалюється тихо: блокувальник ріже PostHog,
  // і скарга нікуди не їде. Подяка в цьому випадку — брехня, через яку людина
  // вирішить, що про ваду вже знають.
  it('admits it when the report did not go anywhere', () => {
    reportBug.mockReturnValue({ delivered: false });
    open();
    type('картинки не вантажаться');
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(screen.queryByText('Дякуємо!')).not.toBeInTheDocument();
    expect(screen.getByText('Не вдалося надіслати')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Написати в Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/naverny_borshchu/'
    );
  });

  it('forgets the draft after closing, so the next report starts clean', () => {
    open();
    type('щось пішло не так');
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(reportBug).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Повідомити про помилку' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
