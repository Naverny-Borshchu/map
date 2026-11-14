/**
 * The «Відгуки» list on a borshch card: EVERY rating, newest first, with its text when there is one.
 *
 * It used to keep only ratings with a comment while the header counted all of them, so a card said
 * «6 відгуків» and listed four people (14.11.2026, MALANKA: two of six ratings had scores only,
 * Andrii's own among them). A score-only rating is a review too: it shows its name, date and bowls.
 */
export const buildReviewList = (comments, fallbackName) =>
  (comments || [])
    .map((comment, index) => ({
      name: comment.author_username || fallbackName(index + 1),
      photo: 'avatar.png',
      overall_rating: comment.overall_rating,
      created_at: comment.created_at ? String(comment.created_at).slice(0, 10) : '',
      sortKey: comment.created_at ? String(comment.created_at) : '',
      messege: comment.messege && comment.messege.trim() ? comment.messege.trim() : '',
    }))
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
