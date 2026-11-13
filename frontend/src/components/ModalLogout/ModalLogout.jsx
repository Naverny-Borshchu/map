import {useState} from "react";
import {Modal} from "../../components/Modal";
import {Button} from "../../components/Button";
import letterArt from '../../assets/illustrations/letter.webp';
import dialog from '../../styles/dialog.module.scss';
import { tokenStorage } from "../../services/tokenStorage";
import { useUser } from "../../context/UserContext";
import { useT } from "../../i18n";

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.navernyborshchu.com/api';

export const ModalLogout = ({onClose, onLogoutSuccess}) => {
    const {logout} = useUser();
    const t = useT();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const handleLogout = async () => {
        if (isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage("");

        const refresh = tokenStorage.getRefresh();

        try {
            const response = await fetch(`${API_BASE_URL}/auth/logout/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ refresh }),
            });

            if (response.status !== 205) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.message || errorData?.detail || "Logout request failed");
            }

            onClose();
        } catch (error) {
            console.error("Logout error:", error);
            setErrorMessage(t('logout.error'));
        } finally {
            logout();
            setIsSubmitting(false);

            if (onLogoutSuccess) {
                onLogoutSuccess();
            }
        }
    };

    return (
        <Modal onClose={onClose}>
            <div className={dialog.panel} role="dialog" aria-modal="true" aria-labelledby="nb-logout-title">
                <img className={dialog.art} src={letterArt} alt="" width="520" height="388" />
                <h2 className={dialog.title} id="nb-logout-title">{t('logout.title')}</h2>
                <p className={dialog.text}>{t('logout.text')}</p>
                {errorMessage && <p className={dialog.error}>{errorMessage}</p>}
                <Button
                    type="button"
                    name={isSubmitting ? t('logout.pending') : t('logout.confirm')}
                    onClick={handleLogout}
                    disabled={isSubmitting}
                />
                <button
                    type="button"
                    className={dialog.ghost}
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    {t('logout.stay')}
                </button>
            </div>
        </Modal>
    );
};
