"""
Тести для /api/favorites/.

Причина існування: додати борщ в обране з застосунку було неможливо. `user` у
FavoriteBorschSerializer був записуваним і обов'язковим, тож клієнт, який слав
{"borsch": "<uuid>"}, отримував 400 {"user": ["Це поле обов'язкове."]}. У
застосунку це виглядало як «обране працює лише локально».
"""

from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import PlaceType, Place, Borsch, FavoriteBorsch


class FavoritesApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="fav_user", password="pw12345!")
        cls.other = User.objects.create_user(username="fav_other", password="pw12345!")
        place_type = PlaceType.objects.create(code="CAFE", label="Кафе")
        place = Place.objects.create(
            name="Тестовий заклад",
            address="вул. Тестова, 1",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=place_type,
        )
        cls.borsch = Borsch.objects.create(
            place=place, name="Борщ тестовий", price_uah=Decimal("150.00"), weight_grams=400,
        )
        cls.other_borsch = Borsch.objects.create(
            place=place, name="Борщ другий", price_uah=Decimal("160.00"), weight_grams=350,
        )

    def test_client_sends_only_borsch_and_the_server_binds_the_user(self):
        """Клієнт не повинен (і не може) вирішувати, чиє це обране."""
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/favorites/", {"borsch": str(self.borsch.id)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        favorite = FavoriteBorsch.objects.get(borsch=self.borsch)
        self.assertEqual(favorite.user, self.user)

    def test_user_in_the_body_cannot_put_a_favorite_on_someone_else(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/favorites/",
            {"borsch": str(self.borsch.id), "user": self.other.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(FavoriteBorsch.objects.get(borsch=self.borsch).user, self.user)

    def test_liking_the_same_borsch_twice_is_a_400_not_a_500(self):
        """unique_together ('user','borsch') мусить давати зрозумілу помилку."""
        self.client.force_authenticate(self.user)
        first = self.client.post("/api/favorites/", {"borsch": str(self.borsch.id)}, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post("/api/favorites/", {"borsch": str(self.borsch.id)}, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST, second.data)

    def test_anonymous_cannot_add_a_favorite(self):
        response = self.client.post("/api/favorites/", {"borsch": str(self.borsch.id)}, format="json")
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        self.assertEqual(FavoriteBorsch.objects.count(), 0)

    def test_the_list_only_shows_your_own_favorites(self):
        FavoriteBorsch.objects.create(user=self.user, borsch=self.borsch)
        FavoriteBorsch.objects.create(user=self.other, borsch=self.other_borsch)
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/favorites/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual(len(results), 1)
        self.assertEqual(str(results[0]["borsch"]), str(self.borsch.id))
