import { tokenStorage } from './tokenStorage';

/**
 * Emitted when a session cannot be revived — the access token is gone and the
 * refresh exchange failed. The name lived as a bare string in three places
 * (the API emits, UserContext adds and removes the listener), which is one
 * typo away from a listener that never fires and a UI that thinks it is still
 * signed in.
 */
export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';

const AUTH_SESSION_KEYS = [
  'accessToken',
  'userProfile',
  'user',
  'auth',
  'mode',
];

export const clearAuthSession = () => {
  tokenStorage.clear();
  AUTH_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
};
