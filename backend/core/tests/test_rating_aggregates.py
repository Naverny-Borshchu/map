"""
The denormalised Borsch ratings must follow the reviews on *every* path.

Before the Review signals existed only `ReviewViewSet` refreshed them, so the
2023-24 catalogue import and the Django admin left stale numbers behind for
years. In production that meant five borsches displaying a score that was not
the average of their reviews, including one showing 0.0 — indistinguishable
from "nobody has rated this" — for a dish with a real 4.0 review.
"""

from decimal import Decimal
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Borsch, Place, PlaceType, Review


def make_review(borsch, overall, **over):
    """A review whose every criterion is `overall` unless told otherwise."""
    scores = {field: Decimal(overall) for field in (
        'rating_salt', 'rating_meat', 'rating_beet',
        'rating_density', 'rating_aftertaste', 'rating_serving',
    )}
    scores.update(over)
    return Review.objects.create(
        borsch=borsch, message='', overall_rating=Decimal(overall), **scores
    )


class RatingAggregateBaseCase(TestCase):
    def setUp(self):
        self.place_type = PlaceType.objects.create(code='R', label='Ресторан')
        self.place = Place.objects.create(
            name='Тестовий заклад', address='вул. Тестова, 1',
            location_lat=Decimal('50.450100'), location_lng=Decimal('30.523400'),
            country='Україна', city='Київ', type=self.place_type,
        )
        self.borsch = Borsch.objects.create(
            place=self.place, name='Борщ', type_meat='beef',
            price_uah=Decimal('150.00'), weight_grams=400, photo_urls=[],
        )

    def overall(self, borsch=None):
        target = borsch or self.borsch
        target.refresh_from_db()
        return target.overall_rating


class ReviewSignalsTest(RatingAggregateBaseCase):
    def test_creating_a_review_outside_the_api_updates_the_stored_rating(self):
        """The admin and the import both write reviews this way."""
        make_review(self.borsch, '8.0')
        self.assertEqual(self.overall(), Decimal('8.0'))

    def test_second_review_averages_rather_than_overwrites(self):
        make_review(self.borsch, '10.0')
        make_review(self.borsch, '7.0')
        # this is the exact shape of the production drift: the stored value had
        # stayed at one of the two reviews instead of their mean
        self.assertEqual(self.overall(), Decimal('8.5'))

    def test_deleting_a_review_recalculates(self):
        keep = make_review(self.borsch, '10.0')
        drop = make_review(self.borsch, '4.0')
        self.assertEqual(self.overall(), Decimal('7.0'))

        drop.delete()

        self.assertEqual(self.overall(), Decimal('10.0'))
        self.assertTrue(Review.objects.filter(pk=keep.pk).exists())

    def test_deleting_the_last_review_resets_to_zero(self):
        review = make_review(self.borsch, '9.0')
        review.delete()
        self.assertEqual(self.overall(), Decimal('0.0'))

    def test_editing_a_review_recalculates(self):
        review = make_review(self.borsch, '4.0')
        review.overall_rating = Decimal('9.0')
        review.save()
        self.assertEqual(self.overall(), Decimal('9.0'))

    def test_moving_a_review_refreshes_both_borsches(self):
        other = Borsch.objects.create(
            place=self.place, name='Інший борщ', type_meat='pork',
            price_uah=Decimal('100.00'), weight_grams=300, photo_urls=[],
        )
        review = make_review(self.borsch, '8.0')
        self.assertEqual(self.overall(), Decimal('8.0'))

        review.borsch = other
        review.save()

        self.assertEqual(self.overall(), Decimal('0.0'))
        self.assertEqual(self.overall(other), Decimal('8.0'))

    def test_deleting_a_borsch_with_reviews_does_not_explode(self):
        """
        Reviews cascade, so post_delete fires for rows whose parent is already
        gone. Reading `instance.borsch` there would raise.
        """
        make_review(self.borsch, '8.0')
        borsch_id = self.borsch.id

        self.borsch.delete()

        self.assertFalse(Borsch.objects.filter(pk=borsch_id).exists())
        self.assertFalse(Review.objects.filter(borsch_id=borsch_id).exists())

    def test_all_six_criteria_follow_too_not_just_the_overall(self):
        make_review(self.borsch, '6.0', rating_salt=Decimal('10.0'))
        make_review(self.borsch, '8.0', rating_salt=Decimal('8.0'))
        self.borsch.refresh_from_db()
        self.assertEqual(self.borsch.rating_salt, Decimal('9.0'))
        self.assertEqual(self.borsch.rating_meat, Decimal('7.0'))
        self.assertEqual(self.borsch.overall_rating, Decimal('7.0'))


class RecalculateCommandTest(RatingAggregateBaseCase):
    def _force_drift(self, value='0.0'):
        """Write a wrong stored value the way the old import left one behind."""
        Borsch.objects.filter(pk=self.borsch.pk).update(overall_rating=Decimal(value))

    def test_dry_run_reports_but_does_not_write(self):
        make_review(self.borsch, '4.0')
        self._force_drift()

        out = StringIO()
        call_command('recalculate_borsch_ratings', '--dry-run', stdout=out)

        self.assertIn('would fix 1', out.getvalue())
        self.assertEqual(self.overall(), Decimal('0.0'))

    def test_it_repairs_a_drifted_borsch(self):
        make_review(self.borsch, '4.0')
        self._force_drift()

        out = StringIO()
        call_command('recalculate_borsch_ratings', stdout=out)

        self.assertIn('fixed 1', out.getvalue())
        self.assertEqual(self.overall(), Decimal('4.0'))

    def test_a_clean_database_reports_nothing_to_do(self):
        make_review(self.borsch, '7.0')
        out = StringIO()
        call_command('recalculate_borsch_ratings', stdout=out)
        self.assertIn('fixed 0', out.getvalue())


class ApiPathStillUpdatesRatingsTest(APITestCase):
    """
    The viewset's own call is now a thin wrapper. If signal registration ever
    breaks, or someone removes that wrapper believing the signals cover it,
    this is what notices.
    """

    def setUp(self):
        self.place_type = PlaceType.objects.create(code='R', label='Ресторан')
        self.place = Place.objects.create(
            name='Заклад', address='вул. Тестова, 1',
            location_lat=Decimal('50.450100'), location_lng=Decimal('30.523400'),
            country='Україна', city='Київ', type=self.place_type,
        )
        self.borsch = Borsch.objects.create(
            place=self.place, name='Борщ', type_meat='beef',
            price_uah=Decimal('150.00'), weight_grams=400, photo_urls=[],
        )
        self.user = User.objects.create_user(username='rater', password='pass12345')
        self.client.force_authenticate(user=self.user)

    def test_posting_a_review_updates_the_stored_rating(self):
        response = self.client.post('/api/reviews/', {
            'borsch': str(self.borsch.id),
            'rating_salt': 9, 'rating_meat': 9, 'rating_beet': 9,
            'rating_density': 9, 'rating_aftertaste': 9, 'rating_serving': 9,
            'overall_rating': 9, 'message': '',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.borsch.refresh_from_db()
        self.assertEqual(self.borsch.overall_rating, Decimal('9.0'))
