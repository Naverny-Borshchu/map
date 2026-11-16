// 2 since Оцінювання 3.0 (NAV-216): the answers changed their keys and the
// screens their order, so a draft of the old seven scores is dropped instead
// of opening on the wrong screen with half-understood values.
export const DRAFT_VERSION = 2;
const VERSION = DRAFT_VERSION;

const storage = () => {
  try {
    return window.sessionStorage;
  } catch (e) {
    return null;
  }
};

export const readSessionDraft = (key) => {
  try {
    const target = storage();
    const parsed = JSON.parse(target?.getItem(key) || 'null');
    if (parsed?.version === VERSION) return parsed;
    // an older draft is not merely ignored: left behind it would ride into the
    // next write (writeSessionDraft spreads what it reads) and linger
    if (parsed) target?.removeItem(key);
    return null;
  } catch (e) {
    return null;
  }
};

export const writeSessionDraft = (key, patch) => {
  try {
    const target = storage();
    if (!target) return null;
    const next = { version: VERSION, ...(readSessionDraft(key) || {}), ...patch };
    target.setItem(key, JSON.stringify(next));
    return next;
  } catch (e) {
    return null;
  }
};

export const clearSessionDraft = (key) => {
  storage()?.removeItem(key);
};

// Claim synchronously before any network request. Failed writes release the
// claim; successful writes clear the whole draft.
export const claimSessionDraftSubmission = (key) => {
  const draft = readSessionDraft(key) || {};
  if (draft.submissionState === 'submitting' || draft.submissionState === 'submitted') {
    return false;
  }
  writeSessionDraft(key, { submissionState: 'submitting' });
  return true;
};

export const releaseSessionDraftSubmission = (key) => {
  writeSessionDraft(key, { submissionState: 'ready' });
};
