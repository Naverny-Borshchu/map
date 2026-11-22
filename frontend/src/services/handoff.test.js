import { applyHandoff, collectHandoff, handoffUrl, HANDOFF_PARAM } from './handoff';
import { createDraft, getDraft } from './bowlDrafts';

const RATE_KEY = 'nb:quest-draft:rate:4055504a-430d-483a-8c0f-d6745ea3e8c4';
const draft = {
  version: 1,
  step: 9,
  values: { answers: { overall: 9, salt: 2 }, comment: 'Дуже смачний, з пампушками й часником' },
  submissionState: 'ready',
};

const go = (path) => window.history.replaceState(null, '', path);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  go('/');
});

it('carries the rating to another browser and puts it back on the same step', () => {
  go('/borsch/4055504a-430d-483a-8c0f-d6745ea3e8c4/evaluations');
  sessionStorage.setItem(RATE_KEY, JSON.stringify(draft));
  sessionStorage.setItem('nb:geo-hint-shown', '1'); // not a draft: stays behind

  const link = new URL(handoffUrl());
  expect(link.pathname).toBe('/borsch/4055504a-430d-483a-8c0f-d6745ea3e8c4/evaluations');
  expect(link.searchParams.get(HANDOFF_PARAM)).toMatch(/^[A-Za-z0-9_-]+$/);

  // the other browser: nothing in its storage yet
  sessionStorage.clear();
  go(`${link.pathname}${link.search}`);
  expect(applyHandoff()).toEqual({ drafts: 1, bowl: false });

  const { submissionState, ...carried } = draft;
  expect(JSON.parse(sessionStorage.getItem(RATE_KEY))).toEqual(carried);
  expect(sessionStorage.getItem('nb:geo-hint-shown')).toBeNull();
  // the parameter is gone from the address: not shared, not a page view
  expect(window.location.search).toBe('');
  expect(window.location.pathname).toBe('/borsch/4055504a-430d-483a-8c0f-d6745ea3e8c4/evaluations');
});

it('does not carry a send that was under way over to the other browser', () => {
  go('/borsch/x/evaluations');
  sessionStorage.setItem(RATE_KEY, JSON.stringify({ ...draft, submissionState: 'submitting' }));
  const link = new URL(handoffUrl());
  sessionStorage.clear();
  go(`${link.pathname}${link.search}`);
  applyHandoff();
  expect(JSON.parse(sessionStorage.getItem(RATE_KEY)).submissionState).toBeUndefined();
});

it('keeps a draft the browser already has: it is newer than a link', () => {
  go('/borsch/x/evaluations');
  sessionStorage.setItem(RATE_KEY, JSON.stringify(draft));
  const link = new URL(handoffUrl());
  const local = { ...draft, step: 3, values: { answers: { overall: 4 }, comment: '' } };
  sessionStorage.setItem(RATE_KEY, JSON.stringify(local));
  go(`${link.pathname}${link.search}`);
  expect(applyHandoff()).toEqual({ drafts: 0, bowl: false });
  expect(JSON.parse(sessionStorage.getItem(RATE_KEY))).toEqual(local);
});

it('carries the bowl being rated, without its photos', async () => {
  const bowl = await createDraft({ place: { id: 'p1', name: 'Маяк', city: 'Київ' }, borsch: { id: 'b1', name: 'Домашній' } });
  go(`/bowl/${bowl.id}/rate`);
  expect(collectHandoff().bowl.id).toBe(bowl.id);
  const link = new URL(handoffUrl());

  localStorage.clear();
  go(`${link.pathname}${link.search}`);
  expect(applyHandoff()).toEqual({ drafts: 0, bowl: true });
  expect(getDraft(bowl.id)).toMatchObject({ id: bowl.id, borsch: { id: 'b1' }, photoCount: 0, reviewedAt: null });
});

it('a page with nothing to carry gets the plain address', () => {
  go('/borsch/x/evaluations?utm_source=threads');
  expect(handoffUrl()).toBe('http://localhost/borsch/x/evaluations?utm_source=threads');
});

it('ignores a broken or foreign parameter and still cleans the address', () => {
  go(`/borsch/x/evaluations?${HANDOFF_PARAM}=%%%garbage&utm_source=threads`);
  expect(applyHandoff()).toBeNull();
  expect(window.location.search).toBe('?utm_source=threads');
  expect(sessionStorage.length).toBe(0);

  // only quest drafts may be written, whatever the link says
  const evil = btoa(JSON.stringify({ v: 1, drafts: { access: '"stolen"', 'nb:quest-draft:x': '{"step":1}' } }));
  go(`/?${HANDOFF_PARAM}=${evil}`);
  expect(applyHandoff()).toEqual({ drafts: 1, bowl: false });
  expect(sessionStorage.getItem('access')).toBeNull();
});

it('without the parameter does nothing at all', () => {
  go('/borsch/x?y=1');
  expect(applyHandoff()).toBeNull();
  expect(window.location.search).toBe('?y=1');
});
