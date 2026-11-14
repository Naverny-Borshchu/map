import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import style from './PageHeader.module.scss';

const IconBack = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Page heading in the landing's shape: a small red kicker over a MAK title,
 * with an optional round back button. One component, so every inner page
 * (help, FAQ, guide, profile sections, 404) starts the same way.
 *
 * back: a path, or true for history back.
 */
export const PageHeader = ({ kicker, title, back, lead, children, center = false }) => {
  const t = useT();
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else navigate(-1);
  };
  return (
    <header className={`${style.head} ${center ? style.center : ''}`.trim()}>
      {back && (
        <button type="button" className={style.back} onClick={goBack} aria-label={t('common.back')}>
          <IconBack />
        </button>
      )}
      <div className={style.words}>
        {kicker && <p className={style.kicker}>{kicker}</p>}
        <h1 className={style.title}>{title}</h1>
        {lead && <p className={style.lead}>{lead}</p>}
      </div>
      {children}
    </header>
  );
};

export default PageHeader;
