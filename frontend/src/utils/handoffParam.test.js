import { HANDOFF_PARAM, withoutHandoff } from './handoffParam';

it('takes the carried answers out of any address, and leaves the rest as it was', () => {
  const base = 'https://map.navernyborshchu.com/borsch/b1/evaluations';
  expect(withoutHandoff(`${base}?${HANDOFF_PARAM}=eyJ2Ijoy`)).toBe(base);
  expect(withoutHandoff(`${base}?${HANDOFF_PARAM}=eyJ2Ijoy&utm_source=threads`)).toBe(`${base}?utm_source=threads`);
  expect(withoutHandoff(`${base}?utm_source=threads&${HANDOFF_PARAM}=eyJ2Ijoy`)).toBe(`${base}?utm_source=threads`);
  expect(withoutHandoff(`${base}?a=1&${HANDOFF_PARAM}=eyJ2Ijoy&b=2#x`)).toBe(`${base}?a=1&b=2#x`);
  expect(withoutHandoff(`?${HANDOFF_PARAM}=eyJ2Ijoy`)).toBe('');
  expect(withoutHandoff(`${base}?not_${HANDOFF_PARAM}=1`)).toBe(`${base}?not_${HANDOFF_PARAM}=1`);
  expect(withoutHandoff(base)).toBe(base);
  expect(withoutHandoff(5)).toBe(5);
  expect(withoutHandoff(null)).toBeNull();
});
