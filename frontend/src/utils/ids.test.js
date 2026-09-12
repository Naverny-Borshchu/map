import { normalizeId, requireId } from './ids';

describe('normalizeId', () => {
  it('passes a real id through unchanged', () => {
    expect(normalizeId('5311f8ac-1de8-49e4-98eb-1d83fc16da03'))
      .toBe('5311f8ac-1de8-49e4-98eb-1d83fc16da03');
  });

  it('accepts a numeric id, because the places catalogue still has some', () => {
    expect(normalizeId(42)).toBe('42');
  });

  it.each([
    ['missing field', undefined],
    ['explicit null', null],
    ['empty string', ''],
    ['whitespace', '   '],
  ])('reports %s as no id', (_label, input) => {
    expect(normalizeId(input)).toBe('');
  });

  it.each([
    // the exact values that reached production as UUIDs
    ['undefined'],
    ['null'],
  ])('refuses the literal string %p that String() produces', (input) => {
    expect(normalizeId(input)).toBe('');
  });

  it('trims, so a padded id still matches a clean one', () => {
    expect(normalizeId('  abc  ')).toBe('abc');
  });

  it('does not mistake a real id that merely contains the word', () => {
    expect(normalizeId('undefined-cafe-01')).toBe('undefined-cafe-01');
  });

  it('keeps 0 — a falsy id is still an id', () => {
    expect(normalizeId(0)).toBe('0');
  });
});

describe('requireId', () => {
  it('returns the id when there is one', () => {
    expect(requireId('abc', 'created place')).toBe('abc');
  });

  it.each([undefined, null, '', 'undefined', 'null'])(
    'throws on %p, naming what was missing',
    (input) => {
      expect(() => requireId(input, 'created borsch'))
        .toThrow('Missing created borsch id in API response.');
    },
  );
});
