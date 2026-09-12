import { useCallback, useMemo } from 'react';
import { useT } from '../../i18n';
import { useUser } from '../../context/UserContext';
import { QuestFlow, XP_PER_STEP } from '../QuestFlow';
import { hasTenPointScale } from '../../variant';
import { SCALE_ANSWERS } from '../QuestFlow/answers';
import { googleAuth, persistGoogleAuthSession } from '../../services/googleAuth';

/**
 * Rating a borsch that is already on the map.
 *
 * Taste first, chores after: seven answer screens, then the optional photo and
 * comment. Nothing is asked before the part people actually came to do, and the
 * save only happens on the closing screen — so a person who bails half-way
 * costs us nothing and a person who finishes gets confetti.
 *
 * The step machinery lives in QuestFlow; this component only knows which
 * questions a borsch has and where the answers go.
 */
export const RateFlow = ({
  criteria,          // [{ key, i18n, icon }] — order comes from the caller
  grades,
  onGrade,
  comment,
  onComment,
  photos,
  onPhotos,
  onSubmit,
  onExit,
  onSignIn,
  saving,
  isSent,
  error,
  borschName,
  firstDiscovery = false, // nobody had ever rated it → "Першовар"
  xpMultiplier = 1,       // ×3 for a discovery, ×2 for confirming a seed score
  xpTotal = null,
  initialStep = 0,
  onStepChange,
}) => {
  const t = useT();
  const { isAuthenticated, login } = useUser();
  const needsSignIn = !isAuthenticated;

  const steps = useMemo(
    () => [
      ...criteria.map((c) => ({
        type: 'scale',
        key: c.key,
        // the worded question ("Скільки було мʼяса?") reads better than the
        // criterion's own noun; fall back to the noun for any new criterion
        // that has not been given answers yet
        i18n: SCALE_ANSWERS[c.key] ? `flow.q.${c.key}` : c.i18n,
        options: SCALE_ANSWERS[c.key] || [],
      })).filter((s) => s.options.length > 0),
      { type: 'photo', key: 'photo', i18n: 'flow.photoTitle', hint: 'flow.photoHint' },
      { type: 'comment', key: 'comment', i18n: 'flow.commentTitle', hint: 'flow.commentHint' },
      // The account wall. A review belongs to a user, so the API refuses an
      // anonymous POST /reviews/ — and without this step a guest answered all
      // seven questions, hit ГОТОВО and got "Не вдалося зберегти", losing the
      // lot. Ask here rather than at the door: the taste questions stay free,
      // and the answers are still in state while signing in.
      ...(needsSignIn
        ? [{ type: 'signin', key: 'signin', i18n: 'flow.signinTitle', hint: 'flow.signinHint' }]
        : []),
      { type: 'done', key: 'done' },
    ],
    [criteria, needsSignIn]
  );

  const values = useMemo(
    () => ({ ...grades, comment, photos }),
    [grades, comment, photos]
  );

  const handleChange = useCallback(
    (key, value) => {
      if (key === 'comment') return onComment(value);
      if (key === 'photos') return onPhotos(value);
      return onGrade(key, value);
    },
    [onComment, onPhotos, onGrade]
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
    persistGoogleAuthSession(data);
    login(data.user || data.profile || {});
  }, [login]);

  return (
    <QuestFlow
      steps={steps}
      values={values}
      onChange={handleChange}
      scale10={hasTenPointScale}
      title={borschName}
      xp={{ perStep: XP_PER_STEP, multiplier: xpMultiplier, total: xpTotal }}
      status={{ saving, sent: isSent, error }}
      done={{ ...doneCopy, cta: t('flow.toBorsch') }}
      onSubmit={onSubmit}
      onRetry={onSubmit}
      onExit={onExit}
          // #34 moved the Google handler up to EvaluationsPage, which needs it
          // to resume the pending review; #36 kept an identical one here for
          // callers that do not supply it (the tests). Prefer the parent's.
          onSignIn={onSignIn || handleSignIn}
          initialStep={initialStep}
          onStepChange={onStepChange}
    />
  );
};
