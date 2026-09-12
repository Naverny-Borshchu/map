import { displayAuthorName } from './index';

/**
 * Сторінка борщу друкувала `author_username` як є, а в частини користувачів це
 * пошта (реєстрація через email/Google). Заміряно на проді 12.09.2026: під
 * відгуком стояло «eom2204@gmail.com», видиме кожному відвідувачу.
 */
describe('displayAuthorName', () => {
  it('ріже пошту до локальної частини', () => {
    expect(displayAuthorName('eom2204@gmail.com')).toBe('eom2204');
  });

  it('лишає звичайний нікнейм недоторканим', () => {
    expect(displayAuthorName('skochylias_olga')).toBe('skochylias_olga');
  });

  it('не ламається на порожньому і на null', () => {
    expect(displayAuthorName('')).toBe('');
    expect(displayAuthorName(null)).toBe('');
    expect(displayAuthorName(undefined)).toBe('');
  });

  it('не з\'їдає імʼя, якщо рядок починається з @', () => {
    expect(displayAuthorName('@borshch')).toBe('@borshch');
  });

  it('обрізає пробіли', () => {
    expect(displayAuthorName('  vokaploke  ')).toBe('vokaploke');
  });
});
