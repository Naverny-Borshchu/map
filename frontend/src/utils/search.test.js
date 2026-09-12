import {
  buildIndex,
  search,
  levenshtein,
  translitKey,
  switchLayout,
  maxEditsFor,
} from './search';

const ITEMS = [
  { id: 'p1', kind: 'venue', label: 'Глек', texts: ['Глек', 'Glek'], boost: 8.4 },
  { id: 'p2', kind: 'venue', label: 'Пузата хата', texts: ['Пузата хата', 'Puzata Hata'], boost: 7.1 },
  { id: 'p3', kind: 'venue', label: 'Первак', texts: ['Первак', 'Pervak'], boost: 8.9 },
  { id: 'p4', kind: 'venue', label: 'Канапа', texts: ['Канапа', 'Kanapa'], boost: 8.0 },
  { id: 'p5', kind: 'venue', label: 'Царське село', texts: ['Царське село', 'Tsarske Selo'], boost: 7.7 },
  { id: 'd1', kind: 'dish', label: 'Борщ з пампушками', texts: ['Борщ з пампушками', 'Borsch with pampushky'], boost: 9.1 },
];

const index = buildIndex(ITEMS);
const ids = (q) => search(index, q).map((r) => r.item.id);

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('hlek', 'hlek')).toBe(0);
    expect(levenshtein('hlek', 'hlik')).toBe(1);
    expect(levenshtein('kanapa', 'canapa')).toBe(1);
  });
  it('short words tolerate 1 edit, long ones 2', () => {
    expect(maxEditsFor(4)).toBe(1);
    expect(maxEditsFor(8)).toBe(2);
    expect(maxEditsFor(2)).toBe(0);
  });
});

describe('transliteration key', () => {
  it('collapses glek / hlek / Глек to one key', () => {
    expect(translitKey('glek')).toBe(translitKey('Глек'));
    expect(translitKey('hlek')).toBe(translitKey('Глек'));
  });
  it('folds digraph spellings', () => {
    expect(translitKey('Tsarske')).toBe(translitKey('Царське'));
    expect(translitKey('kharkiv')).toBe(translitKey('Харків'));
  });
});

describe('search', () => {
  it('finds the Cyrillic venue by Latin transliteration variants', () => {
    expect(ids('glek')[0]).toBe('p1');
    expect(ids('hlek')[0]).toBe('p1');
    expect(ids('Глек')[0]).toBe('p1');
  });

  it('finds by the English synonym and back', () => {
    expect(ids('Puzata Hata')[0]).toBe('p2');
    expect(ids('пузата')[0]).toBe('p2');
    expect(ids('hata')[0]).toBe('p2');
  });

  it('matches in the middle of a word', () => {
    expect(ids('узат')).toContain('p2');
    expect(ids('ервак')).toContain('p3');
  });

  it('tolerates one typo as a fallback', () => {
    expect(ids('пузота')).toContain('p2'); // а→о
    expect(ids('kanaba')).toContain('p4'); // p→b
  });

  it('handles a query typed in the wrong keyboard layout', () => {
    expect(switchLayout('uktr')).toBe('глек');
    expect(ids('uktr')[0]).toBe('p1');
  });

  it('ranks exact prefix over substring over fuzzy', () => {
    const res = search(index, 'перв');
    expect(res[0].item.id).toBe('p3');
    expect(res[0].tier).toBe('PREFIX');

    const mid = search(index, 'узат');
    expect(mid[0].tier).toBe('SUBSTRING');

    const fuzzy = search(index, 'пузота');
    expect(fuzzy[0].tier).toBe('FUZZY');
  });

  it('returns nothing for an empty or hopeless query', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, 'xxxxxxxxxx')).toEqual([]);
  });
});
