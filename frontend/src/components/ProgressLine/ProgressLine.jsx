import { formatGrade, hasRating } from "../../utils/rating";
import styles from "./ProgressLine.module.scss";
import { useT } from "../../i18n";

export const ProgressLine = ({ title, icon: Icon, value }) => {
  const t = useT();
  const maxValue = 10;
  // Handle non-numeric values (like "—")
  // A valid criterion score is 1..10; 0 / "—" / NaN all mean "no rating yet".
  const hasValue = hasRating(value);
  const percent = hasValue ? Math.min(Math.max(parseFloat(value), 0), maxValue) * 10 : 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>{title}</div>
      <div className={styles.row}>
        {Icon && <Icon className={styles.icon} />}
        {hasValue ? (
          <div className={styles.trackWrapper}>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
            <span className={styles.value}>({formatGrade(value)})</span>
          </div>
        ) : (
          <span className={styles.noRatings}>{t('rate.noRatingsYet')}</span>
        )}
      </div>
    </div>
  );
};
