const ACCESS_KEY = "access";
const REFRESH_KEY = "refresh";

export const tokenStorage = {
    getAccess: () => localStorage.getItem(ACCESS_KEY),

    getRefresh: () => localStorage.getItem(REFRESH_KEY),

    setTokens: (access, refresh) => {
        localStorage.setItem(ACCESS_KEY, access);
        localStorage.setItem(REFRESH_KEY, refresh);
    },

    clear: () => {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
    },
};
