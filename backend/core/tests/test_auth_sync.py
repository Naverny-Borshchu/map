"""Integration regressions for account-bound engagement and cross-device sync."""

from decimal import Decimal

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from core.models import Borsch, FavoriteBorsch, Place, PlaceType, Review


class AuthenticatedEngagementSyncTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        place_type = PlaceType.objects.create(code="SYNC_CAFE", label="Кафе")
        place = Place.objects.create(
            name="Sync кафе",
            address="вул. Тестова, 12",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=place_type,
        )
        cls.borsch = Borsch.objects.create(
            place=place,
            name="Sync борщ",
            type_meat="beef",
            price_uah=Decimal("150.00"),
            weight_grams=400,
            photo_urls=[],
        )
        cls.user = User.objects.create_user(username="sync-user", password="test")
        cls.other_user = User.objects.create_user(username="other-user", password="test")

    def review_payload(self, overall=8):
        return {
            "borsch": str(self.borsch.id),
            "message": "Смачно",
            "rating_salt": overall,
            "rating_meat": overall,
            "rating_beet": overall,
            "rating_density": overall,
            "rating_aftertaste": overall,
            "rating_serving": overall,
            "overall_rating": overall,
        }

    def authenticated_client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_guest_mutations_and_favorite_state_are_blocked(self):
        favorite_list = self.client.get(reverse("favorite-list"))
        favorite_create = self.client.post(
            reverse("favorite-list"), {"borsch": str(self.borsch.id)}, format="json"
        )
        review_create = self.client.post(
            reverse("review-list"),
            self.review_payload(),
            format="json",
            HTTP_X_DEVICE_ID="device-guest-regression",
        )

        self.assertEqual(favorite_list.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(favorite_create.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(review_create.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(FavoriteBorsch.objects.exists())
        self.assertFalse(Review.objects.exists())

    def test_favorite_created_on_one_device_reloads_on_another(self):
        device_a = self.authenticated_client(self.user)
        device_b = self.authenticated_client(self.user)

        created = device_a.post(
            reverse("favorite-list"), {"borsch": str(self.borsch.id)}, format="json"
        )
        reloaded = device_b.get(reverse("favorite-list"))

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(reloaded.status_code, status.HTTP_200_OK)
        self.assertEqual(reloaded.data["count"], 1)
        self.assertEqual(str(reloaded.data["results"][0]["borsch"]), str(self.borsch.id))
        self.assertEqual(reloaded.data["results"][0]["user"], self.user.id)

    def test_favorites_do_not_leak_between_accounts(self):
        owner_device = self.authenticated_client(self.user)
        other_device = self.authenticated_client(self.other_user)
        owner_device.post(
            reverse("favorite-list"), {"borsch": str(self.borsch.id)}, format="json"
        )

        other_reload = other_device.get(reverse("favorite-list"))

        self.assertEqual(other_reload.status_code, status.HTTP_200_OK)
        self.assertEqual(other_reload.data["count"], 0)

    def test_review_mutation_is_account_bound_and_public_aggregate_reloads(self):
        writer_device = self.authenticated_client(self.user)
        second_device = APIClient()

        created = writer_device.post(
            reverse("review-list"), self.review_payload(overall=8), format="json"
        )
        reviews_reload = second_device.get(
            reverse("review-list"), {"borsch_id": str(self.borsch.id)}
        )
        borsch_reload = second_device.get(reverse("borsch-detail", args=[self.borsch.id]))

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        review = Review.objects.get()
        self.assertEqual(review.user, self.user)
        self.assertEqual(reviews_reload.status_code, status.HTTP_200_OK)
        self.assertEqual(reviews_reload.data["count"], 1)
        self.assertEqual(reviews_reload.data["results"][0]["author_username"], "sync-user")
        self.assertEqual(borsch_reload.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(borsch_reload.data["overall_rating"]), Decimal("8.0"))
        self.assertEqual(borsch_reload.data["rating_count"], 1)
