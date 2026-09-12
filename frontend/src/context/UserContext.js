import { createContext, useContext, useState, useEffect } from 'react';
import { tokenStorage } from '../services/tokenStorage';
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthSession } from '../services/authSession';
import { identifyUser, resetAnalytics, track } from '../analytics';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Загрузка данных пользователя при инициализации. The API layer emits this
  // event when both an access token and its refresh path are no longer valid.
  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
    loadUserData();
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  // Загрузка данных пользователя из localStorage
  //
  // `auth === 'true'` alone used to be enough to count as signed in. It is not:
  // the flag survives cleared tokens. A refresh token, however, is a valid
  // resumable session: the API layer exchanges it before the next protected
  // request and stores the rotated pair returned by TokenRefreshView.
  const loadUserData = () => {
    try {
      const storedUser = localStorage.getItem('user');
      const storedAuth = localStorage.getItem('auth');
      const hasToken = !!(tokenStorage.getAccess() || tokenStorage.getRefresh());

      if (storedUser && storedAuth === 'true' && hasToken) {
        const restored = JSON.parse(storedUser);
        setUser(restored);
        setIsAuthenticated(true);
        // Повернення зі збереженою сесією — це та сама людина, а не новий
        // анонім: без цього кожен другий візит рахувався б як чужий.
        identifyUser(restored);
      } else if (storedAuth === 'true' && !hasToken) {
        // Stale session: drop the flag so the UI offers sign-in instead of
        // failing at save time.
        localStorage.removeItem('auth');
        localStorage.removeItem('user');
        localStorage.removeItem('userProfile');
      }
    } catch (error) {
      console.error('Ошибка загрузки данных пользователя:', error);
    } finally {
      setLoading(false);
    }
  };

  // Вход пользователя
  const login = (userData) => {
    const userWithTimestamp = {
      ...userData,
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    setUser(userWithTimestamp);
    setIsAuthenticated(true);
    
    localStorage.setItem('user', JSON.stringify(userWithTimestamp));
    localStorage.setItem('auth', 'true');

    identifyUser(userWithTimestamp);

    // TODO: При появлении API заменить на:
    // await api.auth.login(userData);
  };

  // Выход пользователя
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);

    track('logout');
    // Наступні події — вже інша (анонімна) людина, інакше вони б приклеїлись
    // до акаунта, з якого щойно вийшли.
    resetAnalytics();

    clearAuthSession();
  };

  // Обновление данных пользователя
  const updateUser = (updates) => {
    const updatedUser = { ...user, ...updates, updated_at: new Date().toISOString() };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));

    // TODO: При появлении API заменить на:
    // await api.user.update(updates);
  };

  // Обновление времени последней активности
  const updateLastActivity = () => {
    if (user) {
      const updatedUser = { ...user, lastActivity: new Date().toISOString() };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  // Проверка авторизации
  const checkAuth = () => {
    const auth = localStorage.getItem('auth');
    const userData = localStorage.getItem('user');
    const hasToken = !!(tokenStorage.getAccess() || tokenStorage.getRefresh());

    if (auth === 'true' && userData && hasToken) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setIsAuthenticated(true);
        return true;
      } catch (error) {
        console.error('Ошибка парсинга данных пользователя:', error);
        logout();
        return false;
      }
    }
    return false;
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    logout,
    updateUser,
    updateLastActivity,
    checkAuth
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};





