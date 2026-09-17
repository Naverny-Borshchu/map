"""
Bring every borsch's stored ratings back in line with its reviews.

Needed once because the denormalised copy could drift for years: until the
Review signals existed, only the API refreshed it, so the 2023-24 catalogue
import and the admin left stale numbers behind. Five borsches were visibly
wrong in production, one of them showing 0.0 — i.e. "never rated" — for a dish
that had a real 4.0 review.

Safe to re-run: it only writes the borsches that are actually out of line.
"""

from django.core.management.base import BaseCommand

from core.models import Borsch
from core.ratings import RATING_FIELDS, compute_borsch_ratings, recalculate_borsch_ratings


class Command(BaseCommand):
    help = "Recalculate the denormalised Borsch ratings from their reviews."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Report the drift without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        drifted = 0
        checked = 0

        # chunk_size обовʼязковий для iterator() після prefetch_related() у Django 6
        # (у 4.2 був лише deprecation-warning). 2000 — дефолт, що Django раніше
        # підставляв сам; приймається і 4.2, і 6, тож фікс сумісний з обома.
        for borsch in Borsch.objects.all().prefetch_related('reviews').iterator(chunk_size=2000):
            checked += 1
            wanted = compute_borsch_ratings(borsch)
            before = {field: getattr(borsch, field) for field in RATING_FIELDS}

            differs = any(
                _q(wanted[field]) != _q(before[field]) for field in RATING_FIELDS
            )
            if not differs:
                continue

            drifted += 1
            self.stdout.write(
                f"{borsch.name[:45]!r} @ {borsch.place} "
                f"({borsch.reviews.count()} review(s)): "
                f"overall {_q(before['overall_rating'])} -> {_q(wanted['overall_rating'])}"
            )
            if not dry_run:
                recalculate_borsch_ratings(borsch)

        verb = "would fix" if dry_run else "fixed"
        self.stdout.write(self.style.SUCCESS(
            f"checked {checked} borsch(es), {verb} {drifted}"
        ))


def _q(value):
    from decimal import Decimal
    return Decimal(value or 0).quantize(Decimal('0.1'))
