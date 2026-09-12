import { useState } from "react";
import { getThemePreference, setThemePreference } from "../../theme";
import style from "./ThemeToggle.module.scss";
import { useT } from "../../i18n";

const OPTION_KEYS = [
  { key: "auto", i18n: "settings.themeAuto" },
  { key: "light", i18n: "settings.themeLight" },
  { key: "dark", i18n: "settings.themeDark" },
];

/**
 * Theme picker for Settings. 'Авто' follows the time of day (the default);
 * 'Світла'/'Темна' pin it. The choice persists and applies immediately.
 */
export const ThemeToggle = () => {
  const t = useT();
  const [pref, setPref] = useState(getThemePreference());

  const choose = (key) => {
    setPref(key);
    setThemePreference(key);
  };

  return (
    <div className={style.wrap}>
      <span className={style.label}>{t('settings.theme')}</span>
      <div className={style.seg} role="group" aria-label={t('settings.theme')}>
        {OPTION_KEYS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`${style.opt} ${pref === o.key ? style.active : ""}`}
            aria-pressed={pref === o.key}
            onClick={() => choose(o.key)}
          >
            {t(o.i18n)}
          </button>
        ))}
      </div>
    </div>
  );
};
