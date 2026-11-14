import {Modal} from "../../components/Modal";
import {Button} from "../../components/Button";
import tableArt from '../../assets/illustrations/table.webp';
import style from './ModalPleaseRegister.module.scss';
import {useT} from "../../i18n";

/**
 * @param {boolean} asPage  render inline instead of as a blocking overlay.
 *   /profile uses this: as a modal it covered the bottom nav (overlay z-index
 *   1000 vs nav 130), so a signed-out visitor could not tap Мапа/Обране, and
 *   its onClose was wired to unused state so it could not be dismissed either.
 */
export const ModalPleaseRegister = ({onClose, onRegisterPage, onLoginPage, onGoToMap, asPage = false}) => {
    const t = useT();
    const dismiss = onClose || (() => {});

    const content = (
            <div className={`${style.modalContent} ${asPage ? style.asPage : ''}`}>
                {/* The landing's family table: a profile is a seat at it. */}
                <div className={style.art}>
                    <img src={tableArt} alt="" width="720" height="538" />
                </div>
                <div className={style.body}>
                    <h2 className={style.modalTitle}>{t('modal.noProfileTitle')}</h2>
                    <p className={style.modalParagraph}>
                        {t('modal.noProfileText')}
                    </p>
                    <Button type="button"
                            name={t('modal.createProfile')}
                            onClick={onRegisterPage}/>
                    {/* Текст кличе лише створити профіль, і хто вже має акаунт, не
                        бачив, куди йому. Google-вхід один для обох випадків, але
                        людина цього не знає, доки не натисне. */}
                    {onLoginPage && (
                        <p className={style.haveProfile}>
                            {t('modal.haveProfile')}{' '}
                            <button type="button" className={style.loginLink} onClick={onLoginPage}>
                                {t('modal.signIn')}
                            </button>
                        </p>
                    )}
                    <button
                        type="button"
                        className={style.modalCloseBtn}
                        onClick={() => {
                            onGoToMap();
                            dismiss();
                        }}
                    >
                        {t('modal.notNow')}
                    </button>
                </div>
            </div>
    );

    if (asPage) return <div className={style.pageWrap}>{content}</div>;

    return <Modal onClose={dismiss}>{content}</Modal>;
};
