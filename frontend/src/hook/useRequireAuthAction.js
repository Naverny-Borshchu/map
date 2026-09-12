import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

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
