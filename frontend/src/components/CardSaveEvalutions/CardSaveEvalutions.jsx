import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { ReactComponent as IconClose } from "./close.svg";
import { ReactComponent as Logo } from "./logo.svg";
import { ButtonVertion } from "../../components/ButtonVersion";
import style from "./CardSaveEvalutions.module.scss";
import { useT } from "../../i18n";

/**
 * Outcome of saving a rating.
 *
 * This used to be an "are you sure you want to leave?" guard — it told you your
 * ratings were NOT saved yet — but it was wired to the Зберегти button, so
 * pressing Save answered with a warning that nothing had been saved. Now Save
 * saves, and this reports what happened.
 */
export const CardSaveEvalutions = ({ onClose, onRetry, saving, isSent, error }) => {
  const t = useT();
  const dismissible = !saving;

  return (
    <div className={style.container}>
      <div className={style.card}>
        {dismissible && (
          <div className={style.boxClose}>
            <ButtonVertion type="button" onClick={onClose} icon={IconClose} />
          </div>
        )}

        <div className={style.boxContext}>
          <Logo className={style.spin_once} />

          {saving && (
            <>
              <h3 className={style.title}>{t('rate.saving')}</h3>
              <p className={style.subTitle}>{t('rate.savingHint')}</p>
            </>
          )}

          {!saving && isSent && (
            <>
              <h3 className={style.title}>{t('rate.thanks')}</h3>
              <p className={style.subTitle}>
                {t('rate.thanksText')}
              </p>
              <Link to="/" className={style.linkInl}>
                {t('rate.backHome')}
              </Link>
            </>
          )}

          {!saving && !isSent && (
            <>
              <h3 className={style.title}>{t('rate.failed')}</h3>
              <p className={style.subTitle}>
                {error || t('rate.failedHint')}
              </p>
              <Button type="button" name={t('rate.retry')} onClick={onRetry} />
              <button type="button" className={style.link} onClick={onClose}>
                {t('card.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
