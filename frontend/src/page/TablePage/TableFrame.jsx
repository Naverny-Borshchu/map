import { IconClose } from '../../components/Icons';
import { useT } from '../../i18n';
import q from '../../components/QuestFlow/QuestFlow.module.scss';
import bowl from '../BowlFlow/BowlFlow.module.scss';
import style from './Table.module.scss';

/**
 * The red stage of the rating quest (QuestFlow.module.scss), for the screens
 * of a table that are not questions: the host's QR, the guest's door, the
 * guest's thank-you, the host's form. Full screen, over the tab bar, like the
 * bowl: a table is a moment at the table, not a page of the map.
 *
 * wide   two columns on a desktop (the host's QR next to the progress)
 */
export const TableFrame = ({
  hue = '#A00322',
  onClose,
  progress = null,
  children,
  foot = null,
  type = 'table',
  wide = false,
  top = true,
}) => {
  const t = useT();
  return (
    <div className={`${q.flow} ${wide ? style.wideFlow : ''}`} style={{ '--hue': hue }} data-type={type}>
      <div className={q.bg} aria-hidden="true">
        <span className={q.blob1} />
        <span className={q.blob2} />
        <span className={q.blob3} />
      </div>
      <header className={q.head}>
        <button type="button" className={q.quit} onClick={onClose} aria-label={t('card.close')}>
          <IconClose size={22} />
        </button>
        {progress}
      </header>
      <div className={`${q.stage} ${top ? bowl.stageTop : ''} ${style.stage}`}>{children}</div>
      {foot && <footer className={`${q.foot} ${bowl.foot}`}>{foot}</footer>}
    </div>
  );
};

/** The segmented progress of the quest frame, for a flow of `total` screens. */
export const FrameSegments = ({ total, index }) => (
  <div className={q.segments} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
    {Array.from({ length: total }, (_, i) => (
      <span key={i} className={`${q.segment} ${i < index ? q.segOn : i === index ? q.segNow : ''}`} />
    ))}
  </div>
);
