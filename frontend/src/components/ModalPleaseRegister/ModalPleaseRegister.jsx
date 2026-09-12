import {useEffect, useState} from "react";
import {Modal} from "../../components/Modal";
import {Button} from "../../components/Button";
import {ReactComponent as Logo} from '../../assets/images/logo.svg';
import typography from '../../styles/typography.module.css';
import style from './ModalPleaseRegister.module.css';
import {useT} from "../../i18n";

/**
 * @param {boolean} asPage  render inline instead of as a blocking overlay.
 *   /profile uses this: as a modal it covered the bottom nav (overlay z-index
 *   1000 vs nav 130), so a signed-out visitor could not tap Мапа/Обране, and
 *   its onClose was wired to unused state so it could not be dismissed either.
 */
export const ModalPleaseRegister = ({onClose, onRegisterPage, onGoToMap, asPage = false}) => {
    const t = useT();
    const [spin, setSpin] = useState(false);

    useEffect(() => {
        setSpin(true);
        const timer = setTimeout(() => setSpin(false), 1000);
        return () => clearTimeout(timer);
    }, []);

    const dismiss = onClose || (() => {});

    const content = (
            <div className={`${style.modalContent} ${asPage ? style.asPage : ''}`}>
                <Logo className={`${style.modalLogo} ${spin ? style["spin-once"] : ""}`}/>
                <h2 className={`${typography.modalTitle} ${style.modalTitle}`}>{t('modal.noProfileTitle')}</h2>
                <p className={`${typography.modalParagraph} ${style.modalParagraph}`}>
                    {t('modal.noProfileText')}
                </p>
                <Button type="button"
                        name={t('modal.createProfile')}
                        onClick={onRegisterPage}/>
                <button
                    className={`${typography.fontBtn} ${style.modalCloseBtn}`}
                    onClick={() => {
                        onGoToMap();
                        dismiss();
                    }}
                >
                    {t('modal.notNow')}
                </button>
            </div>
    );

    if (asPage) return <div className={style.pageWrap}>{content}</div>;

    return <Modal onClose={dismiss}>{content}</Modal>;
};
