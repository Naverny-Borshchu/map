import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import style from "./GoogleAuth.module.css";
import { useI18n } from "../../i18n";
import { track } from "../../analytics";
import { detectInAppBrowser, externalBrowserUrl } from "../../utils/inAppBrowser";
import { handoffUrl } from "../../services/handoff";

// After this long without Google's script the person is told why nothing is
// there (blocker, network). The wait itself goes on: a slow script that turns
// up later still gets its button.
const SLOW_MS = 8000;

const gsi = () => (typeof window !== "undefined" ? window.google?.accounts?.id : undefined);

const copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // in-app browsers often have no clipboard API: the old way
        try {
            const area = document.createElement("textarea");
            area.value = text;
            area.setAttribute("readonly", "");
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(area);
            return ok;
        } catch (err) {
            return false;
        }
    }
};

/**
 * «Продовжити з Google».
 *
 * This used to be our own button calling google.accounts.id.prompt() — One
 * Tap. Google shows One Tap only when it wants to: not to someone signed out
 * of Google in this browser, not for a while after it was once closed, not in
 * Safari with cross-site cookies blocked, never in an in-app browser — and it
 * says nothing when it declines. In the week of 15–22.11.2026 ten people
 * finished a whole rating and reached this button; two got in, five tapped it
 * again and again (12, 11, 4, 1, 1 times) and left with nothing saved.
 *
 * Now it is Google's own rendered button, which opens the real sign-in window
 * on every tap, whatever One Tap thinks. Where Google will not sign anybody in
 * at all — the browser inside Threads, Instagram, Facebook — the step says so
 * first and opens the page in a real browser, answers included
 * (services/handoff). A sign-in that fails after Google is said out loud
 * instead of leaving a button that seems dead.
 *
 * onSuccess(credentialResponse) may be async; whatever it throws is shown.
 */
export const GoogleAuth = ({ onSuccess, disabled = false }) => {
    const { t, lang } = useI18n();
    const slot = useRef(null);
    const mounted = useRef(true);
    // the latest handler without re-initialising Google on every render
    // (initialize() twice is what the console warned about)
    const onSuccessRef = useRef(onSuccess);
    onSuccessRef.current = onSuccess;
    // Google's button lives in its own frame and cannot be disabled. The cover
    // below stops a tap and `inert` stops Tab, but whatever still gets through
    // (terms not accepted on /login, a claim already in flight) stops here.
    const blockedRef = useRef(disabled);
    blockedRef.current = disabled;

    const inApp = useMemo(() => detectInAppBrowser(), []);
    const [ready, setReady] = useState(() => Boolean(gsi()));
    const [slow, setSlow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    // Google's script is loaded `async defer` in index.html: often not there
    // yet when this mounts. Touching `google` directly once threw and blanked
    // the whole auth page, so wait for it.
    useEffect(() => {
        if (ready) return undefined;
        const started = Date.now();
        const timer = setInterval(() => {
            if (gsi()) {
                clearInterval(timer);
                setReady(true);
            } else if (Date.now() - started > SLOW_MS) {
                setSlow((was) => {
                    if (!was) track("auth_google_unavailable", { in_app: Boolean(inApp) });
                    return true;
                });
            }
        }, 200);
        return () => clearInterval(timer);
    }, [ready, inApp]);

    const handleCredential = useCallback(async (response) => {
        if (blockedRef.current) {
            track("auth_google_blocked", { in_app: Boolean(inApp) });
            return;
        }
        setError("");
        setBusy(true);
        try {
            await onSuccessRef.current?.(response);
        } catch (e) {
            console.error("Google sign-in failed:", e);
            track("auth_google_failed", { stage: "app", in_app: Boolean(inApp) });
            if (mounted.current) setError(t("auth.error"));
        } finally {
            if (mounted.current) setBusy(false);
        }
    }, [inApp, t]);

    useEffect(() => {
        const id = gsi();
        if (!ready || !id || !slot.current) return;
        id.initialize({
            client_id: process.env.REACT_APP_API_KEY_AUTH,
            callback: (response) => {
                if (!response?.credential) {
                    track("auth_google_failed", { stage: "google", in_app: Boolean(inApp) });
                    setError(t("auth.error"));
                    return;
                }
                handleCredential(response);
            },
            ux_mode: "popup",
            auto_select: false,
            cancel_on_tap_outside: true,
        });
        slot.current.innerHTML = "";
        // Google takes a width in pixels, 200…400
        const width = Math.round(Math.min(400, Math.max(200, slot.current.offsetWidth || 0)));
        id.renderButton(slot.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            shape: "pill",
            text: "continue_with",
            logo_alignment: "center",
            width,
            locale: lang,
            // clicks inside Google's frame never reach our autocapture
            click_listener: () => track("auth_google_clicked", { in_app: Boolean(inApp) }),
        });
    }, [ready, lang, inApp, t, handleCredential]);

    const openInBrowser = () => {
        const href = handoffUrl();
        const target = externalBrowserUrl(href, inApp?.os);
        track("auth_open_in_browser", { app: inApp?.app || "webview", os: inApp?.os, scheme: Boolean(target) });
        if (target) window.location.href = target;
    };

    const copyLink = async () => {
        const ok = await copyText(handoffUrl());
        track("auth_copy_link", { app: inApp?.app || "webview", ok });
        if (mounted.current) setCopied(ok);
    };

    return (
        <div className={style.wrap}>
            {inApp && (
                <div className={style.inApp} role="note">
                    <p className={style.inAppTitle}>
                        {inApp.app ? t("auth.inAppTitle", { app: inApp.app }) : t("auth.inAppTitleGeneric")}
                    </p>
                    <p className={style.inAppText}>{t("auth.inAppText")}</p>
                    <button type="button" className={style.openBtn} onClick={openInBrowser}>
                        {t(inApp.os === "ios" ? "auth.openInSafari" : "auth.openInBrowser")}
                    </button>
                    <button type="button" className={style.copyBtn} onClick={copyLink}>
                        {copied ? t("auth.linkCopied") : t("auth.copyLink")}
                    </button>
                    <p className={style.inAppManual}>{t("auth.inAppManual")}</p>
                </div>
            )}

            <div
                className={`${style.buttonBox} ${disabled || busy ? style.isDisabled : ""}`}
                title={disabled ? t("auth.consentHint") : ""}
            >
                {/* Google's button lands here once its script is in */}
                <div
                    ref={slot}
                    className={style.slot}
                    hidden={!ready}
                    inert={disabled || busy}
                    data-testid="google-button-slot"
                />
                {!ready && (
                    <button type="button" className={style.googleBtn} disabled aria-busy={!slow}>
                        <FcGoogle size={24} className={style.googleIcon} />
                        <span className={style.googleLabel}>{t("auth.google")}</span>
                    </button>
                )}
                {/* Google's frame cannot be disabled; a cover over it can */}
                {(disabled || busy) && <div className={style.blocker} aria-hidden="true" />}
            </div>

            {busy && <p className={style.status} role="status">{t("auth.signingIn")}</p>}
            {!ready && slow && <p className={style.error} role="alert">{t("auth.googleUnavailable")}</p>}
            {error && <p className={style.error} role="alert">{error}</p>}
        </div>
    );
};
