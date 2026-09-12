import { tokenStorage } from "./tokenStorage";
import { identifyUser, track } from "../analytics";

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.navernyborshchu.com/api';
const DEFAULT_AUTH_MODE = 1;

export async function googleAuth(idToken) {
    if (!idToken) {
        throw new Error("Google ID token is missing");
    }

    const response = await fetch(`${API_BASE_URL}/auth/google/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ id_token: idToken }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        track('auth_failed', { method: 'google', status: response.status });
        throw new Error(data?.detail || data?.message || "Google auth request failed");
    }

    return data;
}

// Єдине місце, де успішний вхід через Google перетворюється на сесію, — тож
// і подія входу живе тут, а не в кожному з чотирьох екранів, що його кличуть.
export function persistGoogleAuthSession(data) {
    tokenStorage.setTokens(data.access, data.refresh);
    localStorage.setItem("auth", "true");
    localStorage.setItem("mode", String(DEFAULT_AUTH_MODE));

    if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
    }

    identifyUser(data.user || data.profile);
    track('auth_completed', { method: 'google' });

    if (data.profile) {
        localStorage.setItem("userProfile", JSON.stringify(data.profile));
        return;
    }

    if (data.user) {
        localStorage.setItem("userProfile", JSON.stringify(data.user));
    }
}
