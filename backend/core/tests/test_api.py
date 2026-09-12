"""
API тести для основних endpoint-ів Core.

Покриття:
- POST (створення об'єкта)
- GET list + pagination
- GET detail by id
- PUT/PATCH (оновлення)
- DELETE (видалення)
- upload_photo (multipart upload)
"""

import shutil
import tempfile
from decimal import Decimal

from django.conf import settings
from django.urls import reverse
from django.test import override_settings
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile

from core.models import PlaceType, Place, Borsch, Review, FavoriteBorsch


class TestCoreAPI(APITestCase):
    """Набір інтеграційних тестів для API."""

    @classmethod
    def setUpTestData(cls):
        # Фікстура: тип закладу
        cls.place_type = PlaceType.objects.create(
            code="RESTAURANT",
            label="Ресторан",
        )

        # Фікстура: базовий заклад
        cls.place = Place.objects.create(
            name="Пузата Хата",
            address="Хрещатик, 25",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=cls.place_type,
        )

        # Фікстура: базовий борщ для upload_photo
        cls.borsch = Borsch.objects.create(
            place=cls.place,
            name="Борщ Київський",
            type_meat="beef",
            price_uah=Decimal("150.00"),
            weight_grams=400,
            photo_urls=[],
        )

    def setUp(self):
        # Фікстура: авторизований користувач для модифікуючих запитів
        self.user = User.objects.create_user(
            username="test_user",
            email="test@example.com",
            password="StrongPassword123!",
        )

        # Тимчасова директорія для upload_photo тестів
        self._media_dir = tempfile.mkdtemp(prefix="test_media_")
        self._media_override = override_settings(MEDIA_ROOT=self._media_dir, MEDIA_URL="/media/")
        self._media_override.enable()

    def tearDown(self):
        self._media_override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def _place_payload(self, **overrides):
        """Фікстура payload для створення/оновлення Place."""
        payload = {
            "name": "Тестовий заклад",
            "address": "вул. Тестова, 1",
            "location_lat": "49.839700",
            "location_lng": "24.029700",
            "country": "Україна",
            "city": "Львів",
            "type": self.place_type.id,
        }
        payload.update(overrides)
        return payload

    def _auth(self):
        """Авторизація тестового користувача в APIClient."""
        self.client.force_authenticate(user=self.user)

    def test_create_place_post(self):
        """POST /api/places/ - створення об'єкта."""
        self._auth()
        url = reverse("place-list")
        payload = self._place_payload()

        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Place.objects.count(), 2)
        created = Place.objects.get(name="Тестовий заклад")
        self.assertEqual(created.city, "Львів")
        self.assertEqual(response.data["id"], str(created.id))

    def test_create_borsch_post(self):
        """
        POST /api/borsches/ - створення об'єкта.

        NAV-152 стосувався тільки PlaceCreateSerializer; BorschCreateSerializer
        мав ту саму ваду (без 'id' у fields), через що фронтовий mapBorsch()
        перетворював відсутнє поле на рядок "undefined", і наступний
        POST /api/reviews/ падав з "borsch: \"undefined\" не є валідним UUID."
        """
        self._auth()
        url = reverse("borsch-list")
        payload = {
            "place": str(self.place.id),
            "name": "Новий борщ",
            "type_meat": "beef",
            "price_uah": "175.00",
            "weight_grams": 350,
        }

        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Borsch.objects.get(name="Новий борщ")
        self.assertIn("id", response.data)
        self.assertEqual(response.data["id"], str(created.id))
        self.assertNotEqual(response.data["id"], "undefined")

    def test_get_places_list_with_pagination(self):
        """GET /api/places/ - список з пагінацією."""
        for idx in range(1, 5):
            Place.objects.create(
                name=f"Заклад {idx}",
                address=f"Адреса {idx}",
                location_lat=Decimal("50.450100"),
                location_lng=Decimal("30.523400"),
                country="Україна",
                city="Київ",
                type=self.place_type,
            )

        url = reverse("place-list")
        response = self.client.get(url, {"page": 1, "page_size": 2}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertIn("count", response.data)
        self.assertIn("total_pages", response.data)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 2)
        self.assertEqual(len(response.data["results"]), 2)

    def test_filter_places_by_city_matches_exact_city_only(self):
        """GET /api/places/?city=Київ excludes similarly named locations."""
        Place.objects.create(
            name="Заклад у Київській області",
            address="вул. Тестова, 1",
            location_lat=Decimal("50.500000"),
            location_lng=Decimal("30.500000"),
            country="Україна",
            city="Київська обл.",
            type=self.place_type,
        )

        response = self.client.get(reverse("place-list"), {"city": "Київ"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["city"], "Київ")

    def test_get_place_detail_by_id(self):
        """GET /api/places/{id}/ - отримання одного об'єкта."""
        url = reverse("place-detail", kwargs={"pk": self.place.id})
        response = self.client.get(url, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(self.place.id))
        self.assertEqual(response.data["name"], self.place.name)

    def test_update_place_with_patch(self):
        """PATCH /api/places/{id}/ - часткове оновлення."""
        self._auth()
        url = reverse("place-detail", kwargs={"pk": self.place.id})
        payload = {"city": "Одеса", "name": "Оновлена назва"}

        response = self.client.patch(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.place.refresh_from_db()
        self.assertEqual(self.place.city, "Одеса")
        self.assertEqual(self.place.name, "Оновлена назва")

    def test_update_place_with_put(self):
        """PUT /api/places/{id}/ - повне оновлення."""
        self._auth()
        url = reverse("place-detail", kwargs={"pk": self.place.id})
        payload = self._place_payload(
            name="PUT заклад",
            address="вул. Нова, 99",
            city="Дніпро",
        )

        response = self.client.put(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.place.refresh_from_db()
        self.assertEqual(self.place.name, "PUT заклад")
        self.assertEqual(self.place.address, "вул. Нова, 99")
        self.assertEqual(self.place.city, "Дніпро")

    def test_delete_place(self):
        """DELETE /api/places/{id}/ - видалення об'єкта."""
        self._auth()
        place_to_delete = Place.objects.create(
            name="На видалення",
            address="вул. Тимчасова, 2",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=self.place_type,
        )
        url = reverse("place-detail", kwargs={"pk": place_to_delete.id})

        response = self.client.delete(url, format="json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Place.objects.filter(id=place_to_delete.id).exists())

    def test_upload_photo_endpoint(self):
        """POST /api/borsches/{id}/upload_photo/ - завантаження фото."""
        self._auth()
        url = f"/api/borsches/{self.borsch.id}/upload_photo/"
        photo = SimpleUploadedFile(
            "borsch.jpg",
            b"fake-image-content",
            content_type="image/jpeg",
        )

        response = self.client.post(url, {"photo": photo}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("photo_url", response.data)
        self.assertIn("/media/", response.data["photo_url"])
        self.assertIn("borsches", response.data["photo_url"])
        self.borsch.refresh_from_db()
        self.assertEqual(len(self.borsch.photo_urls), 1)

    def test_filter_places_by_type_label(self):
        """GET /api/places/?type=Бістро - фільтр по назві типу."""
        bistro_type = PlaceType.objects.create(code="BISTRO", label="Бістро")
        pub_type = PlaceType.objects.create(code="PUB", label="Паб")

        Place.objects.create(
            name="Бістро 1",
            address="Адреса 1",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=bistro_type,
        )

        Place.objects.create(
            name="Бістро 2",
            address="Адреса 2",
            location_lat=Decimal("49.839700"),
            location_lng=Decimal("24.029700"),
            country="Україна",
            city="Львів",
            type=bistro_type,
        )

        Place.objects.create(
            name="Паб 1",
            address="Адреса 3",
            location_lat=Decimal("46.482500"),
            location_lng=Decimal("30.723300"),
            country="Україна",
            city="Одеса",
            type=pub_type,
        )

        url = reverse("place-list")
        response = self.client.get(url, {"type": "Бістро"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)


    def test_filter_places_by_type_array(self):
        """GET /api/places/?type=['Бістро','Паб'] - фільтр по масиву назв типів."""
        bistro_type = PlaceType.objects.create(code="BISTRO", label="Бістро")
        pub_type = PlaceType.objects.create(code="PUB", label="Паб")

        Place.objects.create(
            name="Бістро 1",
            address="Адреса 1",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=bistro_type,
        )

        Place.objects.create(
            name="Бістро 2",
            address="Адреса 2",
            location_lat=Decimal("49.839700"),
            location_lng=Decimal("24.029700"),
            country="Україна",
            city="Львів",
            type=bistro_type,
        )

        Place.objects.create(
            name="Паб 1",
            address="Адреса 3",
            location_lat=Decimal("46.482500"),
            location_lng=Decimal("30.723300"),
            country="Україна",
            city="Одеса",
            type=pub_type,
        )

        url = reverse("place-list")
        response = self.client.get(
            url,
            {"type": "['Бістро','Паб']"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 3)


class TestAuthenticatedReviews(APITestCase):
    """Створення оцінок доступне лише авторизованим користувачам."""

    @classmethod
    def setUpTestData(cls):
        place_type = PlaceType.objects.create(code="CAFE_REVIEWS", label="Кафе")
        place = Place.objects.create(
            name="Тестове кафе",
            address="вул. Тестова, 10",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=place_type,
        )
        cls.borsch = Borsch.objects.create(
            place=place,
            name="Борщ для оцінки",
            type_meat="beef",
            price_uah=Decimal("120.00"),
            weight_grams=350,
            photo_urls=[],
        )

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.user = User.objects.create_user(
            username="reviewer",
            email="reviewer@example.com",
            password="test-pass",
        )

    def _payload(self):
        return {
            "borsch": str(self.borsch.id),
            "message": "Смачний борщ",
            "rating_salt": 8,
            "rating_meat": 8,
            "rating_beet": 9,
            "rating_density": 7,
            "rating_aftertaste": 9,
            "rating_serving": 8,
            "overall_rating": 8,
        }

    def test_anonymous_review_is_rejected(self):
        response = self.client.post(
            reverse("review-list"), self._payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Review.objects.exists())

    def test_authenticated_review_is_owned_by_request_user(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("review-list"), self._payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        review = Review.objects.get()
        self.assertEqual(review.user, self.user)
        self.assertEqual(review.temp_user_id, "")

    def test_create_recalculates_public_borsch_aggregate(self):
        Review.objects.create(
            borsch=self.borsch,
            user=self.user,
            message="Перша оцінка",
            rating_salt=Decimal("4"),
            rating_meat=Decimal("4"),
            rating_beet=Decimal("4"),
            rating_density=Decimal("4"),
            rating_aftertaste=Decimal("4"),
            rating_serving=Decimal("4"),
            overall_rating=Decimal("4"),
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("review-list"), self._payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=None)
        borsch_response = self.client.get(
            reverse("borsch-detail", args=[self.borsch.id])
        )
        self.assertEqual(borsch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(borsch_response.data["overall_rating"]), Decimal("6.0"))
        self.assertEqual(borsch_response.data["rating_count"], 2)


class TestAuthenticatedEngagement(APITestCase):
    """Favorites and review writes belong to the authenticated account."""

    @classmethod
    def setUpTestData(cls):
        place_type = PlaceType.objects.create(code="AUTH_CAFE", label="Кафе")
        place = Place.objects.create(
            name="Auth кафе",
            address="вул. Тестова, 11",
            location_lat=Decimal("50.450100"),
            location_lng=Decimal("30.523400"),
            country="Україна",
            city="Київ",
            type=place_type,
        )
        cls.borsch = Borsch.objects.create(
            place=place,
            name="Auth борщ",
            type_meat="beef",
            price_uah=Decimal("140.00"),
            weight_grams=400,
            photo_urls=[],
        )
        cls.user = User.objects.create_user(username="account-a", password="test")
        cls.other_user = User.objects.create_user(username="account-b", password="test")

    def _review_payload(self):
        return {
            "borsch": str(self.borsch.id),
            "message": "Смачно",
            "rating_salt": 8,
            "rating_meat": 8,
            "rating_beet": 9,
            "rating_density": 7,
            "rating_aftertaste": 9,
            "rating_serving": 8,
            "overall_rating": 8,
        }

    def test_guest_cannot_create_review(self):
        response = self.client.post(reverse("review-list"), self._review_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(Review.objects.count(), 0)

    def test_authenticated_review_updates_public_aggregate(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("review-list"), self._review_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        review = Review.objects.get()
        self.assertEqual(review.user, self.user)
        self.borsch.refresh_from_db()
        self.assertEqual(self.borsch.overall_rating, Decimal("8.0"))

    def test_mine_filter_returns_only_current_users_reviews(self):
        review_fields = self._review_payload()
        review_fields["borsch"] = self.borsch
        Review.objects.create(user=self.user, **review_fields)
        Review.objects.create(user=self.other_user, **review_fields)
        self.client.force_authenticate(user=self.user)

        response = self.client.get(reverse("review-list"), {"mine": "true"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["author_username"], "account-a")

    def test_user_cannot_update_another_users_review(self):
        review_fields = self._review_payload()
        review_fields["borsch"] = self.borsch
        review = Review.objects.create(user=self.other_user, **review_fields)
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            reverse("review-detail", kwargs={"pk": review.id}),
            {"message": "Чужа зміна"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        review.refresh_from_db()
        self.assertEqual(review.message, "Смачно")

    def test_guest_cannot_list_or_create_favorites(self):
        list_response = self.client.get(reverse("favorite-list"))
        create_response = self.client.post(
            reverse("favorite-list"), {"borsch": str(self.borsch.id)}, format="json"
        )
        self.assertEqual(list_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(create_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_favorites_are_scoped_to_account_and_user_is_server_owned(self):
        FavoriteBorsch.objects.create(user=self.other_user, borsch=self.borsch)
        self.client.force_authenticate(user=self.user)

        created = self.client.post(
            reverse("favorite-list"), {"borsch": str(self.borsch.id)}, format="json"
        )
        listed = self.client.get(reverse("favorite-list"))

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["user"], self.user.id)


class TestRateLimitFanout(APITestCase):
    """
    Регресія на 429 у публічній мапі (2026-07-16).

    Причина інциденту: фронтенд вантажив весь датасет посторінково по 20
    записів (`fetchAllPages` без `page_size`), що давало ~17 запитів на одне
    завантаження карти й перевищувало анонімний ліміт 30/min → 429 та фолбек
    на локальні дані.

    Фікс складається з двох частин:
    - фронтенд просить `page_size=100` (макс. дозволений), щоб зібрати повний
      список за мінімум запитів;
    - анонімний throttle піднято, щоб мати запас на нормальний перегляд.
    """

    @classmethod
    def setUpTestData(cls):
        cls.place_type = PlaceType.objects.create(code="CAFE", label="Кафе")
        # 45 закладів: більше за дефолтний page_size=20, менше за max=100.
        for idx in range(45):
            Place.objects.create(
                name=f"Заклад {idx:02d}",
                address=f"вул. Тестова, {idx}",
                location_lat=Decimal("50.450100"),
                location_lng=Decimal("30.523400"),
                country="Україна",
                city="Київ",
                type=cls.place_type,
            )

    def setUp(self):
        # Throttle зберігає лічильники в кеші й ключується по IP; чистимо, щоб
        # тест був детермінованим і не залежав від інших тестів у прогоні.
        from django.core.cache import cache
        cache.clear()

    def test_page_size_100_collapses_full_listing_into_one_request(self):
        """
        З page_size=100 весь список закладів приходить одним запитом
        (next=None), тож фронтенд не робить зайвих round-trip-ів.
        """
        url = reverse("place-list")
        response = self.client.get(url, {"page_size": 100}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 45)
        self.assertEqual(len(response.data["results"]), 45)
        self.assertIsNone(response.data["next"])

    def test_default_page_size_would_fan_out(self):
        """
        Контроль: без page_size дефолт=20 і список не влазить в одну сторінку
        (саме це й спричиняло лавину запитів до фіксу).
        """
        url = reverse("place-list")
        response = self.client.get(url, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])

    def test_anon_throttle_rate_has_headroom_for_map_load(self):
        """
        Анонімний ліміт мусить бути помітно вищим за 30/min, інакше нормальне
        завантаження + перегляд карти знову впреться в 429.
        """
        from rest_framework.throttling import AnonRateThrottle

        rate = AnonRateThrottle().parse_rate(
            settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["anon"]
        )
        num_requests, duration_seconds = rate
        # Нормалізуємо до запитів на хвилину.
        per_minute = num_requests * (60 / duration_seconds)
        self.assertGreaterEqual(
            per_minute,
            60,
            "Анонімний throttle надто низький — ризик повторного 429 на мапі",
        )

    def test_anon_burst_below_limit_is_not_throttled(self):
        """
        Поведінковий тест: серія з 40 анонімних GET (більше за старий ліміт 30)
        проходить без 429 завдяки піднятому throttle.
        """
        url = reverse("place-list")
        for _ in range(40):
            response = self.client.get(url, {"page_size": 100}, format="json")
            self.assertNotEqual(
                response.status_code,
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Анонімний запит зашортлено раніше очікуваного ліміту",
            )



class BorschCreateThenReviewE2ETest(APITestCase):
    """
    NAV-152 follow-up: BorschCreateSerializer omitted 'id' the same way
    PlaceCreateSerializer did, so the frontend's mapBorsch() turned the
    missing field into the literal string "undefined", and the subsequent
    POST /api/reviews/ was rejected with "borsch: \"undefined\" не є
    валідним UUID." This test drives the exact place -> borsch -> review
    sequence the frontend performs and asserts every step gets a real id.
    """

    def setUp(self):
        self.place_type = PlaceType.objects.create(code="E2E", label="E2E")
        self.user = User.objects.create_user(username="e2e_user", password="pass12345")
        self.client.force_authenticate(user=self.user)

    def test_create_place_then_borsch_then_review_end_to_end(self):
        place_resp = self.client.post("/api/places/", {
            "name": "E2E place",
            "address": "vul. Test 1",
            "location_lat": "50.45",
            "location_lng": "30.52",
            "country": "Україна",
            "city": "Київ",
            "type": self.place_type.id,
        }, format="json")
        self.assertEqual(place_resp.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', place_resp.data)
        place_id = place_resp.data['id']

        borsch_resp = self.client.post("/api/borsches/", {
            "place": str(place_id),
            "name": "E2E borsch",
            "type_meat": "beef",
            "price_uah": "150.00",
            "weight_grams": 350,
        }, format="json")
        self.assertEqual(borsch_resp.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', borsch_resp.data, "BorschCreateSerializer still omits 'id'")
        borsch_id = borsch_resp.data['id']
        self.assertNotEqual(str(borsch_id), "undefined")

        # Mirrors frontend EvaluationsPage.handleSubmitForm -> commentsAPI.createByBorschId
        review_resp = self.client.post("/api/reviews/", {
            "borsch": str(borsch_id),
            "rating_salt": 5, "rating_meat": 5, "rating_beet": 5,
            "rating_density": 5, "rating_aftertaste": 5, "rating_serving": 5,
            "overall_rating": 5, "message": "",
        }, format="json")
        self.assertEqual(
            review_resp.status_code, status.HTTP_201_CREATED,
            f"review create failed: {getattr(review_resp, 'data', review_resp.content)}"
        )
