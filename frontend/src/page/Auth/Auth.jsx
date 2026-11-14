import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Brand } from "../../components/Brand";
import heroArt from "../../assets/illustrations/hero.webp";
import { GoogleAuth } from "../../components/GoogleAuth";
import { ModalRegistrationSuccess } from "../../components/ModalRegistrationSuccess";
import { googleAuth, persistGoogleAuthSession } from "../../services/googleAuth";

import layout from "../../styles/layout.module.scss";
import style from "./Auth.module.scss";
import { useT } from "../../i18n";

/**
 * Single sign-in / sign-up screen.
 *
 * Google is one action: /auth/google/ creates the account when it's a new
 * address and signs in when it isn't — the client can't know which in advance.
 * Separate "Реєстрація" and "Вхід" pages were therefore two buttons doing the
 * exact same thing, so both routes now render this one screen.
 */
export const Auth = () => {
  const [accepted, setAccepted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [authError, setAuthError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setAuthError("");
      const data = await googleAuth(credentialResponse.credential);
      persistGoogleAuthSession(data);
      setShowModal(true);
    } catch (error) {
      console.error("Google auth error:", error);
      setAuthError(t('auth.error'));
    }
  };

  // PrivateRoute sends people here with the page they wanted in state — send
  // them back to it, rather than dumping them on the profile.
  const handleContinue = () => {
    const from = location.state?.from;
    if (from) {
      navigate(from.pathname || from, { replace: true });
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={layout.authContainer}>
      <Brand size="lg" className={style.brand} />

      <div className={style.card}>
      <img className={style.art} src={heroArt} alt="" width="560" height="560" />
      <p className={style.kicker}>{t('auth.kicker')}</p>
      <h1 className={style.title}>
        {t('auth.title')}
      </h1>

      <p className={style.subtitle}>
        {t('auth.subtitle')}
      </p>

      <label className={style.checkboxWrapper}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={() => setAccepted((prev) => !prev)}
          className={style.hiddenCheckbox}
        />
        <span className={`${style.customCheckbox} ${accepted ? style.checked : ''}`.trim()}>
          {accepted && <span className={style.checkboxSign} />}
        </span>
        <span>
          {t('auth.consentPre')}{" "}
          {/* BUG-15r: реальні документи живуть на лендінгу, роутів /terms і /privacy у SPA немає */}
          <a
            href="https://navernyborshchu.com/terms-conditions.html"
            target="_blank"
            rel="noopener noreferrer"
            className={style.link}
          >
            {t('auth.terms')}
          </a>{" "}
          {t('auth.and')}{" "}
          <a
            href="https://navernyborshchu.com/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
            className={style.link}
          >
            {t('auth.privacy')}
          </a>
        </span>
      </label>

      <div className={style.googleBtnWrapper}>
        <GoogleAuth onSuccess={handleGoogleSuccess} disabled={!accepted} />
      </div>

      {authError && (
        <p className={style.error} role="alert">
          {authError}
        </p>
      )}
      </div>

      {showModal && (
        <ModalRegistrationSuccess
          onClose={() => setShowModal(false)}
          onGoToMap={() => navigate("/")}
          onContinue={handleContinue}
        />
      )}
    </div>
  );
};
