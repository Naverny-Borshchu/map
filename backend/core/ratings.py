"""
One definition of a borsch's stored rating, and the only place that writes it.

`Borsch` keeps its six criteria plus the overall score denormalised, so the map
can sort and colour hundreds of pins without touching `Review`. That copy is
only ever correct if *everything* that changes a review refreshes it.

Until now only `ReviewViewSet` did. Everything that writes reviews by another
door — the 2023-24 catalogue import, the Django admin, a management command, a
shell session — left the copy behind, silently and permanently. Five borsches
were showing the wrong score in production because of exactly that: the stored
value equalled one imported review instead of the average of two, and one dish
with a real 4.0 review was displaying 0.0, i.e. reading as never rated.

So the recalculation lives here and is wired to the model's own signals in
`core.signals`. Any path that saves or deletes a review now keeps the copy
honest, including paths nobody has written yet.
"""

from decimal import Decimal

RATING_FIELDS = (
    'rating_salt',
    'rating_meat',
    'rating_beet',
    'rating_density',
    'rating_aftertaste',
    'rating_serving',
    'overall_rating',
)


def compute_borsch_ratings(borsch):
    """
    What the stored ratings *should* be: the mean of every review, or zero when
    there are none. Returns a dict; writes nothing.

    Separated from the write so the backfill command can report drift without
    touching the database.
    """
    reviews = list(borsch.reviews.all())
    count = len(reviews)
    if not count:
        return {field: Decimal('0') for field in RATING_FIELDS}

    divisor = Decimal(count)
    return {
        field: sum((getattr(review, field) for review in reviews), Decimal('0')) / divisor
        for field in RATING_FIELDS
    }


def recalculate_borsch_ratings(borsch):
    """
    Bring the stored ratings in line with the reviews. Idempotent, and a no-op
    write when nothing changed, so the signals can call it freely.

    Returns True when something actually moved — the backfill command counts
    those, and it keeps a borsch's `updated_at` from churning on every save.
    """
    wanted = compute_borsch_ratings(borsch)
    changed = [
        field for field, value in wanted.items()
        # DecimalField(3, 1) rounds on save, so compare at the stored precision
        # rather than at full division precision, or every run looks dirty.
        if _quantize(value) != _quantize(getattr(borsch, field))
    ]
    if not changed:
        return False

    for field, value in wanted.items():
        setattr(borsch, field, _quantize(value))
    borsch.save(update_fields=list(wanted.keys()))
    return True


def _quantize(value):
    return Decimal(value or 0).quantize(Decimal('0.1'))
