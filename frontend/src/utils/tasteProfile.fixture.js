/** A `profile` as the API sends it (SPEC «Контракт API»), for tests and screenshots. */
// The example of the spec: nine ratings with the new questions.
export const PROFILE = {
  reviews: 9,
  meat_amount: { counts: [0, 0, 3, 6], n: 9 },
  beet_amount: { counts: [1, 2, 6], n: 9 },
  beet_flavor: { counts: [0, 0, 2, 5, 2], n: 9 },
  density: { mean: 7.6, n: 9, legacy_n: 0 },
  salt: { mean: 5.3, n: 9, legacy_n: 0, low: 2, high: 1 },
  sides: { counts: { sour_cream: 8, pampushky: 6, salo: 5, garlic: 3, bread: 2, greens: 2 }, n: 9, none: 0 },
  meat_taste: { mean: 4.6, n: 9 },
  aftertaste: { mean: 4.4, n: 8 },
  serving_taste: { mean: 4.1, n: 9 },
};

