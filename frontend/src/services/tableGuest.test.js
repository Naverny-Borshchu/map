import { cleanupTableGuests, dropTableGuestToken, readTableGuest, saveTableGuest, TABLE_GUEST_TTL_MS } from './tableGuest';

/** What a device remembers per table: the guest token, the name, the answers in progress. */

beforeEach(() => localStorage.clear());

it('keeps the token, the name and the draft per table, in any case of the code', () => {
  saveTableGuest('k7m2qx', { name: 'Оля' });
  saveTableGuest('K7M2QX', { token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', draft: { position: 2, grades: { meat: 8 }, step: 1 } });
  expect(readTableGuest('K7M2QX')).toEqual({
    token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Оля', draft: { position: 2, grades: { meat: 8 }, step: 1 },
  });
  expect(readTableGuest('ZZZZZZ')).toEqual({ token: null, name: '', draft: null });
});

it('forgets a broken token but not the name', () => {
  saveTableGuest('K7M2QX', { token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Оля' });
  dropTableGuestToken('K7M2QX');
  expect(readTableGuest('K7M2QX')).toEqual(expect.objectContaining({ token: null, name: 'Оля' }));
});

it('survives rubbish in storage and sweeps records past 60 days', () => {
  localStorage.setItem('nb:table:BROKEN', '{nope');
  expect(readTableGuest('BROKEN')).toEqual({ token: null, name: '', draft: null });
  const now = Date.now();
  saveTableGuest('OLDOLD', { token: 'x'.repeat(24) }, now - TABLE_GUEST_TTL_MS - 1000);
  saveTableGuest('NEWNEW', { token: 'y'.repeat(24) }, now);
  expect(readTableGuest('OLDOLD', now).token).toBeNull();
  expect(cleanupTableGuests(now)).toBe(2);
  expect(localStorage.getItem('nb:table:NEWNEW')).not.toBeNull();
  expect(localStorage.getItem('nb:table:OLDOLD')).toBeNull();
});
