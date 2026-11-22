import { applyHandoff, canHandoff, collectHandoff, handoffUrl, HANDOFF_PARAM, MAX_URL } from './handoff';
import { createDraft, getDraft, listDrafts } from './bowlDrafts';
import { ratingSteps, restoreAnswers } from '../components/QuestFlow/answers';

const B1 = '4055504a-430d-483a-8c0f-d6745ea3e8c4';
const B2 = '9a0c5c1e-1111-4222-8333-444455556666';
const rateKey = (id) => `nb:quest-draft:rate:${id}`;
const COMMENT_STEP = 1 + ratingSteps().length;
const answers = { overall: 9, salt: 2, sides: ['sour_cream', 'garlic'] };
const saved = (extra = {}) => ({
  version: 2,
  step: COMMENT_STEP + 1, // the sign-in screen, where the in-app browser stops
  values: { answers, comment: 'Дуже смачний, з пампушками й часником' },
  submissionState: 'ready',
  ...extra,
});

const go = (path) => window.history.replaceState(null, '', path);
const b64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (link) => JSON.parse(decodeURIComponent(escape(atob(
  new URL(link).searchParams.get(HANDOFF_PARAM).replace(/-/g, '+').replace(/_/g, '/')
))));
// the other browser: nothing of the first one's storage
const otherBrowser = (link) => {
  sessionStorage.clear();
  localStorage.clear();
  const u = new URL(link);
  go(`${u.pathname}${u.search}`);
};
const stored = (key) => JSON.parse(sessionStorage.getItem(key));
const storageKeys = () => Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  go('/');
});

describe('one draft: the one of the page the link opens', () => {
  it('carries the rating to another browser, rebuilt, on no later step than the comment', () => {
    go(`/borsch/${B1}/evaluations`);
    sessionStorage.setItem(rateKey(B1), JSON.stringify(saved()));
    sessionStorage.setItem('nb:geo-hint-shown', '1'); // not a draft: stays behind

    const link = handoffUrl();
    expect(new URL(link).pathname).toBe(`/borsch/${B1}/evaluations`);
    expect(new URL(link).searchParams.get(HANDOFF_PARAM)).toMatch(/^[A-Za-z0-9_-]+$/);

    otherBrowser(link);
    expect(applyHandoff()).toEqual({ drafts: 1, bowl: false });
    expect(stored(rateKey(B1))).toEqual({
      version: 2,
      step: COMMENT_STEP,
      values: { answers: restoreAnswers(answers), comment: 'Дуже смачний, з пампушками й часником' },
      handoff: true,
    });
    expect(sessionStorage.getItem('nb:geo-hint-shown')).toBeNull();
    // the parameter is gone from the address: not shared, not recorded
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe(`/borsch/${B1}/evaluations`);
  });

  it('leaves the other ratings of the tab behind', () => {
    go(`/borsch/${B1}/evaluations`);
    sessionStorage.setItem(rateKey(B1), JSON.stringify(saved()));
    sessionStorage.setItem(rateKey(B2), JSON.stringify(saved({ values: { answers: { overall: 2 }, comment: 'інший' } })));
    const payload = decode(handoffUrl());
    expect(JSON.stringify(payload)).not.toContain(B2);
    expect(JSON.stringify(payload)).not.toContain('інший');

    otherBrowser(handoffUrlFrom(`/borsch/${B1}/evaluations`, { [rateKey(B1)]: saved(), [rateKey(B2)]: saved() }));
    applyHandoff();
    expect(sessionStorage.getItem(rateKey(B2))).toBeNull();
    expect(stored(rateKey(B1))).not.toBeNull();
  });

  it('a link plants nothing for any other borshch, whatever it says', () => {
    const forged = {
      v: 2,
      draft: { step: 1, answers: { overall: 1 }, comment: '' },
      // the old format and every other shape of «more drafts»
      drafts: { [rateKey(B2)]: JSON.stringify(saved()) },
      key: rateKey(B2),
      [rateKey(B2)]: saved(),
    };
    go(`/borsch/${B1}/evaluations?${HANDOFF_PARAM}=${b64(forged)}`);
    expect(applyHandoff()).toEqual({ drafts: 1, bowl: false });
    expect(sessionStorage.getItem(rateKey(B2))).toBeNull();
    expect(storageKeys()).toEqual([rateKey(B1)]);

    // a link to a page that holds no rating writes nothing at all
    sessionStorage.clear();
    go(`/?${HANDOFF_PARAM}=${b64(forged)}`);
    expect(applyHandoff()).toEqual({ drafts: 0, bowl: false });
    expect(sessionStorage.length).toBe(0);
    go(`/borsch/${B2}?${HANDOFF_PARAM}=${b64(forged)}`);
    applyHandoff();
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps a draft the browser already has: it is newer than a link', () => {
    go(`/borsch/${B1}/evaluations`);
    sessionStorage.setItem(rateKey(B1), JSON.stringify(saved()));
    const link = handoffUrl();
    const local = { version: 2, step: 3, values: { answers: { overall: 4 }, comment: '' } };
    sessionStorage.setItem(rateKey(B1), JSON.stringify(local));
    const u = new URL(link);
    go(`${u.pathname}${u.search}`);
    expect(applyHandoff()).toEqual({ drafts: 0, bowl: false });
    expect(stored(rateKey(B1))).toEqual(local);
  });

  it('never carries the add flow: its draft is a whole new venue and borshch', () => {
    go('/add-borsch/select-place/x');
    sessionStorage.setItem('nb:quest-draft:add-borsch', JSON.stringify({ version: 2, step: 3, values: { name: 'Мій' } }));
    expect(collectHandoff()).toBeNull();
    expect(canHandoff()).toBe(false);
    expect(handoffUrl()).toBe('http://localhost/add-borsch/select-place/x');
  });

  it('a page with nothing to carry gets the plain address', () => {
    go('/borsch/x/evaluations?utm_source=threads');
    expect(canHandoff()).toBe(false);
    expect(handoffUrl()).toBe('http://localhost/borsch/x/evaluations?utm_source=threads');
  });

  it('without the parameter does nothing at all', () => {
    go('/borsch/x?y=1');
    expect(applyHandoff()).toBeNull();
    expect(window.location.search).toBe('?y=1');
  });
});

