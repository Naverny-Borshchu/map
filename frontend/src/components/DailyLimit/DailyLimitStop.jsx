import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../EmptyState';
import { useT } from '../../i18n';
import style from './DailyLimitStop.module.scss';

/**
 * Two new borshch ratings a day (11.2026): the friendly stop in place of the
 * questions. What waits for tomorrow is said as it is: a bowl lives three
 * days (services/bowlDrafts), a started rating only while its tab is open
 * (sessionDraft lives in sessionStorage).
 *
 * keeps  'bowl' | 'draft' | null
 */
export const DailyLimitStop = ({ keeps = null }) => {
  const t = useT();
  const navigate = useNavigate();
  const text = [t('limit.text'), keeps === 'bowl' ? t('limit.keepsBowl') : keeps === 'draft' ? t('limit.keepsDraft') : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={style.page} data-testid="daily-limit">
      <EmptyState
        art="spoon"
        title={t('limit.title')}
        text={text}
        action={{ onClick: () => navigate('/'), label: t('limit.toMap') }}
      />
    </div>
  );
};
