// Navigation glyphs drawn in currentColor, so a tab's colour is one CSS rule
// (the old ones were two baked SVG files per tab, grey and green).

export const IconPlus = ({ size = 22, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" focusable="false" {...rest}>
    <path d="M12 4.5v15M4.5 12h15" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

export const IconUser = ({ size = 24, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...rest}>
    <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.9" />
    <path d="M4.8 19.6c.9-3.4 3.8-5.3 7.2-5.3s6.3 1.9 7.2 5.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);