// a link made in the first browser with these drafts in its tab
function handoffUrlFrom(path, drafts) {
  sessionStorage.clear();
  Object.entries(drafts).forEach(([k, v]) => sessionStorage.setItem(k, JSON.stringify(v)));
  go(path);
  return handoffUrl();
}

describe('what comes in is rebuilt, and nothing malformed is written', () => {
  const land = (draft) => {
    sessionStorage.clear();
    go(`/borsch/${B1}/evaluations?${HANDOFF_PARAM}=${b64({ v: 2, draft })}&utm_source=threads`);
    const result = applyHandoff();
    // whatever happened, the address is clean
    expect(window.location.search).toBe('?utm_source=threads');
    return result;
  };

  it.each([
    ['a number', 5],
    ['an object', { text: 'x' }],
    ['an array', ['a', 'b']],
    ['null', null],
    ['true', true],
  ])('a comment that is %s becomes no comment, the answers stay', (_, comment) => {
    expect(land({ step: 4, answers: { overall: 7 }, comment })).toEqual({ drafts: 1, bowl: false });
    const draft = stored(rateKey(B1));
    expect(draft.values.comment).toBe('');
    expect(draft.values.answers.overall).toBe(7);
  });

  it.each([
    ['an array', [1, 2]],
    ['a string', 'draft'],
    ['a number', 5],
    ['null', null],
    ['nothing answered', { step: 3, answers: { overall: 99, salt: 'a' }, comment: '   ' }],
    ['answers that are an array', { step: 3, answers: [9], comment: 5 }],
  ])('a draft that is %s is dropped', (_, draft) => {
    expect(land(draft)).toEqual({ drafts: 0, bowl: false });
    expect(sessionStorage.length).toBe(0);
  });

  it('only the known fields, in range, survive', () => {
    land({
      step: 2,
      answers: { overall: 8, salt: 99, density: 2.5, sides: ['garlic', 'cyanide'], meat_amount: 0, meat_taste: 4, evil: 1 },
      comment: 'ок',
      submissionState: 'submitted',
      handoff: false,
      version: 7,
    });
    expect(stored(rateKey(B1))).toEqual({
      version: 2,
      step: 2,
      values: {
        answers: restoreAnswers({ overall: 8, sides: ['garlic'], meat_amount: 0 }),
        comment: 'ок',
      },
      handoff: true,
    });
  });

  it('a __proto__ in the link pollutes nothing', () => {
    const json = `{"v":2,"__proto__":{"polluted":1},"draft":{"__proto__":{"polluted":2},"step":1,"comment":"","answers":{"__proto__":{"polluted":3},"overall":5}}}`;
    const raw = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    go(`/borsch/${B1}/evaluations?${HANDOFF_PARAM}=${raw}`);
    expect(applyHandoff()).toEqual({ drafts: 1, bowl: false });
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
    expect(stored(rateKey(B1)).values.answers.overall).toBe(5);
    expect(Object.keys(stored(rateKey(B1)))).toEqual(['version', 'step', 'values', 'handoff']);
  });

  it.each([
    ['a string', '9', 0],
    ['negative', -3, 0],
    ['a fraction', 2.5, 0],
    ['past the comment', 99, COMMENT_STEP],
  ])('a step that is %s is made safe', (_, step, expected) => {
    land({ step, answers: { overall: 6 }, comment: '' });
    expect(stored(rateKey(B1)).step).toBe(expected);
  });

  it('a comment longer than the screen allows is cut to 1000 characters', () => {
    land({ step: 1, answers: { overall: 6 }, comment: 'Б'.repeat(1500) });
    expect(stored(rateKey(B1)).values.comment).toBe('Б'.repeat(1000));
  });

  it('a broken, foreign or oversized parameter writes nothing and still cleans the address', () => {
    [
      '%%%garbage',
      b64({ v: 1, drafts: { [rateKey(B1)]: JSON.stringify(saved()) } }),
      b64([1, 2, 3]),
      b64({ v: 2, draft: { step: 1, answers: { overall: 6 }, comment: 'x'.repeat(MAX_URL) } }),
    ].forEach((raw) => {
      go(`/borsch/${B1}/evaluations?${HANDOFF_PARAM}=${raw}&utm_source=threads`);
      expect(applyHandoff()).toBeNull();
      expect(window.location.search).toBe('?utm_source=threads');
      expect(sessionStorage.length).toBe(0);
    });
  });
});

