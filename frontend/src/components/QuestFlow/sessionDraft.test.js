import {
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
    values: { grades: { meat: 8, salt: 7 }, comment: 'Смачно' },
  });

  expect(readSessionDraft(KEY)).toMatchObject({
    step: 6,
    values: { grades: { meat: 8, salt: 7 }, comment: 'Смачно' },
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
