import { useCallback, useEffect, useState } from 'react';
import { AUTH_REQUIRED_ERROR } from '../../api';
import { tablesAPI } from '../../api/tables';
import { GoogleAuth } from '../../components/GoogleAuth';
import { showToast } from '../../components/Toast';
import { useUser } from '../../context/UserContext';
import { googleAuth } from '../../services/googleAuth';
import { dropTableGuestToken, saveTableGuest } from '../../services/tableGuest';
import { useT } from '../../i18n';
import style from './TableClaim.module.scss';

/**
 * «Увійти, щоб оцінки стали твоїми»: a guest who rated at a table under a name
 * signs in with Google, and their ratings at this table move to the account
 * (POST /tables/{code}/claim/ with the guest token). From then on they are in
 * «Мої відгуки» and count on the map like any other rating (a blind table's
 * once it is closed).
 *
 * Shown only to a guest of this table (a token on the device) and only when
 * the backend has the endpoint (tablesAPI.claimAvailable); a backend without
 * it, or a 405, simply hides the offer. 404 guest_not_found means there is
 * nothing of this token to move: the offer goes quietly.
 *
 * tone  'stage' on the red frame of the thank-you, 'page' on the results page
 */
export const TableClaim = ({ code, guestToken, onClaimed, from = 'done', tone = 'stage' }) => {
  const t = useT();
  const { isAuthenticated, completeGoogleSignIn } = useUser();
  const [available, setAvailable] = useState(null);
  const [state, setState] = useState('idle'); // idle | claiming | error | over
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guestToken) return undefined;
    let cancelled = false;
    tablesAPI.claimAvailable(code).then((ok) => { if (!cancelled) setAvailable(ok); });
    return () => { cancelled = true; };
  }, [code, guestToken]);

  const finish = useCallback((result) => {
    dropTableGuestToken(code);
    saveTableGuest(code, { claimedAt: Date.now() });
    setState('over');
    onClaimed?.(result);
  }, [code, onClaimed]);

  const claim = useCallback(async () => {
    setState('claiming');
    setError('');
    try {
      const result = await tablesAPI.claim(code, guestToken, { from });
      showToast(t(result.moved > 0 || result.dropped === 0 ? 'table.claimDone' : 'table.claimKept'));
      finish(result);
    } catch (e) {
      if (e?.code === 'claim_unavailable') {
        setState('over');
      } else if (e?.code === 'guest_not_found') {
        // nothing of this token here (already moved, or never rated): no error
        finish({ moved: 0, dropped: 0 });
      } else if (e?.status === 400) {
        // a token we stored but the API cannot read: our bug, not the person's
        console.error('Перенесення оцінок: токен гостя не прийнято', e);
        setState('over');
      } else if (e?.message === AUTH_REQUIRED_ERROR || e?.status === 401) {
        setState('idle');
        setError(t('table.claimSignIn'));
      } else {
        setState('error');
        setError(t(e?.status === 429 ? 'table.claimBusy' : 'table.claimFailed'));
      }
    }
  }, [code, guestToken, from, finish, t]);

  const signIn = useCallback(async (credentialResponse) => {
    try {
      const data = await googleAuth(credentialResponse.credential);
      completeGoogleSignIn(data);
      await claim();
    } catch (e) {
      setError(t('table.claimSignIn'));
    }
  }, [completeGoogleSignIn, claim, t]);

  if (!guestToken || available !== true || state === 'over') return null;

  return (
    <section className={`${style.claim} ${tone === 'page' ? style.page : style.stage}`} aria-labelledby={`claim-${from}`} data-testid="table-claim">
      <p id={`claim-${from}`} className={style.title}>{t(isAuthenticated ? 'table.claimTitleSignedIn' : 'table.claimTitle')}</p>
      <p className={style.text}>{t('table.claimText')}</p>
      {isAuthenticated ? (
        <button type="button" className={style.cta} onClick={claim} disabled={state === 'claiming'}>
          {state === 'claiming' ? t('table.claiming') : t('table.claimCta')}
        </button>
      ) : (
        <div className={style.google}><GoogleAuth onSuccess={signIn} disabled={state === 'claiming'} /></div>
      )}
      {error && <p className={style.error} role="alert">{error}</p>}
    </section>
  );
};
