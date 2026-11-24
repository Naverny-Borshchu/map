import { useCallback, useMemo } from 'react';
import { useT } from '../../i18n';
import { useUser } from '../../context/UserContext';
import { QuestFlow, XP_PER_STEP } from '../QuestFlow';
import { ratingSteps } from '../QuestFlow/answers';
import { googleAuth } from '../../services/googleAuth';

/**
 * Rating a borsch that is already on the map (Оцінювання 3.0, NAV-216).
 *
 * The photo first (while there is something to photograph), then the six
 * parts of the borshch, one per screen, «Загалом», the comment, the account
 * wall for a guest, and the closing screen. The save only happens on the
 * closing screen, so a person who bails half-way costs us nothing.
 *
 * The step machinery lives in QuestFlow and the questions in answers.js; this
 * component only knows which screens a rating has and where the answers go.
 */

/**
 * How many screens the rating has, for the step events of a picker that runs
 * before it (see BowlFlow): photo, six parts and «Загалом», comment, sign-in, done.
 */
export const rateStepCount = ({ withPhoto = true, needsSignIn = false } = {}) =>
  (withPhoto ? 1 : 0) + ratingSteps().length + 1 + (needsSignIn ? 1 : 0) + 1;

export const RateFlow = ({
  answers,           // answers.js shape: meat_amount … overall
  onAnswer,
  comment,
  onComment,
  photos,
  onPhotos,
  onSubmit,
  onExit,
  // NAV-228: send the picked photos and leave (QuestFlow onExitWithPhotos)
  onExitWithPhotos = null,
  onSignIn,
  saving,
  isSent,
  reviewUpdated = false,  // the server said the save replaced an earlier rating (200 updated)
  error,
  photoStatus = null,     // { failed, pending, total, retrying } once the photos were tried
  onRetryPhotos,
  borschName,
  placeName = '',
  firstDiscovery = false, // nobody had ever rated it → "Першовар"
  xpMultiplier = 1,       // ×3 for a discovery, ×2 for confirming a seed score
  xpTotal = null,
  initialStep = 0,
  onStepChange,
  // A bowl brought its photo from moment 1 (services/bowlDrafts): asking for
  // one again, after the meal, is asking for a picture of an empty plate.
  withPhotoStep = true,
  analytics = null,
  doneExtra = null,
  cover = null,
  coverSrc = '',
  // the answers came in a link from another browser (services/handoff)
  carried = false,
}) => {
  const t = useT();
  const { isAuthenticated, completeGoogleSignIn } = useUser();
  const needsSignIn = !isAuthenticated;

  const steps = useMemo(
    () => [
      // The photo goes first, because by the end there is nothing left to
      // photograph. It stays optional and skippable.
      ...(withPhotoStep
        ? [{ type: 'photo', key: 'photo', i18n: 'flow.photoTitle', hint: 'r3.photoHint' }]
        : []),
      ...ratingSteps(),
      { type: 'comment', key: 'comment', i18n: 'flow.commentTitle' },
      // The account wall. A review belongs to a user, so the API refuses an
      // anonymous POST /reviews/. Ask here rather than at the door: the
      // questions stay free, and the answers are still in state while signing in.
      ...(needsSignIn
        ? [{ type: 'signin', key: 'signin', i18n: 'flow.signinTitle', hint: 'flow.signinHint' }]
        : []),
      { type: 'done', key: 'done' },
    ],
    [needsSignIn, withPhotoStep]
  );

  const values = useMemo(
    () => ({ ...answers, comment, photos }),
    [answers, comment, photos]
  );

  const handleChange = useCallback(
    (key, value) => {
      if (key === 'comment') return onComment(value);
      if (key === 'photos') return onPhotos(value);
      return onAnswer(key, value);
    },
    [onComment, onPhotos, onAnswer]
  );

  const doneCopy = firstDiscovery
    ? { title: t('flow.firstTitle'), text: t('flow.firstText') }
    : xpMultiplier > 1
      ? { title: t('flow.confirmedTitle'), text: t('flow.confirmedText') }
      : { title: t('rate.thanks'), text: t('rate.thanksText') };

  const handleSignIn = useCallback(async (credentialResponse) => {
    const data = await googleAuth(credentialResponse.credential);
    // /auth/google/ returns {access, refresh, user, profile}. Persist the JWTs
    // before updating context so the final review POST is authenticated.
    completeGoogleSignIn(data);
  }, [completeGoogleSignIn]);

  return (
    <QuestFlow
      steps={steps}
      values={values}
      onChange={handleChange}
      title={borschName}
      subtitle={placeName}
      xp={{ perStep: XP_PER_STEP, multiplier: xpMultiplier, total: xpTotal }}
      status={{
        saving,
        sent: isSent,
        error,
        photosFailed: photoStatus?.failed || 0,
        photosTotal: photoStatus?.total || 0,
        // sent, waiting for the AI check (NAV-218): said, never retried
        photosPending: photoStatus?.pending || 0,
        // a second rating of this borshch replaced the first (no new coins)
        updated: Boolean(reviewUpdated),
        photoRetrying: Boolean(photoStatus?.retrying),
      }}
      done={{ ...doneCopy, cta: t('flow.toBorsch') }}
      onSubmit={onSubmit}
      onRetry={onSubmit}
      onRetryPhotos={onRetryPhotos}
      onExit={onExit}
      onExitWithPhotos={onExitWithPhotos}
      // #34 moved the Google handler up to EvaluationsPage, which needs it to
      // resume the pending review; this one is for callers that do not supply
      // it (the tests). Prefer the parent's.
      onSignIn={onSignIn || handleSignIn}
      initialStep={initialStep}
      onStepChange={onStepChange}
      analytics={analytics}
      doneExtra={doneExtra}
      cover={cover}
      coverSrc={coverSrc}
      confirmExit
      carried={carried}
    />
  );
};
