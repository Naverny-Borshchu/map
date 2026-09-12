import { priceToUAH } from './filtering';
import { hasRating } from './rating';

const identityCompare = (a, b) => {
  const byName = String(a?.name || '').localeCompare(String(b?.name || ''), 'uk-UA');
  if (byName !== 0) return byName;
  return String(a?.id_borsch || '').localeCompare(String(b?.id_borsch || ''), 'uk-UA');
};

const validDistance = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const distance = Number(value);
  return Number.isFinite(distance) && distance >= 0 ? distance : null;
};

const compareOptional = (a, b, direction) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * (a - b);
};

export const sortBorsches = (rows, mode = 'best', distanceFor = () => null) => {
  const valueFor = {
    best: (borsch) => hasRating(borsch.overall_rating) ? Number(borsch.overall_rating) : null,
    near: (borsch) => validDistance(distanceFor(borsch)),
    cheapest: (borsch) => {
      const price = priceToUAH(borsch.price);
      return Number.isNaN(price) ? null : price;
    },
    expensive: (borsch) => {
      const price = priceToUAH(borsch.price);
      return Number.isNaN(price) ? null : price;
    },
  };
  const direction = mode === 'best' || mode === 'expensive' ? -1 : 1;
  const getValue = valueFor[mode] || valueFor.best;

  return [...(rows || [])].sort((a, b) =>
    compareOptional(getValue(a), getValue(b), direction) || identityCompare(a, b)
  );
};
