import {
  buildTablePayload, factError, isTableValid, knownFacts, newNameError, parseAmount, validateTable,
} from './tableForm';

/**
 * The host's form: what may go on a table, which numbers are a price or a
 * portion, and the exact body POST /api/tables/ gets.
 */

const existing = (id, name) => ({ key: id, id, name });
const fresh = (name) => ({ key: `new:${name}`, id: null, name });

describe('numbers the host types', () => {
  it('reads prices and portions with a comma or a unit', () => {
    expect(parseAmount('185')).toBe(185);
    expect(parseAmount('185,50')).toBe(185.5);
    expect(parseAmount(' 350 г')).toBe(350);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('грн')).toBeNull();
  });

  it('an empty field is «не знаю», a number out of range is a typo', () => {
    expect(factError('price', '')).toBeNull();
    expect(factError('price', '185')).toBeNull();
    expect(factError('price', '0')).toBe('range');
    expect(factError('price', '-10')).toBe('range');
    expect(factError('price', '25000')).toBe('range');
    expect(factError('weight', '350')).toBeNull();
    expect(factError('weight', '35')).toBe('range');
    expect(factError('weight', '3500')).toBe('range');
    expect(factError('weight', 'abc')).toBe('range');
  });

  it('reads what the map already knows from the mapped borshch', () => {
    expect(knownFacts({ price: '≈185 ₴', weight: '350 g.' })).toEqual({ price: 185, weight: 350 });
    expect(knownFacts({ price: '', weight: '' })).toEqual({ price: null, weight: null });
  });
});

describe('a new borshch typed in', () => {
  it('needs a name, not too long, not already on the table', () => {
    const items = [existing('b1', 'Борщ червоний')];
    expect(newNameError('   ', items)).toBe('empty');
    expect(newNameError('б'.repeat(121), items)).toBe('long');
    expect(newNameError('  борщ   ЧЕРВОНИЙ ', items)).toBe('duplicate');
    expect(newNameError('Борщ з чорносливом', items)).toBeNull();
  });

  it('a table takes ten at most', () => {
    const ten = Array.from({ length: 10 }, (_, i) => existing(`b${i}`, `Борщ ${i}`));
    expect(newNameError('Ще один', ten)).toBe('tooMany');
  });
});

describe('the whole form', () => {
  it('cannot be created empty', () => {
    const errors = validateTable({ items: [], facts: {}, title: '' });
    expect(errors.items).toBe('none');
    expect(isTableValid(errors)).toBe(false);
  });

  it('points at the borshch whose price or weight cannot be right', () => {
    const items = [existing('b1', 'Червоний'), fresh('Зелений')];
    const errors = validateTable({
      items,
      facts: { b1: { price: '185', weight: '35' }, 'new:Зелений': { price: '0' } },
      title: '',
    });
    expect(errors.facts).toEqual({
      b1: { price: null, weight: 'range' },
      'new:Зелений': { price: 'range', weight: null },
    });
    expect(isTableValid(errors)).toBe(false);
  });

  it('a title is optional but not endless', () => {
    expect(validateTable({ items: [existing('b1', 'x')], title: 'т'.repeat(121) }).title).toBe('long');
    expect(isTableValid(validateTable({ items: [existing('b1', 'x')], title: '' }))).toBe(true);
  });
});

describe('the body POST /api/tables/ gets', () => {
  it('sends ids for borshch of the map, names for new ones, in the order chosen', () => {
    const body = buildTablePayload({
      place: 'p1',
      items: [existing('b2', 'Зелений'), fresh('  Борщ   з чорносливом '), existing('b1', 'Червоний')],
      facts: {
        b2: { price: '185', weight: '350' },
        'new:  Борщ   з чорносливом ': { price: '210,5' },
      },
      blind: 1,
      title: '  День   Борщу у Львові ',
    });
    expect(body).toEqual({
      place: 'p1',
      blind: true,
      title: 'День Борщу у Львові',
      borsches: [
        { id: 'b2', price_uah: 185, weight_grams: 350 },
        { name: 'Борщ з чорносливом', price_uah: 210.5 },
        { id: 'b1' },
      ],
    });
  });

  it('leaves out empty and impossible numbers: the card keeps what it has', () => {
    const body = buildTablePayload({
      place: 'p1',
      items: [existing('b1', 'Червоний')],
      facts: { b1: { price: '', weight: '9999' } },
    });
    expect(body.borsches).toEqual([{ id: 'b1' }]);
    expect(body.blind).toBe(false);
    expect(body.title).toBe('');
  });
});


describe('stage 3: a new borshch may carry its meat type', () => {
  it('only a new one, only a known type', () => {
    const body = buildTablePayload({
      place: 'p1',
      items: [
        { key: 'b1', id: 'b1', name: 'Червоний' },
        { key: 'new:a', id: null, name: 'Борщ з квасолею' },
        { key: 'new:b', id: null, name: 'Борщ дня' },
      ],
      facts: { b1: { meat: 'pork' }, 'new:a': { meat: 'beef' }, 'new:b': { meat: 'горох' } },
    });
    expect(body.borsches).toEqual([{ id: 'b1' }, { name: 'Борщ з квасолею', type_meat: 'beef' }, { name: 'Борщ дня' }]);
  });
});
