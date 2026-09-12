import { useT } from '../../i18n';
import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {AvatarUploader} from "../../components/AvatarUploader";
import { ReactComponent as IconBack } from '../../assets/icons/arrow_back.svg';
import {Button} from "../../components/Button";
import {InputField} from "../../components/InputField";
import Logo from '../../assets/images/logo.svg';
import layout from '../../styles/layout.module.scss';
import typography from '../../styles/typography.module.css';
import style from './PersonalInfo.module.scss';

// Map Google locale codes to country names
const localeToCountry = {
  'uk': 'Україна', 'en': 'USA', 'en-US': 'USA', 'en-GB': 'UK',
  'pl': 'Польща', 'de': 'Німеччина', 'fr': 'Франція',
  'es': 'Іспанія', 'it': 'Італія', 'cs': 'Чехія',
  'sk': 'Словаччина', 'hu': 'Угорщина', 'ro': 'Румунія',
  'bg': 'Болгарія', 'ru': 'Росія', 'be': 'Білорусь',
  'he': 'Ізраїль', 'lt': 'Литва', 'lv': 'Латвія', 'et': 'Естонія',
};

export const PersonalInfo = () => {
    const t = useT();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [country, setCountry] = useState('');
    const [avatar, setAvatar] = useState(Logo);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem("userProfile"));
        if (storedUser) {
            setName(storedUser.given_name || storedUser.name || '');
            setEmail(storedUser.email || '');
            // Auto-fill country from Google locale
            const locale = storedUser.locale || '';
            const autoCountry = localeToCountry[locale] || localeToCountry[locale.split('-')[0]] || '';
            setCountry(storedUser.country || autoCountry);
            // Use Google avatar
            if (storedUser.picture) setAvatar(storedUser.picture);
        }
    }, []);

    const isFormFilled = name || email || country;

    const handleSubmitForm = (e) => {
        e.preventDefault();
        const existing = JSON.parse(localStorage.getItem("userProfile")) || {};
        const updatedUser = { ...existing, given_name: name, email, country };
        localStorage.setItem("userProfile", JSON.stringify(updatedUser));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }

    return (
        <div className={`${layout.wrapper} ${style.desktopWrapper}`}>
            <h1 className={typography.mobileTitle}>{t('personal.title')}</h1>
            <Link className={style.back} to={`/profile`}><IconBack/></Link>
            <div className={style.infoContainer}>

                <AvatarUploader initialAvatar={avatar} />

                <div>
                    <h2 className={typography.mobileTitleSmall}>{name || t('personal.name')}</h2>
                </div>
            </div>

            <form onSubmit={handleSubmitForm}>
                <InputField
                    label={t('personal.name')}
                    id="name"
                    type="text"
                    placeholder={t('personal.name')}
                    value={name}
                    onChange={e => setName(e.target.value)}
                />

                <InputField
                    label="Email"
                    id="email"
                    type="email"
                    placeholder="Email"
                    value={email}
                    required
                    onChange={e => setEmail(e.target.value)}
                />

                <InputField
                    label={t('personal.country')}
                    id="country"
                    type="text"
                    placeholder="Country"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                />

                <Button type='submit' name={saved ? t('personal.saved') : t('personal.save')} disabled={!isFormFilled}/>
            </form>
        </div>
    )
}