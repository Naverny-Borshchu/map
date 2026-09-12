import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { track } from '../analytics';

/**
 * Run account-only actions without ever mutating guest-local state first.
 * The auth screen receives the exact page to return to after Google sign-in.
 */
export const useRequireAuthAction = () => {
  const { isAuthenticated } = useUser();
  const location = useLocation();
  const navigate = useNavigate();

  const requireAuth = useCallback((action) => {
    if (!isAuthenticated) {
      // Скільки разів гість упирається в екран входу і з якої саме сторінки —
      // це і є ціна гейту; без події вона невидима.
      track('guest_gate_hit', { from_path: location.pathname });
      navigate('/register', {
        state: {
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        },
      });
      return false;
    }

    action?.();
    return true;
  }, [isAuthenticated, location.hash, location.pathname, location.search, navigate]);

  return { isAuthenticated, requireAuth };
};
