/**
 * A test BorshchCoin (BRSH), the joke coin of navernyborshchu.com/crypto: a
 * gold disc with the borshch plate on its face. Points for ratings are shown
 * in it instead of «XP» (Андрій, 15.11.2026). Decorative: the number next to
 * it carries the meaning.
 */
export const CoinIcon = ({ size = 16, className = '' }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="11" fill="#E8B030" />
    <circle cx="12" cy="12" r="11" fill="none" stroke="#B8801A" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="7.2" fill="#FFFAF5" />
    <circle cx="12" cy="12" r="5.4" fill="#DC143C" />
    <circle cx="10.4" cy="10.6" r="1.7" fill="#FFFAF5" />
    <rect x="13" y="12.6" width="2.2" height="2.2" rx="0.6" fill="#860130" />
  </svg>
);

export default CoinIcon;
