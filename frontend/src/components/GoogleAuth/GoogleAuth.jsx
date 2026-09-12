import { useEffect, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import style from "./GoogleAuth.module.css";
import { useT } from "../../i18n";

export const GoogleAuth = ({ onSuccess, disabled = false }) => {
    const t = useT();
    // The Google Identity script is loaded `async defer` in index.html, so it is
    // often NOT there yet when this mounts. Touching `google` directly threw a
    // ReferenceError that took the whole auth page down to a blank screen — poll
    // until it exists instead.
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const init = () => {
            if (cancelled) return true;
            if (typeof window.google === "undefined" || !window.google.accounts?.id) {
                return false;
            }
            window.google.accounts.id.initialize({
                client_id: process.env.REACT_APP_API_KEY_AUTH,
                callback: (response) => {
                    if (onSuccess) onSuccess(response);
                },
            });
            setReady(true);
            return true;
        };

        if (init()) return undefined;

        const timer = setInterval(() => {
            if (init()) clearInterval(timer);
        }, 200);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [onSuccess]);

    const handleGoogleLogin = () => {
        if (!ready) return;
        window.google.accounts.id.prompt();
    };

    return (
        <button
            className={style.googleBtn}
            onClick={() => !disabled && handleGoogleLogin()}
            disabled={disabled}
            style={
                disabled
                    ? { opacity: 0.4, cursor: "not-allowed" }
                    : {}
            }
            title={
                disabled
                    ? t('auth.consentHint')
                    : ""
            }
        >
            <FcGoogle size={24} className={style.googleIcon} />
            <span className={style.googleLabel}>{t('auth.google')}</span>
        </button>
    );
};
