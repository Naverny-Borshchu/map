// Small line icons in the brand's hand: rounded 2px strokes in currentColor.
// No emoji anywhere in the UI (brand kit), and ratings are bowls, never stars.

const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  'aria-hidden': 'true',
  focusable: 'false',
});

// a map pin over a folded map
export const IconMapPin = ({ size = 24, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 21s-6.2-5.4-6.2-10.6A6.2 6.2 0 0 1 12 4.2a6.2 6.2 0 0 1 6.2 6.2C18.2 15.6 12 21 12 21Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="10.4" r="2.3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// the bowl of the rating scale, with steam
export const IconBowl = ({ size = 24, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M3.2 11.2h17.6c0 4-3.1 7.2-6.6 8.1v1.1H9.8v-1.1c-3.5-.9-6.6-4.1-6.6-8.1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 3.6c-.6.8-.6 1.6 0 2.4s.6 1.6 0 2.4M12.5 3.2c-.6.8-.6 1.6 0 2.4s.6 1.6 0 2.4M16 3.6c-.6.8-.6 1.6 0 2.4s.6 1.6 0 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// a spoon with a plus: taste and add
export const IconSpoonPlus = ({ size = 24, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <ellipse cx="8" cy="7.2" rx="3.6" ry="4.4" transform="rotate(-35 8 7.2)" stroke="currentColor" strokeWidth="2" />
    <path d="m10.3 10.4 7.4 9.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M18.2 3.4v6M15.2 6.4h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconCamera = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 8.2c0-1 .8-1.8 1.8-1.8h2.1l1.4-2h5.4l1.4 2h2.1c1 0 1.8.8 1.8 1.8v9.4c0 1-.8 1.8-1.8 1.8H5.8c-1 0-1.8-.8-1.8-1.8V8.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="12.6" r="3.4" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const IconSearch = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <circle cx="10.6" cy="10.6" r="6.4" stroke="currentColor" strokeWidth="2.2" />
    <path d="m15.4 15.4 4.6 4.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const IconHeart = ({ size = 22, filled = false, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 20s-7.6-4.6-7.6-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.6 2.6C19.6 15.4 12 20 12 20Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const IconShare = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 14.5V3.8M8 7.6l4-3.8 4 3.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 10.5H6.2c-1 0-1.8.8-1.8 1.8v6.1c0 1 .8 1.8 1.8 1.8h11.6c1 0 1.8-.8 1.8-1.8v-6.1c0-1-.8-1.8-1.8-1.8h-1.3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
);

export const IconClose = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
  </svg>
);

export const IconChevronRight = ({ size = 20, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconChevronLeft = ({ size = 20, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconRoute = ({ size = 20, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 2.8 21.2 12 12 21.2 2.8 12 12 2.8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 14.2v-2.4c0-.8.6-1.4 1.4-1.4h4.2M13.2 8.6l1.8 1.8-1.8 1.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconFilter = ({ size = 20, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <circle cx="16" cy="7" r="2.2" stroke="currentColor" strokeWidth="2.1" />
    <circle cx="8" cy="17" r="2.2" stroke="currentColor" strokeWidth="2.1" />
  </svg>
);

export const IconLocate = ({ size = 20, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M20.2 3.8 3.8 10.6l7 2.6 2.6 7 6.8-16.4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const IconLock = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.4" stroke="currentColor" strokeWidth="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconLogout = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M10 4.5H6.6c-1 0-1.8.8-1.8 1.8v11.4c0 1 .8 1.8 1.8 1.8H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14.5 8 18.5 12l-4 4M18.3 12H9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconInfo = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="2" />
    <path d="M12 11v5.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="7.9" r="1.3" fill="currentColor" />
  </svg>
);

export const IconHelp = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="2" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2 1-1.2 1.8v.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16.9" r="1.2" fill="currentColor" />
  </svg>
);

export const IconDoc = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="M7 3.8h6.6l4.4 4.4v10.2c0 1-.8 1.8-1.8 1.8H7c-1 0-1.8-.8-1.8-1.8V5.6c0-1 .8-1.8 1.8-1.8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M13.4 4v4.4h4.4M8.6 12.6h6.8M8.6 16h4.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const IconPerson = ({ size = 22, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2" />
    <path d="M4.8 19.6c.9-3.4 3.8-5.3 7.2-5.3s6.3 1.9 7.2 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconCheck = ({ size = 20, ...rest }) => (
  <svg {...base(size)} {...rest}>
    <path d="m5.5 12.5 4.2 4.2 8.8-9.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
