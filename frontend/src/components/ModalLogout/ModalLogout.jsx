import {useEffect, useState} from "react";
import {Modal} from "../../components/Modal";
import {Button} from "../../components/Button";
import { ReactComponent as Logo } from '../../assets/images/logo.svg';
import typography from '../../styles/typography.module.css';
import style from './ModalLogout.module.css';
import { tokenStorage } from "../../services/tokenStorage";
import { useUser } from "../../context/UserContext";

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.navernyborshchu.com/api';

export const ModalLogout = ({onClose, onLogoutSuccess}) => {
    const {logout} = useUser();
    const [spin, setSpin] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        setSpin(true);
        const t = setTimeout(() => setSpin(false), 1000);
        return () => clearTimeout(t);
    }, []);

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
            setErrorMessage("Не вдалося завершити вихід на сервері. Локальну сесію очищено.");
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
            <div className={style.modalContent}>
                <Logo className={`${style.modalLogo} ${spin ? style["spin-once"] : ""}`} />
                <h2 className={`${typography.modalTitle} ${style.modalTitle}`}>Вийти з акаунту</h2>
                <p className={`${typography.modalParagraph} ${style.modalParagraph}`}>
                    Все збережено! Повертайся Навертати Борщі разом з нами
                </p>
                {errorMessage && (
                    <p className={`${typography.mobileFootnote} ${style.errorMessage}`}>
                        {errorMessage}
                    </p>
                )}
                <Button
                    type="button"
                    name={isSubmitting ? "Вихід..." : "Вийти"}
                    onClick={handleLogout}
                    disabled={isSubmitting}
                />
                <button
                    className={`${typography.fontBtn} ${style.modalCloseBtn}`}
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    Продовжити Навертати Борщі
                </button>
            </div>
        </Modal>
    );
};
