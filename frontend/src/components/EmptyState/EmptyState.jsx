import { Link } from 'react-router-dom';
import spoonArt from '../../assets/illustrations/spoon.webp';
import letterArt from '../../assets/illustrations/letter.webp';
import findArt from '../../assets/illustrations/find.webp';
import style from './EmptyState.module.scss';

const ART = { spoon: spoonArt, letter: letterArt, find: findArt };

/** A bowl with three wisps of steam: the app's loader. */
export const BowlLoader = ({ size = 56, label }) => (
  <span className={style.loader} style={{ '--s': `${size}px` }} role={label ? 'status' : undefined}>
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <g className={style.steam} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M17 6c-1.6 2-1.6 4 0 6s1.6 4 0 6" />
        <path d="M24 4c-1.6 2-1.6 4 0 6s1.6 4 0 6" />
        <path d="M31 6c-1.6 2-1.6 4 0 6s1.6 4 0 6" />
      </g>
      <path d="M6 24h36c0 8.2-6.2 14.8-13.6 16.6V43h-8.8v-2.4C12.2 38.8 6 32.2 6 24Z" fill="currentColor" />
    </svg>
    {label && <span className="nb-sr-only">{label}</span>}
  </span>
);

/**
 * Empty, loading and error screens in one shape: a drawn illustration from the
 * landing (or the bowl loader), a MAK title, one line, one action.
 */
export const EmptyState = ({ art = 'spoon', loading = false, title, text, action, compact = false, children }) => (
  <div className={`${style.wrap} ${compact ? style.compact : ''}`.trim()}>
    {loading ? (
      <BowlLoader size={compact ? 44 : 56} />
    ) : (
      art && ART[art] && <img className={style.art} src={ART[art]} alt="" loading="lazy" />
    )}
    {title && <h2 className={style.title} role={loading ? 'status' : undefined}>{title}</h2>}
    {text && <p className={style.text}>{text}</p>}
    {action && (action.to ? (
      <Link to={action.to} className={style.action}>{action.label}</Link>
    ) : (
      <button type="button" className={style.action} onClick={action.onClick}>{action.label}</button>
    ))}
    {children}
  </div>
);

export default EmptyState;