describe('the whole address stays short enough to open', () => {
  it('drops somebody else\'s long parameters before it touches the comment', () => {
    go(`/borsch/${B1}/evaluations?fbclid=${'x'.repeat(5900)}&utm_source=threads`);
    sessionStorage.setItem(rateKey(B1), JSON.stringify(saved()));
    const link = handoffUrl();
    expect(link.length).toBeLessThanOrEqual(MAX_URL);
    expect(new URL(link).searchParams.has('fbclid')).toBe(false);
    expect(decode(link).draft.comment).toBe('Дуже смачний, з пампушками й часником');
  });

  it('keeps the parameters while there is room', () => {
    go(`/borsch/${B1}/evaluations?utm_source=threads`);
    sessionStorage.setItem(rateKey(B1), JSON.stringify(saved()));
    expect(new URL(handoffUrl()).searchParams.get('utm_source')).toBe('threads');
  });

  it('then cuts the comment from the end, and never drops the answers', () => {
    go(`/borsch/${B1}/evaluations`);
    const long = 'Насичений, кислуватий, з квасолею. '.repeat(30).slice(0, 1000);
    sessionStorage.setItem(rateKey(B1), JSON.stringify(saved({ values: { answers, comment: long } })));
    const link = handoffUrl(window.location.href, { maxLength: 1200 });
    expect(link.length).toBeLessThanOrEqual(1200);
    const { draft } = decode(link);
    expect(draft.answers).toEqual(answers);
    expect(draft.comment.length).toBeGreaterThan(0);
    expect(draft.comment.length).toBeLessThan(long.length);
    expect(long.startsWith(draft.comment)).toBe(true);
  });

  it('a full comment of 1000 characters fits under the default cap', () => {
    go(`/borsch/${B1}/evaluations?fbclid=IwZXh0bgNhZW0CMTEAAR2${'a'.repeat(150)}`);
    const long = 'Ї'.repeat(1000);
    sessionStorage.setItem(rateKey(B1), JSON.stringify(saved({ values: { answers, comment: long } })));
    const link = handoffUrl();
    expect(link.length).toBeLessThanOrEqual(MAX_URL);
    expect(decode(link).draft.comment).toBe(long);
  });
});

