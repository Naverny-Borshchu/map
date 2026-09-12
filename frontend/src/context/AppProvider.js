import { UserProvider } from './UserContext';
import { PlacesProvider } from './PlacesContext';
import { BorschProvider } from './BorschContext';
import { FiltersProvider } from './FiltersContext';
import { CommentsProvider } from './CommentsContext';
import { FavoritesProvider } from './FavoritesContext';

export const AppProvider = ({ children }) => {
  return (
    <UserProvider>
      <FiltersProvider>
        <PlacesProvider>
          <BorschProvider>
            <CommentsProvider>
              {/* below UserProvider on purpose: favourites are per-account and
                  the provider reloads them when the session changes */}
              <FavoritesProvider>
                {children}
              </FavoritesProvider>
            </CommentsProvider>
          </BorschProvider>
        </PlacesProvider>
      </FiltersProvider>
    </UserProvider>
  );
};
