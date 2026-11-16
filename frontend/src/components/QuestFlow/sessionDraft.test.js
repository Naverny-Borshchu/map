import {
  DRAFT_VERSION,
  claimSessionDraftSubmission,
  clearSessionDraft,
  readSessionDraft,
  releaseSessionDraftSubmission,
  writeSessionDraft,
} from './sessionDraft';

const KEY = 'nb:test:draft';

beforeEach(() => sessionStorage.clear());

test('draft answers and current step survive a reload in sessionStorage', () => {
  writeSessionDraft(KEY, {
    step: 6,
    values: { answers: { meat_amount: 3, salt: 5 }, comment: 'Смачно' },
  });

  expect(readSessionDraft(KEY)).toMatchObject({
    version: DRAFT_VERSION,
    step: 6,
    values: { answers: { meat_amount: 3, salt: 5 }, comment: 'Смачно' },
  });
  expect(localStorage.getItem(KEY)).toBeNull();
});

test('a submission can be claimed only once until failure releases it', () => {
  writeSessionDraft(KEY, { values: { overall: 9 } });
  expect(claimSessionDraftSubmission(KEY)).toBe(true);
  expect(claimSessionDraftSubmission(KEY)).toBe(false);

  releaseSessionDraftSubmission(KEY);
  expect(claimSessionDraftSubmission(KEY)).toBe(true);
});

test('successful submit removes the draft', () => {
  writeSessionDraft(KEY, { step: 2 });
  clearSessionDraft(KEY);
  expect(readSessionDraft(KEY)).toBeNull();
});

// Оцінювання 3.0 changed the keys and the order of the screens: a draft of the
// old seven scores must not reopen on a screen it was not made for, nor ride
// along into the next write.
test('a draft of the previous version is dropped cleanly', () => {
  expect(DRAFT_VERSION).toBe(2);
  sessionStorage.setItem(KEY, JSON.stringify({ version: 1, step: 5, values: { grades: { meat: 8, salt: 7 } } }));
  expect(readSessionDraft(KEY)).toBeNull();
  expect(sessionStorage.getItem(KEY)).toBeNull();

  sessionStorage.setItem(KEY, JSON.stringify({ version: 1, step: 5, values: { grades: { meat: 8 } } }));
  writeSessionDraft(KEY, { step: 1 });
  expect(readSessionDraft(KEY)).toEqual({ version: DRAFT_VERSION, step: 1 });
});
