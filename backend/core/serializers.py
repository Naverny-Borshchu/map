"""
Серіалізатори Django REST Framework для моделей додатку Core.

Цей файл містить серіалізатори для перетворення моделей даних
у JSON формат та валідації вхідних даних.

Використовується:
- ModelSerializer для автоматичної генерації полів
- Custom валідація для required полів
- Nested серіалізатори для зв'язаних моделей
"""

from rest_framework import serializers
from django.contrib.auth.models import User
from .models import PlaceType, Place, Borsch, UserProfile, Review, FavoriteBorsch


# =============================================================================
# PlaceType серіалізатори
# =============================================================================

class PlaceTypeSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для типів закладів.
    
    Використовується для довідника типів (Ресторан, Кафе тощо).
    """
    class Meta:
        model = PlaceType
        fields = ['code', 'label']
        read_only_fields = ['code']


# =============================================================================
# Place серіалізатори
# =============================================================================

class PlaceSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для закладів.
    
    Містить усі поля моделі Place з валідацією.
    Для створення/оновлення всі поля крім id є обов'язковими.

    Сумісність із фронтендом: додані alias-поля latitude/longitude
    (фронт чекає їх замість location_lat/location_lng).
    """
    # Додаткове поле для відображення типу закладу (назва, а не код)
    type_label = serializers.CharField(source='type.label', read_only=True)

    # Alias-поля для фронтенду
    latitude = serializers.FloatField(source='location_lat', read_only=True)
    longitude = serializers.FloatField(source='location_lng', read_only=True)
    
    class Meta:
        model = Place
        fields = [
            'id', 'name', 'address', 'location_lat', 'location_lng',
            'latitude', 'longitude',
            'country', 'city', 'type', 'type_label',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'latitude', 'longitude']
    
    def validate_location_lat(self, value):
        """Перевірка широти на допустиме значення (-90 до 90)."""
        if value < -90 or value > 90:
            raise serializers.ValidationError(
                'Широта повинна бути в діапазоні від -90 до 90'
            )
        return value
    
    def validate_location_lng(self, value):
        """Перевірка довготи на допустиме значення (-180 до 180)."""
        if value < -180 or value > 180:
            raise serializers.ValidationError(
                'Довгота повинна бути в діапазоні від -180 до 180'
            )
        return value


class PlaceCreateSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для створення нового закладу.
    
    Всі поля обов'язкові для заповнення.
    """
    class Meta:
        model = Place
        fields = [
            'id', 'name', 'address', 'location_lat', 'location_lng',
            'country', 'city', 'type'
        ]
        read_only_fields = ['id']
    
    def validate_location_lat(self, value):
        """Перевірка широти."""
        if value < -90 or value > 90:
            raise serializers.ValidationError(
                'Широта повинна бути в діапазоні від -90 до 90'
            )
        return value
    
    def validate_location_lng(self, value):
        """Перевірка довготи."""
        if value < -180 or value > 180:
            raise serializers.ValidationError(
                'Довгота повинна бути в діапазоні від -180 до 180'
            )
        return value


class PlaceUpdateSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для оновлення закладу.
    
    Всі поля необов'язкові (часткове оновлення).
    """
    class Meta:
        model = Place
        fields = [
            'name', 'address', 'location_lat', 'location_lng',
            'country', 'city', 'type'
        ]
        extra_kwargs = {
            'name': {'required': False},
            'address': {'required': False},
            'location_lat': {'required': False},
            'location_lng': {'required': False},
            'country': {'required': False},
            'city': {'required': False},
            'type': {'required': False},
        }


# =============================================================================
# Borsch серіалізатори
# =============================================================================

class BorschSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для борщів.
    
    Містить усі поля моделі Borsch з агрегованими оцінками.
    Для створення обов'язкові: place_id, name, type_meat, price_uah, weight_grams.

    Сумісність із фронтендом: додані alias-поля (price, grams, place_city,
    rating_count, rating_sum, ratings, extras, dish_features, date), які
    фронтовий mapBorsch() очікує як ключі об'єкта.
    """
    # Додаткові поля для фронтенду
    place_name = serializers.CharField(source='place.name', read_only=True)
    place_city = serializers.CharField(source='place.city', read_only=True)

    # Alias-поля: фронт чекає price/grams замість price_uah/weight_grams
    price = serializers.DecimalField(
        source='price_uah', max_digits=10, decimal_places=2,
        read_only=True, rounding=None
    )
    grams = serializers.IntegerField(source='weight_grams', read_only=True)

    # Підтримка ratings[] масивом (фронт рахує середнє сам, якщо масив непорожній)
    ratings = serializers.SerializerMethodField()

    # Поля, яких немає в моделі — повертаємо завжди порожні (контракт із фроном)
    extras = serializers.CharField(read_only=True, default='')
    dish_features = serializers.CharField(read_only=True, default='')
    date = serializers.CharField(read_only=True, default='')

    # agregates для rating_count / rating_sum
    rating_count = serializers.SerializerMethodField()
    rating_sum = serializers.SerializerMethodField()

    class Meta:
        model = Borsch
        fields = [
            'id', 'place', 'place_name', 'place_city', 'name', 'type_meat',
            'price_uah', 'weight_grams', 'price', 'grams',
            'photo_urls',
            'rating_salt', 'rating_meat', 'rating_beet',
            'rating_density', 'rating_aftertaste', 'rating_serving',
            'overall_rating',
            'rating_count', 'rating_sum', 'ratings',
            'extras', 'dish_features', 'date',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'rating_salt', 'rating_meat', 'rating_beet',
            'rating_density', 'rating_aftertaste', 'rating_serving',
            'overall_rating',
            'price', 'grams', 'place_city',
            'rating_count', 'rating_sum', 'ratings',
            'extras', 'dish_features', 'date',
        ]

    def get_ratings(self, obj):
        """Віддаємо масив відгуків, щоб фронт міг рахувати середнє."""
        reviews = obj.reviews.all()
        return [
            {
                'rating_salt': r.rating_salt,
                'rating_meat': r.rating_meat,
                'rating_beet': r.rating_beet,
                'rating_density': r.rating_density,
                'rating_aftertaste': r.rating_aftertaste,
                'rating_serving': r.rating_serving,
                'overall_rating': r.overall_rating,
            }
            for r in reviews
        ]

    def get_rating_count(self, obj):
        return obj.reviews.count()

    def get_rating_sum(self, obj):
        """Сума overall_rating по відгуках (для сумісності з фронтовим fallback)."""
        from django.db.models import Sum
        result = obj.reviews.aggregate(total=Sum('overall_rating'))
        return result['total'] or 0
    
    def validate_price_uah(self, value):
        """Перевірка ціни (має бути додатною)."""
        if value <= 0:
            raise serializers.ValidationError('Ціна повинна бути більше 0')
        return value
    
    def validate_weight_grams(self, value):
        """Перевірка ваги (має бути додатною)."""
        if value <= 0:
            raise serializers.ValidationError('Вага повинна бути більше 0')
        return value


class BorschCreateSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для створення нового борщу.
    
    Обов'язкові поля: place_id, name, type_meat, price_uah, weight_grams.
    Рейтинги ініціалізуються нулями.
    """
    class Meta:
        model = Borsch
        fields = [
            'id', 'place', 'name', 'type_meat', 'price_uah',
            'weight_grams', 'photo_urls'
        ]
        read_only_fields = ['id']

    def validate_price_uah(self, value):
        """Перевірка ціни."""
        if value <= 0:
            raise serializers.ValidationError('Ціна повинна бути більше 0')
        return value
    
    def validate_weight_grams(self, value):
        """Перевірка ваги."""
        if value <= 0:
            raise serializers.ValidationError('Вага повинна бути більше 0')
        return value


class BorschUpdateSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для оновлення борщу.
    
    Дозволяє оновлювати основні атрибути (не рейтинги).
    """
    class Meta:
        model = Borsch
        fields = [
            'name', 'type_meat', 'price_uah',
            'weight_grams', 'photo_urls'
        ]
        extra_kwargs = {
            'name': {'required': False},
            'type_meat': {'required': False},
            'price_uah': {'required': False},
            'weight_grams': {'required': False},
            'photo_urls': {'required': False},
        }


# =============================================================================
# UserProfile серіалізатори
# =============================================================================

class UserProfileSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для профілів користувачів.
    
    Містить інформацію з Google OAuth та редаговані поля.
    """
    # Додаткові поля з пов'язаної моделі User
    email = serializers.EmailField(source='user.email', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = UserProfile
        fields = [
            'user', 'username', 'email', 'google_id',
            'given_name', 'surname', 'country', 'locale',
            'avatar_url', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'user', 'google_id', 'created_at', 'updated_at'
        ]


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для оновлення профілю користувача.
    
    Дозволяє редагувати: given_name, email, country.
    """
    email = serializers.EmailField(source='user.email')
    
    class Meta:
        model = UserProfile
        fields = ['given_name', 'email', 'country']
    
    def update(self, instance, validated_data):
        """Оновлення профілю та пов'язаного користувача."""
        # Оновлення email у пов'язаній моделі User
        if 'user' in validated_data:
            user_data = validated_data.pop('user')
            if 'email' in user_data:
                instance.user.email = user_data['email']
                instance.user.save()
        
        # Оновлення полів профілю
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


# =============================================================================
# Review серіалізатори
# =============================================================================

class ReviewSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для відгуків.
    
    Містить текстовий коментар та оцінки по критеріях.
    Всі rating_* поля обов'язкові (діапазон 0-10).
    """
    # Додаткові поля для відображення автора
    author_username = serializers.CharField(source='user.username', read_only=True)
    borsch_name = serializers.CharField(source='borsch.name', read_only=True)
    
    class Meta:
        model = Review
        fields = [
            'id', 'borsch', 'borsch_name', 'user', 'author_username',
            'temp_user_id', 'message',
            'rating_salt', 'rating_meat', 'rating_beet',
            'rating_density', 'rating_aftertaste', 'rating_serving',
            'overall_rating', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_rating(self, value, field_name):
        """Перевірка оцінки на діапазон 0-10."""
        if value < 0 or value > 10:
            raise serializers.ValidationError(
                f'Оцінка "{field_name}" повинна бути в діапазоні від 0 до 10'
            )
        return value
    
    def validate_rating_salt(self, value):
        return self.validate_rating(value, 'солоність')
    
    def validate_rating_meat(self, value):
        return self.validate_rating(value, 'м\'ясо')
    
    def validate_rating_beet(self, value):
        return self.validate_rating(value, 'буряк')
    
    def validate_rating_density(self, value):
        return self.validate_rating(value, 'густота')
    
    def validate_rating_aftertaste(self, value):
        return self.validate_rating(value, 'післясмак')
    
    def validate_rating_serving(self, value):
        return self.validate_rating(value, 'подача')
    
    def validate_overall_rating(self, value):
        return self.validate_rating(value, 'загальна')


class ReviewCreateSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для створення нового відгуку.
    
    Всі оцінки обов'язкові для заповнення.
    """
    class Meta:
        model = Review
        fields = [
            'id', 'borsch', 'message',
            'rating_salt', 'rating_meat', 'rating_beet',
            'rating_density', 'rating_aftertaste', 'rating_serving',
            'overall_rating', 'created_at', 'is_flagged'
        ]
        read_only_fields = ['id', 'created_at', 'is_flagged']
        extra_kwargs = {
            'message': {'required': False, 'allow_blank': True},
        }
    
    def validate_rating(self, value, field_name):
        """Перевірка оцінки на діапазон 0-10."""
        if value < 0 or value > 10:
            raise serializers.ValidationError(
                f'Оцінка "{field_name}" повинна бути в діапазоні від 0 до 10'
            )
        return value
    
    def validate_rating_salt(self, value):
        return self.validate_rating(value, 'солоність')
    
    def validate_rating_meat(self, value):
        return self.validate_rating(value, 'м\'ясо')
    
    def validate_rating_beet(self, value):
        return self.validate_rating(value, 'буряк')
    
    def validate_rating_density(self, value):
        return self.validate_rating(value, 'густота')
    
    def validate_rating_aftertaste(self, value):
        return self.validate_rating(value, 'післясмак')
    
    def validate_rating_serving(self, value):
        return self.validate_rating(value, 'подача')
    
    def validate_overall_rating(self, value):
        return self.validate_rating(value, 'загальна')


class ReviewUpdateSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для оновлення відгуку.
    
    Дозволяє оновлювати повідомлення та оцінки.
    """
    class Meta:
        model = Review
        fields = [
            'message',
            'rating_salt', 'rating_meat', 'rating_beet',
            'rating_density', 'rating_aftertaste', 'rating_serving',
            'overall_rating'
        ]
        extra_kwargs = {
            'message': {'required': False},
            'rating_salt': {'required': False},
            'rating_meat': {'required': False},
            'rating_beet': {'required': False},
            'rating_density': {'required': False},
            'rating_aftertaste': {'required': False},
            'rating_serving': {'required': False},
            'overall_rating': {'required': False},
        }


# =============================================================================
# FavoriteBorsch серіалізатори
# =============================================================================

class FavoriteBorschSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для обраних борщів.

    Містить інформацію про користувача та борщ.

    `user` — HiddenField із CurrentUserDefault, а не звичайне поле. До цього
    воно було записуваним і обов'язковим, тож клієнт, який слав лише
    {"borsch": "<uuid>"} (як і має бути), отримував
    400 {"user": ["Це поле обов'язкове."]} — і додати борщ в обране з застосунку
    було неможливо взагалі. Просто зробити його read_only не досить: у моделі є
    unique_together ('user', 'borsch'), і DRF додає UniqueTogetherValidator лише
    коли всі поля обмеження присутні у валідованих даних. read_only + default дає і те,
    і те: клієнт нічого не вирішує, поле лишається у відповіді, а повторний лайк
    отримує зрозумілий 400 замість IntegrityError і 500.
    """
    borsch_detail = BorschSerializer(source='borsch', read_only=True)
    # read_only so a client cannot claim someone else's favourite, but WITH a
    # default so it still participates in the unique_together validation —
    # DRF only attaches UniqueTogetherValidator when every field of the
    # constraint resolves, and requires a default for the read-only ones.
    # HiddenField would also work but drops `user` from the response, which
    # breaks the favourites contract test in NAV-118.
    user = serializers.PrimaryKeyRelatedField(
        read_only=True,
        default=serializers.CurrentUserDefault(),
    )

    class Meta:
        model = FavoriteBorsch
        fields = ['id', 'user', 'borsch', 'borsch_detail', 'added_at']
        read_only_fields = ['id', 'user', 'added_at']


# =============================================================================
# Серіалізатор для користувача (User)
# =============================================================================

class UserSerializer(serializers.ModelSerializer):
    """
    Серіалізатор для моделі користувача Django.
    
    Використовується для відображення авторів відгуків.
    """
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id', 'username', 'email']
