import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EvaluationsPage } from '../EvaluationsPage';
import { EmptyState } from '../../components/EmptyState';
import { getDraft, loadDraftPhotos } from '../../services/bowlDrafts';
import { useT } from '../../i18n';
import style from './BowlRatePage.module.scss';

/**
 * Moment 2 of a bowl, «Поїв»: the ordinary rating of the bowl's borshch, with
 * the photo from moment 1 already in it (so the photo screen is skipped). What
 * happens after the save (photos onto the borshch, the bowl removed, the
 * missing weight asked) lives in EvaluationsPage. A bowl of a venue or a
 * borshch the map does not have yet (stage 3) creates them there, right
 * before the rating is sent.
 */
export const BowlRatePage = () => {
  const { bowlId } = useParams();
  const navigate = useNavigate();
  const t = useT();
  // read once: the bowl is deleted by the page below as soon as it is rated,
  // and this screen must not turn into «gone» under the confetti
  const [bowl] = useState(() => getDraft(bowlId));
  const [photos, setPhotos] = useState(null);

  useEffect(() => {
    if (!bowl) return undefined;
    let cancelled = false;
    loadDraftPhotos(bowl.id).then((files) => {
      if (!cancelled) setPhotos(files);
    });
    return () => { cancelled = true; };
  }, [bowl]);

  // a bowl of a new borshch has its name and no id yet: it is created when rated
  if (!bowl || (!bowl.borsch?.id && !bowl.borsch?.name)) {
    return (
      <div className={style.page}>
        <EmptyState
          art="spoon"
          title={t('bowl.gone')}
          text={t('bowl.goneText')}
          action={{ onClick: () => navigate('/'), label: t('common.toMap') }}
        />
      </div>
    );
  }

  if (bowl.reviewedAt) {
    return (
      <div className={style.page}>
        <EmptyState
          art="spoon"
          title={t('bowl.reviewed')}
          action={bowl.borsch.id
            ? { onClick: () => navigate(`/borsch/${bowl.borsch.id}`), label: t('flow.toBorsch') }
            : { onClick: () => navigate('/'), label: t('common.toMap') }}
        />
      </div>
    );
  }

  if (photos === null) {
    return (
      <div className={style.page}>
        <EmptyState loading title={t('rate.loading')} />
      </div>
    );
  }

  return <EvaluationsPage borschId={bowl.borsch.id || null} bowl={bowl} initialPhotos={photos} />;
};
