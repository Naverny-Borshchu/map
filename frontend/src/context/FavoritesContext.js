import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { favoritesAPI } from '../api';
import { useUser } from './UserContext';

const FavoritesContext = createContext(null);

const indexFavorites = (rows) => Object.fromEntries(
  (rows || []).map((row) => [String(row.borsch), row])
);

export const FavoritesProvider = ({ children }) => {
  const { isAuthenticated, loading: userLoading } = useUser();
  const [byBorsch, setByBorsch] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setByBorsch({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setByBorsch(indexFavorites(await favoritesAPI.getAll()));
      // Old builds used this as their source of truth. Keeping it would make
      // account A's favorites leak into account B on the same device.
      localStorage.removeItem('likedBorsch');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!userLoading) refresh().catch((error) => {
      console.error('Не вдалося завантажити обране:', error);
      setLoading(false);
    });
  }, [refresh, userLoading]);

  const isFavorite = useCallback(
    (borschId) => Boolean(byBorsch[String(borschId)]),
    [byBorsch]
  );

  const toggle = useCallback(async (borschId) => {
    if (!isAuthenticated) throw new Error('AUTH_REQUIRED');
    const id = String(borschId);
    const previous = byBorsch[id];

    // Reflect the click immediately; roll back only if the API rejects it.
    setByBorsch((current) => {
      const next = { ...current };
      if (previous) delete next[id];
      else next[id] = { id: `pending:${id}`, borsch: id };
      return next;
    });

    try {
      if (previous) {
        await favoritesAPI.delete(previous.id);
        return false;
      }
      const created = await favoritesAPI.create(id);
      setByBorsch((current) => ({ ...current, [id]: created }));
      return true;
    } catch (error) {
      setByBorsch((current) => {
        const next = { ...current };
        if (previous) next[id] = previous;
        else delete next[id];
        return next;
      });
      throw error;
    }
  }, [byBorsch, isAuthenticated]);

  const value = useMemo(() => ({
    favorites: Object.values(byBorsch),
    favoriteIds: Object.keys(byBorsch),
    isFavorite,
    toggle,
    refresh,
    loading,
  }), [byBorsch, isFavorite, loading, refresh, toggle]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used within FavoritesProvider');
  return context;
};
