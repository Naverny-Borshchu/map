import style from './Mascot.module.scss';

/**
 * "Борщик" — the app's mascot, a beetroot with a face.
 *
 * The beet is already the brand's map marker, so the character is drawn from
 * the same shape rather than introducing an unrelated creature. Its expression
 * follows the score being given, which is the whole point: the rating flow
 * should react to you.
 *
 * mood: 'idle' | 'sad' | 'meh' | 'happy' | 'love' | 'party'
 */
export const Mascot = ({ mood = 'idle', size = 96, className = '' }) => {
  const eyes = {
    idle:  { l: 'M 34 44 a 3 3 0 1 0 0.1 0', r: 'M 62 44 a 3 3 0 1 0 0.1 0' },
    sad:   { l: 'M 30 44 l 8 3', r: 'M 66 44 l -8 3' },
    meh:   { l: 'M 30 45 l 8 0', r: 'M 58 45 l 8 0' },
    happy: { l: 'M 30 46 q 4 -6 8 0', r: 'M 58 46 q 4 -6 8 0' },
    love:  { l: 'M 30 46 q 4 -6 8 0', r: 'M 58 46 q 4 -6 8 0' },
    party: { l: 'M 30 46 q 4 -6 8 0', r: 'M 58 46 q 4 -6 8 0' },
  }[mood] || {};

  const mouth = {
    idle:  'M 40 58 q 8 4 16 0',
    sad:   'M 40 62 q 8 -7 16 0',
    meh:   'M 40 60 l 16 0',
    happy: 'M 38 56 q 10 12 20 0',
    love:  'M 38 56 q 10 14 20 0',
    party: 'M 38 56 q 10 14 20 0',
  }[mood] || 'M 40 58 q 8 4 16 0';

  return (
    <div className={`${style.wrap} ${style[mood] || ''} ${className}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 96 96" className={style.svg}>
        {/* leaves */}
        <path d="M48 22 C46 10 38 6 32 6 c2 8 6 14 14 17" fill="#5D7E52" />
        <path d="M48 22 C50 10 58 6 64 6 c-2 8 -6 14 -14 17" fill="#6E9161" />
        <path d="M48 24 L48 14" stroke="#5D7E52" strokeWidth="3" strokeLinecap="round" />
        {/* body */}
        <path
          d="M48 24 C30 24 20 38 20 52 C20 72 34 88 48 88 C62 88 76 72 76 52 C76 38 66 24 48 24 Z"
          fill="#C21B48"
        />
        <path
          d="M48 30 C36 30 28 40 28 52 C28 66 38 80 48 80 C58 80 68 66 68 52 C68 40 60 30 48 30 Z"
          fill="#DC143C"
          opacity="0.65"
        />
        {/* face */}
        {mood === 'sad' || mood === 'meh' ? (
          <>
            <path d={eyes.l} stroke="#3A0512" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d={eyes.r} stroke="#3A0512" strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <path d={eyes.l} stroke="#3A0512" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <path d={eyes.r} stroke="#3A0512" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </>
        )}
        <path d={mouth} stroke="#3A0512" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* cheeks when pleased */}
        {(mood === 'happy' || mood === 'love' || mood === 'party') && (
          <>
            <ellipse cx="30" cy="55" rx="5" ry="3.5" fill="#FF7A9A" opacity="0.75" />
            <ellipse cx="66" cy="55" rx="5" ry="3.5" fill="#FF7A9A" opacity="0.75" />
          </>
        )}
        {mood === 'love' && (
          <path d="M74 26 c3-4 9-1 6 4 c-2 3 -6 5 -6 5 s-4-2 -6-5 c-3-5 3-8 6-4 z" fill="#FF3D6E" />
        )}
      </svg>
    </div>
  );
};
