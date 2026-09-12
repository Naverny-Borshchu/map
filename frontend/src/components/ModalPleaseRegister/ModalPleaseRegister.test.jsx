import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { ModalPleaseRegister } from './ModalPleaseRegister';

jest.mock('../../assets/images/logo.svg', () => ({
  ReactComponent: () => null,
}));

describe('ModalPleaseRegister', () => {
  beforeEach(() => {
    localStorage.setItem('lang', 'uk');
  });

  it.each([390, 1440])(
    'starts registration without also dismissing at %ipx',
    (viewportWidth) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: viewportWidth,
      });
      const onRegisterPage = jest.fn();
      const onClose = jest.fn();

      render(
        <I18nProvider>
          <ModalPleaseRegister
            asPage
            onRegisterPage={onRegisterPage}
            onClose={onClose}
            onGoToMap={jest.fn()}
          />
        </I18nProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Створити профіль' }));

      expect(onRegisterPage).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    }
  );
});
