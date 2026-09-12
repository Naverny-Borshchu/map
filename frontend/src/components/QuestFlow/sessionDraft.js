const VERSION = 1;

const storage = () => {
  try {
    return window.sessionStorage;
  } catch (e) {
    return null;
  }
};

export const readSessionDraft = (key) => {
  try {
    const parsed = JSON.parse(storage()?.getItem(key) || 'null');
    return parsed?.version === VERSION ? parsed : null;
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
