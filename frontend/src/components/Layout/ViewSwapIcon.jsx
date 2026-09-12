/**
 * The map/list tab is a switch, not a destination.
 *
 * It used to be a two-button segmented control floating over the map ("Мапа |
 * Список"), which spent width on telling you where you already were. As a
 * single bottom-nav tab the risk is the opposite one: a tab normally means "go
 * here", so nothing would suggest you can tap it again to come back.
 *
 * Hence the swap arrows wrapped around the glyph. The glyph is the view you
 * will GET (list while you are on the map, map while you are on the list), and
 * the two arrows say the trip is round.
 */
export const ViewSwapIcon = ({ to = 'list', size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">
    {/* the round trip: one arrow over the top, one back under the bottom */}
    <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
      <path d="M4.6 9.4a10 10 0 0 1 8.2-5.3" />
      <path d="M11.1 2.2 13.2 4.2 11.2 6.3" />
      <path d="M23.4 18.6a10 10 0 0 1-8.2 5.3" />
      <path d="M16.9 25.8 14.8 23.8 16.8 21.7" />
    </g>

    {to === 'list' ? (
      /* rows — what a tap gives you while you are on the map */
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10 11h9" />
        <path d="M10 14.5h9" />
        <path d="M10 18h6" />
        <path d="M7 11h0.01" />
        <path d="M7 14.5h0.01" />
        <path d="M7 18h0.01" />
      </g>
    ) : (
      /* a folded map with a pin — what a tap gives you while you are on the list */
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M7 10.6 11.2 9.2 16.8 11.2 21 9.8v8.4L16.8 19.6 11.2 17.6 7 19z" />
        <path d="M11.2 9.2v8.4M16.8 11.2v8.4" />
      </g>
    )}
  </svg>
);

export default ViewSwapIcon;