describe('a bowl', () => {
  const lookup = (map) => jest.fn(async (id) => {
    if (map[id]) return map[id];
    const e = new Error('Not found');
    e.status = 404;
    throw e;
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('of a borshch on the map travels without its photos, named from the map', async () => {
    const bowl = await createDraft({ place: { id: 'p1', name: 'Маяк', city: 'Київ' }, borsch: { id: 'b1', name: 'Домашній' } });
    go(`/bowl/${bowl.id}/rate`);
    sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify(saved()));
    expect(canHandoff()).toBe(true);
    const link = handoffUrl();
    // the names stay behind: the other browser reads them from the map
    expect(JSON.stringify(decode(link))).not.toContain('Маяк');

    otherBrowser(link);
    const lookupBorsch = lookup({ b1: { id_borsch: 'b1', name: 'Борщ дня', place_id: 'p1', place_name: 'Маяк на Подолі', place_city: 'Київ' } });
    expect(applyHandoff({ lookupBorsch })).toEqual({ drafts: 1, bowl: true });
    expect(getDraft(bowl.id)).toMatchObject({ id: bowl.id, borsch: { id: 'b1', name: '' }, photoCount: 0, reviewedAt: null });
    await flush();
    expect(lookupBorsch).toHaveBeenCalledWith('b1');
    expect(getDraft(bowl.id)).toMatchObject({
      place: { id: 'p1', name: 'Маяк на Подолі', city: 'Київ' },
      borsch: { id: 'b1', name: 'Борщ дня' },
    });
    expect(stored(`nb:quest-draft:bowl:${bowl.id}`).handoff).toBe(true);
  });

  it('names from a link are never shown, and a borshch the map does not have takes the bowl with it', async () => {
    const now = Date.now();
    go(`/bowl/bowl_x2_bbbbbb/rate?${HANDOFF_PARAM}=${b64({
      v: 2,
      draft: { step: 3, answers: { overall: 9 }, comment: '' },
      bowl: { id: 'bowl_x2_bbbbbb', createdAt: now, place: { id: 'p1', name: 'Виграй iPhone: t.me/x' }, borsch: { id: 'nope', name: 'Тисни' }, photoMode: 'now', photoTakenAt: '2026-11-22T10:00' },
    })}`);
    const lookupBorsch = lookup({});
    expect(applyHandoff({ lookupBorsch })).toEqual({ drafts: 1, bowl: true });
    const bowl = getDraft('bowl_x2_bbbbbb');
    expect(bowl.place).toEqual({ id: 'p1', name: '', city: '' });
    expect(bowl.borsch).toEqual({ id: 'nope', name: '' });
    expect(bowl.photoTakenAt).toBeUndefined();
    await flush();
    await flush();
    expect(getDraft('bowl_x2_bbbbbb')).toBeNull();
  });

  it('from the future is refused, and so are its answers', () => {
    const now = Date.now();
    go(`/bowl/bowl_x3_cccccc/rate?${HANDOFF_PARAM}=${b64({
      v: 2,
      draft: { step: 3, answers: { overall: 9 }, comment: '' },
      bowl: { id: 'bowl_x3_cccccc', createdAt: now + 2 * 60 * 1000, place: { id: 'p1' }, borsch: { id: 'b1' } },
    })}`);
    expect(applyHandoff()).toEqual({ drafts: 0, bowl: false });
    expect(listDrafts()).toEqual([]);
    expect(sessionStorage.length).toBe(0);
  });

  it('that is not the bowl of the page is not taken', () => {
    go(`/bowl/bowl_x4_dddddd/rate?${HANDOFF_PARAM}=${b64({
      v: 2,
      draft: { step: 3, answers: { overall: 9 }, comment: '' },
      bowl: { id: 'bowl_other_eeeeee', createdAt: Date.now(), place: { id: 'p1' }, borsch: { id: 'b1' } },
    })}`);
    expect(applyHandoff()).toEqual({ drafts: 0, bowl: false });
    expect(listDrafts()).toEqual([]);
    expect(sessionStorage.length).toBe(0);
  });

  it('of a new venue or borshch does not travel, so the page has nothing to carry', async () => {
    const bowl = await createDraft({ place: { id: null, name: 'Нова', city: 'Львів', google: { place_id: 'g' } }, borsch: { id: null, name: 'Інший' } });
    go(`/bowl/${bowl.id}/rate`);
    sessionStorage.setItem(`nb:quest-draft:bowl:${bowl.id}`, JSON.stringify(saved()));
    expect(collectHandoff()).toBeNull();
    expect(canHandoff()).toBe(false);

    // and a forged one is refused on arrival
    sessionStorage.clear();
    localStorage.clear();
    go(`/bowl/bowl_x5_ffffff/rate?${HANDOFF_PARAM}=${b64({
      v: 2,
      draft: { step: 3, answers: { overall: 9 }, comment: '' },
      bowl: { id: 'bowl_x5_ffffff', createdAt: Date.now(), place: { id: null, name: 'Fake', google: { place_id: 'g' } }, borsch: { id: null, name: 'Fake', created: true } },
    })}`);
    expect(applyHandoff()).toEqual({ drafts: 0, bowl: false });
    expect(getDraft('bowl_x5_ffffff')).toBeNull();
  });
});
