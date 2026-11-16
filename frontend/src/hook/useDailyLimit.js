import { useCallback, useEffect, useState } from 'react';
import { commentsAPI } from '../api';
import { track } from '../analytics';

/** Is this answer of GET /reviews/today/ a «no»? An update is never one. */
export const limitReached = (today) => Boolean(today)
  && today.limit !== null && today.limit !== undefined
  && Number(today.remaining) <= 0
  && !today.already_rated;

/** A 429 `daily_limit` from POST /reviews/ (two flows raced the check). */
export const isDailyLimitError = (err) => err?.status === 429 && (err?.code === 'daily_limit' || err?.data?.code === 'daily_limit');

/**
 * Two new borshch ratings a day per person (11.2026). Asked once, before the
 * questions: { state: 'checking' | 'ok' | 'blocked', info }.
 *
 * borschId  the borshch to be rated, or null for a new one
 * enabled   false to ask nothing (the screen is not a rating yet)
 * where     for analytics: 'card' | 'bowl' | 'add'
 *
 * Anything but a clear «no» lets the person rate as before: no account yet
 * (the rating asks to sign in at its end), the network, an older backend.
 * block(info) is for the 429 at the submit itself.
 */
export const useDailyLimit = ({ borschId = null, enabled = true, where = '' } = {}) => {
  const [result, setResult] = useState({ state: enabled ? 'checking' : 'ok', info: null });

  useEffect(() => {
    if (!enabled) {
      setResult({ state: 'ok', info: null });
      return undefined;
    }
    let cancelled = false;
    setResult({ state: 'checking', info: null });
    Promise.resolve()
      .then(() => commentsAPI.today(borschId || null))
      .then((today) => {
        if (cancelled) return;
        if (limitReached(today)) {
          track('daily_limit_stop', { where, count: today.count ?? null, limit: today.limit, race: false });
          setResult({ state: 'blocked', info: today });
        } else {
          setResult({ state: 'ok', info: today || null });
        }
      })
      .catch(() => { if (!cancelled) setResult({ state: 'ok', info: null }); });
    return () => { cancelled = true; };
  }, [borschId, enabled, where]);

  const block = useCallback((info = null) => {
    track('daily_limit_stop', { where, count: info?.count ?? null, limit: info?.limit ?? null, race: true });
    setResult({ state: 'blocked', info });
  }, [where]);

  return { ...result, block };
};
