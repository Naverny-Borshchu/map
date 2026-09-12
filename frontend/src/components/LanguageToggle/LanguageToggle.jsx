import { useI18n } from "../../i18n";
import style from "../ThemeToggle/ThemeToggle.module.scss";

/** Language picker for Settings; mirrors ThemeToggle's shape. */
export const LanguageToggle = () => {
  const { t, lang, setLang, languages } = useI18n();

  return (
    <div className={style.wrap}>
      <span className={style.label}>{t('settings.language')}</span>
      <div className={style.seg} role="group" aria-label={t('settings.language')}>
        {languages.map((l) => (
          <button
            key={l.key}
            type="button"
            className={`${style.opt} ${lang === l.key ? style.active : ""}`}
            aria-pressed={lang === l.key}
            onClick={() => setLang(l.key)}
          >
            {/* the flag is decoration — the label already names the language,
                and a screen reader announcing "flag: Ukraine Українська" adds
                nothing */}
            <span aria-hidden="true">{l.flag}</span> {l.label}
          </button>
        ))}
      </div>
    </div>
  );
};
