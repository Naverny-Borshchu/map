// Display labels for the price and weight strings the API mapper builds
// ("≈185 ₴", "400 g."). The stored strings stay as they are: filtering parses
// them. Only the shown unit follows the language and the brand: Roboto has no
// ₴ glyph, so the landing writes «грн» / «UAH», and so does the app now.

export const priceLabel = (price, t) => {
  if (!price) return '';
  return String(price).replace(/\s*₴\s*$/, ` ${t('unit.uah')}`);
};

export const weightLabel = (weight, t) => {
  if (!weight) return '';
  return String(weight).replace(/\s*g\.?\s*$/, ` ${t('unit.gram')}`);
};
