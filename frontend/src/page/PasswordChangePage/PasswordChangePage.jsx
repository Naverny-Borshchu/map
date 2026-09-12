import { useT } from '../../i18n';
import {useState} from "react";
import {Link} from "react-router-dom";
import { ReactComponent as IconBack } from '../../assets/icons/arrow_back.svg';
import {InputField} from "../../components/InputField";
import {Button} from "../../components/Button";
import layout from "../../styles/layout.module.scss";
import typography from "../../styles/typography.module.css";
import style from "./PasswordChangePage.module.scss";

export const PasswordChangePage = () => {
    const t = useT();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const isDisabled = !(currentPassword && newPassword && confirmPassword && newPassword === confirmPassword);

    const handleClick = () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            console.warn('All fields are required.');
            return;
        }

        if (newPassword !== confirmPassword) {
            console.warn('Passwords do not match.');
            return;
        }

        console.log('Button pressed. Send to server:', {
            currentPassword,
            newPassword,
            confirmPassword
        });

        // API call
    };


    return (
        <div className={`${layout.wrapper} ${style.desktopWrapper}`}>
            <h2 className={`${typography.mobileTitle} ${style.title}`}>{t('password.title')}</h2>
            <Link className={style.back} to={`/profile`}><IconBack/></Link>

            <InputField
                label={t('password.current')} id='currentPassword' type='password' placeholder={t('password.current')}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
            />
            <InputField
                label={t('password.new')} id='newPassword' type='password' placeholder={t('password.new')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
            />
            <InputField
                label={t('password.confirm')} id='confirmPassword' type='password' placeholder={t('password.confirm')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
            />

            <Button type='button' name={t('password.change')} disabled={isDisabled} onClick={handleClick}/>
        </div>

    )
}