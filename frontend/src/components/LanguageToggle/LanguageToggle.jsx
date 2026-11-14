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
            {/* each language named in itself; no flag emoji (brand kit: no
                emoji anywhere in the UI) */}
            <span lang={l.key}>{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
