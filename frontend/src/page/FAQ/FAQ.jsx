import typography from "../../styles/typography.module.css";
import layout from "../../styles/layout.module.scss";
import style from "./FAQ.module.scss";
import { useT } from "../../i18n";

// Eight questions, kept in the dictionary so the page speaks whichever
// language the rest of the app is speaking.
const IDS = [1, 2, 3, 4, 5, 6, 7, 8];

export const FAQ = () => {
    const t = useT();
    return (
        <div className={layout.wrapper}>
            <h1 className={typography.mobileTitle}>{t('faq.title')}</h1>
            <div className={style.list}>
                {IDS.map((i) => (
                    <details key={i} className={style.item}>
                        <summary className={`${typography.mobileBody} ${style.question}`}>
                            {t(`faq.q${i}`)}
                        </summary>
                        <p className={style.answer}>{t(`faq.a${i}`)}</p>
                    </details>
                ))}
            </div>
        </div>
    );
}
