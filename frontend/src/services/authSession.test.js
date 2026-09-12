import { clearAuthSession } from './authSession';

describe('clearAuthSession', () => {
  beforeEach(() => localStorage.clear());

  it('removes tokens, auth flags, and cached profile data without clearing unrelated preferences', () => {
    ['access', 'refresh', 'accessToken', 'userProfile', 'user', 'auth', 'mode']
      .forEach((key) => localStorage.setItem(key, `value:${key}`));
    localStorage.setItem('lang', 'uk');
    localStorage.setItem('user_location', '{"lat":50.45,"lng":30.52}');

    clearAuthSession();

    expect(localStorage.getItem('access')).toBeNull();
    expect(localStorage.getItem('refresh')).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('userProfile')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('auth')).toBeNull();
    expect(localStorage.getItem('mode')).toBeNull();
    expect(localStorage.getItem('lang')).toBe('uk');
    expect(localStorage.getItem('user_location')).toBe('{"lat":50.45,"lng":30.52}');
  });
});
