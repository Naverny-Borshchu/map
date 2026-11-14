import {Modal} from "../../components/Modal";
import {Button} from "../../components/Button";
import heroArt from '../../assets/illustrations/hero.webp';
import dialog from '../../styles/dialog.module.scss';
import { useT } from "../../i18n";

export const ModalRegistrationSuccess = ({onClose, onGoToMap, onContinue}) => {
    const t = useT();
    return (
        <Modal onClose={onClose}>
            <div className={dialog.panel} role="dialog" aria-modal="true" aria-labelledby="nb-reg-title">
                <img className={dialog.art} src={heroArt} alt="" width="560" height="560" />
                <h2 className={dialog.title} id="nb-reg-title">{t('regSuccess.title')}</h2>
                <p className={dialog.text}>{t('regSuccess.text')}</p>
                <Button type="submit"
                        name={t('regSuccess.toMap')}
                        onClick={() => {
                            onGoToMap();
                            onClose();
                        }}/>
                <button
                    type="button"
                    className={dialog.ghost}
                    onClick={() => {
                        onContinue();
                        onClose();
                    }}
                >
                    {t('regSuccess.continue')}
                </button>
            </div>
        </Modal>
    );
};
