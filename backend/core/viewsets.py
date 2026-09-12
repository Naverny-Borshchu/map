"""
ViewSets Django REST Framework для моделей додатку Core.

Цей файл містить ViewSets для обробки HTTP-запитів:
- list: отримати список об'єктів
- retrieve: отримати один об'єкт по ID
- create: створити новий об'єкт
- update: оновити об'єкт
- destroy: видалити об'єкт

Для борщів додано extra action для завантаження фото.
"""

import os
import uuid
from django.conf import settings
from rest_framework import viewsets, status, decorators, parsers, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models
from django.db.models import Avg, Count

from .models import PlaceType, Place, Borsch, UserProfile, Review, FavoriteBorsch
from .ratings import recalculate_borsch_ratings
from .serializers import (
    PlaceTypeSerializer,
    PlaceSerializer, PlaceCreateSerializer, PlaceUpdateSerializer,
    BorschSerializer, BorschCreateSerializer, BorschUpdateSerializer,
    UserProfileSerializer, UserProfileUpdateSerializer,
    ReviewSerializer, ReviewCreateSerializer, ReviewUpdateSerializer,
    FavoriteBorschSerializer,
    UserSerializer
)
from .permissions import IsAuthenticatedOrReadOnlyUA, IsOwnerOrReadOnly
from .pagination import CustomPageNumberPagination
from .throttles import ReviewCreateIPThrottle, ReviewCreateDeviceThrottle
from django.contrib.auth.models import User


# =============================================================================
# PlaceType ViewSet
# =============================================================================

class PlaceTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet для типів закладів.
    
    Тільки читання (список та детальна інформація).
    Створення/оновлення типів відбувається через адмін-панель.
    """
    queryset = PlaceType.objects.all()
    serializer_class = PlaceTypeSerializer
    permission_classes = [IsAuthenticatedOrReadOnlyUA]
    pagination_class = CustomPageNumberPagination
    
    def get_queryset(self):
        """Отримати список типів, відсортований за назвою."""
        return PlaceType.objects.all().order_by('label')


# =============================================================================
# Place ViewSet
# =============================================================================

class PlaceViewSet(viewsets.ModelViewSet):
    """
    ViewSet для закладів.
    
    Підтримує CRUD операції:
    - GET /api/places/ - список всіх закладів
    - GET /api/places/{id}/ - детальна інформація
    - POST /api/places/ - створити заклад (потрібна авторизація)
    - PATCH /api/places/{id}/ - оновити заклад (потрібна авторизація)
    - DELETE /api/places/{id}/ - видалити заклад (потрібна авторизація)
    
    Фільтри:
    - search - пошук по назві та адресі
    - city - фільтр по місту
    - type - фільтр по типу закладу
    """
    queryset = Place.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnlyUA]
    pagination_class = CustomPageNumberPagination
    
    def get_serializer_class(self):
        """Вибір серіалізатора залежно від дії."""
        if self.action == 'create':
            return PlaceCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return PlaceUpdateSerializer
        return PlaceSerializer
    
    def get_queryset(self):
        """
        Отримати список закладів з фільтрацією.
        
        Параметри запиту:
        - search: пошук по назві або адресі
        - city: фільтр по місту
        - type: фільтр по типу закладу (код або назва типу)
        """
        queryset = Place.objects.all().order_by('name')
        
        # Пошук по назві та адресі
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(address__icontains=search)
            )
        
        # Фільтр по місту
        city = self.request.query_params.get('city', None)
        if city:
            # A selected city is an exact facet, not a text search. Using
            # ``icontains`` made ``city=Київ`` include ``Київська обл.``.
            queryset = queryset.filter(city__iexact=city.strip())
        
        # Фільтр по типу закладу (підтримка кодів, назв та масивів)
        place_type = self.request.query_params.get('type', None)
        if place_type:
            # Підтримка масивів та рядків
            if place_type.startswith('[') and place_type.endswith(']'):
                place_types = [ptype.strip().strip("'") for ptype in place_type[1:-1].split(',')]
            else:
                place_types = [ptype.strip() for ptype in place_type.split(',')]

            # Фільтрація по коду або назві типу
            queryset = queryset.filter(
                models.Q(type__code__in=place_types) |
                models.Q(type__label__in=place_types)
            )
        
        return queryset

    @action(detail=False, methods=['get'], url_path='cities')
    def cities(self, request):
        """
        Повертає список міст, в яких є хоча б один борщ,
        з координатами центру міста (середнє арифметичне lat/lng закладів).
        """
        cities_qs = (
            Place.objects.filter(borsches__isnull=False)
            .values('city')
            .annotate(
                lat=Avg('location_lat'),
                lng=Avg('location_lng'),
                borsch_count=Count('borsches', distinct=True),
            )
            .order_by('city')
        )
        data = [
            {
                'city': row['city'],
                'lat': float(row['lat']),
                'lng': float(row['lng']),
                'borsch_count': row['borsch_count'],
            }
            for row in cities_qs
            if row['city']
        ]
        return Response(data)


# =============================================================================
# Borsch ViewSet
# =============================================================================

class BorschViewSet(viewsets.ModelViewSet):
    """
    ViewSet для борщів.
    
    Підтримує CRUD операції:
    - GET /api/borsches/ - список всіх борщів
    - GET /api/borsches/{id}/ - детальна інформація
    - POST /api/borsches/ - створити борщ (потрібна авторизація)
    - PATCH /api/borsches/{id}/ - оновити борщ (потрібна авторизація)
    - DELETE /api/borsches/{id}/ - видалити борщ (потрібна авторизація)
    
    Фільтри:
    - place_id - фільтр по закладу
    - type_meat - фільтр по типу м'яса
    - min_price, max_price - фільтр по ціні
    
    Extra actions:
    - POST /api/borsches/{id}/upload_photo/ - завантажити фото борщу
    """
    queryset = Borsch.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnlyUA]
    pagination_class = CustomPageNumberPagination
    
    def get_serializer_class(self):
        """Вибір серіалізатора залежно від дії."""
        if self.action == 'create':
            return BorschCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return BorschUpdateSerializer
        return BorschSerializer
    
    def get_queryset(self):
        """
        Отримати список борщів з фільтрацією.
        
        Параметри запиту:
        - place_id: фільтр по закладу
        - type_meat: фільтр по типу м'яса
        - min_price, max_price: діапазон цін
        """
        queryset = Borsch.objects.all().order_by('-overall_rating', 'name')
        
        # Фільтр по закладу (підтримка кількох значень через кому)
        place_id = self.request.query_params.get('place_id', None)
        if place_id:
            place_ids = [pid.strip() for pid in place_id.split(',')]
            queryset = queryset.filter(place_id__in=place_ids)
        
        # Фільтр по типу м'яса (підтримка кількох значень через кому)
        meat_type = self.request.query_params.get('type_meat', None)
        if meat_type:
            meat_types = [mt.strip() for mt in meat_type.split(',')]
            queryset = queryset.filter(type_meat__in=meat_types)
        
        # Фільтр по ціні
        min_price = self.request.query_params.get('min_price', None)
        max_price = self.request.query_params.get('max_price', None)
        if min_price:
            queryset = queryset.filter(price_uah__gte=min_price)
        if max_price:
            queryset = queryset.filter(price_uah__lte=max_price)
        
        return queryset
    
    @decorators.action(
        detail=True,
        methods=['post'],
        parser_classes=[parsers.MultiPartParser],
        url_path='upload_photo'
    )
    def upload_photo(self, request, pk=None):
        """
        Завантажити фото для борщу.
        
        Приймає multipart/form-data з полем 'photo'.
        Зберігає файл у медіа-директорію та повертає URL.
        """
        borsch = self.get_object()
        
        if 'photo' not in request.FILES:
            return Response(
                {'error': 'Файл не знайдено. Використовуйте поле "photo".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        photo_file = request.FILES['photo']
        
        # Генерація унікального імені файлу
        file_extension = os.path.splitext(photo_file.name)[1]
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        
        # Шлях для збереження (URL завжди з прямими слешами; шлях на диску — окремо)
        rel = ('borsches', str(borsch.id), 'photos')
        upload_path = '/'.join(rel)
        full_path = os.path.join(settings.MEDIA_ROOT, *rel)
        
        # Створення директорії якщо не існує
        os.makedirs(full_path, exist_ok=True)
        
        # Збереження файлу
        file_path = os.path.join(full_path, unique_filename)
        with open(file_path, 'wb+') as destination:
            for chunk in photo_file.chunks():
                destination.write(chunk)
        
        # Додавання URL до списку photo_urls
        photo_url = f"{settings.MEDIA_URL}{upload_path}/{unique_filename}"
        
        # Оновлення списку фото
        photo_urls = borsch.photo_urls or []
        photo_urls.append(photo_url)
        borsch.photo_urls = photo_urls
        borsch.save()
        
        return Response(
            {'photo_url': photo_url, 'message': 'Фото успішно завантажено'},
            status=status.HTTP_201_CREATED
        )


# =============================================================================
# UserProfile ViewSet
# =============================================================================

class UserProfileViewSet(viewsets.ModelViewSet):
    """
    ViewSet для профілів користувачів.
    
    GET /api/profile/me/ - отримати профіль поточного користувача
    PATCH /api/profile/me/ - оновити профіль поточного користувача
    """
    queryset = UserProfile.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnlyUA]
    
    def get_serializer_class(self):
        """Вибір серіалізатора залежно від дії."""
        if self.action in ['update', 'partial_update']:
            return UserProfileUpdateSerializer
        return UserProfileSerializer
    
    @decorators.action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        """
        Отримати або оновити профіль поточного користувача.
        
        Для анонімних користувачів повертає 401.
        """
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Потрібна авторизація'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Отримання або створення профілю
        profile, created = UserProfile.objects.get_or_create(
            user=request.user,
            defaults={
                'given_name': request.user.first_name or request.user.username,
                'surname': request.user.last_name,
            }
        )
        
        if request.method == 'GET':
            serializer = self.get_serializer(profile)
            return Response(serializer.data)
        
        elif request.method == 'PATCH':
            serializer = self.get_serializer(profile, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )


# =============================================================================
# Review ViewSet
# =============================================================================

class ReviewViewSet(viewsets.ModelViewSet):
    """
    ViewSet для відгуків.
    
    Підтримує CRUD операції:
    - GET /api/borsches/{borsch_id}/reviews/ - список відгуків для борщу
    - GET /api/reviews/{id}/ - детальна інформація
    - POST /api/reviews/ - створити відгук (потрібна авторизація)
    - PATCH /api/reviews/{id}/ - оновити відгук (потрібна авторизація)
    - DELETE /api/reviews/{id}/ - видалити відгук (потрібна авторизація)
    
    Після створення/оновлення/видалення відгуку автоматично
    перераховуються агреговані рейтинги борщу.
    """
    queryset = Review.objects.all()
    permission_classes = [IsOwnerOrReadOnly]
    pagination_class = CustomPageNumberPagination

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == 'create':
            throttles.extend([
                ReviewCreateIPThrottle(),
                ReviewCreateDeviceThrottle(),
            ])
        return throttles

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.IsAuthenticated()]
        return super().get_permissions()
    
    def get_serializer_class(self):
        """Вибір серіалізатора залежно від дії."""
        if self.action == 'create':
            return ReviewCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return ReviewUpdateSerializer
        return ReviewSerializer
    
    def get_queryset(self):
        """
        Отримати список відгуків з фільтрацією по борщу.
        
        Параметр запиту:
        - borsch_id: фільтр по борщу (обов'язковий для list)
        """
        queryset = Review.objects.all().order_by('-created_at')
        
        # Фільтр по борщу
        borsch_id = self.request.query_params.get('borsch_id', None)
        if borsch_id:
            queryset = queryset.filter(borsch_id=borsch_id)

        if self.request.query_params.get('mine', '').lower() == 'true':
            if not self.request.user.is_authenticated:
                return queryset.none()
            queryset = queryset.filter(user=self.request.user)

        return queryset
    
    def perform_create(self, serializer):
        """Створити відгук від поточного користувача й оновити агрегати."""
        review = serializer.save(user=self.request.user, temp_user_id='')
        self._recalculate_borsch_ratings(review.borsch)
    
    def perform_update(self, serializer):
        """
        Оновлення відгуку з перерахунком рейтингів борщу.
        """
        review = self.get_object()
        serializer.save()
        
        # Перерахунок рейтингів борщу
        self._recalculate_borsch_ratings(review.borsch)
    
    def perform_destroy(self, instance):
        """
        Видалення відгуку з перерахунком рейтингів борщу.
        """
        borsch = instance.borsch
        instance.delete()
        
        # Перерахунок рейтингів борщу
        self._recalculate_borsch_ratings(borsch)
    
    def _recalculate_borsch_ratings(self, borsch):
        """
        Перерахунок середніх оцінок для борщу.

        The arithmetic now lives in `core.ratings` and is also wired to the
        Review signals, so this call is belt-and-braces: it is idempotent and
        a no-op write when the signal already did the work. It stays because
        it keeps the recalculation visible at the point in the request where
        it matters, and because the API path must not depend on signal
        registration having succeeded. See `core/ratings.py`.
        """
        recalculate_borsch_ratings(borsch)


# =============================================================================
# FavoriteBorsch ViewSet
# =============================================================================

class FavoriteBorschViewSet(viewsets.ModelViewSet):
    """
    ViewSet для обраних борщів.
    
    Підтримує CRUD операції:
    - GET /api/favorites/ - список обраних борщів користувача
    - POST /api/favorites/ - додати борщ до обраних (потрібна авторизація)
    - DELETE /api/favorites/{id}/ - видалити з обраних (потрібна авторизація)
    """
    queryset = FavoriteBorsch.objects.all()
    serializer_class = FavoriteBorschSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = CustomPageNumberPagination
    
    def get_queryset(self):
        """Отримати список обраних борщів поточного користувача."""
        if self.request.user.is_authenticated:
            return FavoriteBorsch.objects.filter(
                user=self.request.user
            ).order_by('-added_at')
        return FavoriteBorsch.objects.none()
    
    def perform_create(self, serializer):
        """Створення запису з прив'язкою до поточного користувача."""
        if self.request.user.is_authenticated:
            serializer.save(user=self.request.user)
        else:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Потрібна авторизація для додавання до обраних')


# =============================================================================
# User ViewSet (для сумісності)
# =============================================================================

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet для користувачів.
    
    Тільки читання (список та детальна інформація).
    Використовується для відображення авторів відгуків.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticatedOrReadOnlyUA]
    pagination_class = CustomPageNumberPagination
