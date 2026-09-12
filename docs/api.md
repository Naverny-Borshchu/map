# API

Довідник HTTP-API проєкту: як працювати з бекендом із фронтенду або
стороннього клієнта. Машинозчитувана схема — `backend/openapi.yaml`.

Цей документ описує, як працювати з API бекенду. Тут ви знайдете приклади запитів, опис структур даних та інструкції для інтеграції.

## 📚 Зміст

- [Швидкий старт](#швидкий-старт)
- [Змінні середовища](#змінні-середовища)
- [Список endpoint'ів](#список-endpointів)
- [Admin (службові сторінки)](#admin-службові-сторінки)
- [Авторизація](#авторизація)
- [Приклади запитів (cURL)](#приклади-запитів-curl)
- [Завантаження фото борщу](#завантаження-фото-борщу)
- [Нові ендпоінти](#нові-ендпоінти)
- [Структури даних](#структури-даних)
- [Коди помилок](#коди-помилок)

---

## 🚀 Швидкий старт

### Базова URL API

```
Розробка: http://localhost:8000/api
Production: https://api.navernyborshchu.com/api
```

### Формат даних

- **Content-Type**: `application/json` (для більшості запитів)
- **Відповіді**: JSON
- **Пагінація**: Параметри `page` та `page_size`

---

## Змінні середовища

| Змінна | Опис |
|--------|------|
| `GOOGLE_OAUTH_CLIENT_IDS` | Один або кілька **OAuth 2.0 Client ID** з Google Cloud Console (Web / iOS / Android), через кому. Можна задати одне значення через `GOOGLE_OAUTH_CLIENT_ID`. |
| `DB_ENGINE` | `sqlite` (за замовчуванням, локально) або `postgres` для PostgreSQL. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Параметри БД, якщо `DB_ENGINE=postgres`. |

Після оновлення залежностей застосуйте міграції (у тому числі для JWT refresh blacklist):

```bash
python manage.py migrate
```

---

## 📋 Список endpoint'ів

### Auth (Google + JWT)

Окремої реєстрації email/паролем **немає**: перший успішний вхід через Google створює `User` і `UserProfile` автоматично. Повторний вхід — той самий ендпоінт `POST /api/auth/google/`.

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| POST | `/api/auth/google/` | Вхід / «реєстрація» через Google `id_token` → JWT (`access`, `refresh`) + `user`, `profile` | ❌ |
| POST | `/api/auth/logout/` | Вихід: відкликати `refresh` (blacklist); access видалити на клієнті | ❌ |
| POST | `/api/auth/token/refresh/` | Видати новий `access` (і при ротації — новий `refresh`) за дійсним `refresh` | ❌ |

### Places (Заклади)

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/places/` | Список закладів | ❌ |
| GET | `/api/places/{id}/` | Деталі закладу | ❌ |
| POST | `/api/places/` | Створити заклад | ✅ |
| PUT | `/api/places/{id}/` | Повне оновлення закладу | ✅ |
| PATCH | `/api/places/{id}/` | Часткове оновлення закладу | ✅ |
| DELETE | `/api/places/{id}/` | Видалити заклад | ✅ |

**Фільтри для GET /places/:**
- `search` — пошук по назві/адресі
- `city` — фільтр по місту
- `type` — фільтр по типу закладу (одне значення або кілька через кому; підтримується масив у вигляді `['RESTAURANT','CAFE']`)

### Borsches (Борщі)

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/borsches/` | Список борщів | ❌ |
| GET | `/api/borsches/{id}/` | Деталі борщу | ❌ |
| POST | `/api/borsches/` | Створити борщ | ✅ |
| PUT | `/api/borsches/{id}/` | Повне оновлення борщу | ✅ |
| PATCH | `/api/borsches/{id}/` | Часткове оновлення борщу | ✅ |
| DELETE | `/api/borsches/{id}/` | Видалити борщ | ✅ |
| POST | `/api/borsches/{id}/upload_photo/` | Завантажити фото | ✅ |

**Фільтри для GET /borsches/:**
- `place_id` — фільтр по закладу (один UUID або кілька через кому)
- `type_meat` — фільтр по типу м'яса (`no_meat`, `chicken`, `pork`, `beef`, `other`; кілька значень через кому)
- `min_price`, `max_price` — діапазон цін

### Reviews (Відгуки)

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/reviews/` | Список відгуків | ❌ |
| GET | `/api/reviews/{id}/` | Деталі відгуку | ❌ |
| POST | `/api/reviews/` | Створити відгук (у тілі обов'язково поле `borsch`) | ✅ |
| PUT | `/api/reviews/{id}/` | Повне оновлення відгуку | ✅ |
| PATCH | `/api/reviews/{id}/` | Часткове оновлення відгуку | ✅ |
| DELETE | `/api/reviews/{id}/` | Видалити відгук | ✅ |

**Параметри для GET /reviews/:**
- `borsch_id` — фільтр по борщу (рекомендовано для списку відгуків одного борщу)
- `mine=true` — лише відгуки поточного авторизованого користувача

### Profile (Профіль користувача)

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/profile/me/` | Профіль поточного користувача (основний для клієнта) | ✅ |
| PATCH | `/api/profile/me/` | Оновити профіль поточного користувача | ✅ |
| GET | `/api/profile/` | Список усіх профілів (рідко потрібен клієнту) | ❌ |
| GET | `/api/profile/{id}/` | Профіль за ID запису UserProfile | ❌ |
| PUT | `/api/profile/{id}/` | Повне оновлення профілю за ID | ✅ |
| PATCH | `/api/profile/{id}/` | Часткове оновлення профілю за ID | ✅ |

### Favorites (Обрані борщі)

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/favorites/` | Список обраних поточного користувача | ✅ |
| GET | `/api/favorites/{id}/` | Деталі запису в обраних | ✅ |
| POST | `/api/favorites/` | Додати до обраних | ✅ |
| DELETE | `/api/favorites/{id}/` | Видалити з обраних | ✅ |

### Place Types (Типи закладів)

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/place-types/` | Список типів | ❌ |
| GET | `/api/place-types/{id}/` | Деталі типу закладу | ❌ |

### Users (Користувачі)

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/users/` | Список користувачів | ❌ |
| GET | `/api/users/{id}/` | Деталі користувача | ❌ |

---

## Admin (службові сторінки)

Ці маршрути **не для мобільного/веб-клієнта**: HTML-дашборди та JSON для внутрішньої аналітики. Потрібна **сесія staff-користувача Django Admin** (логін через `/admin/`).

| Метод | Endpoint | Опис | Авторизація |
|-------|----------|------|-------------|
| GET | `/api/admin/stats/` | HTML: статистика сервера та медіа | Staff (admin) |
| GET | `/api/admin/analytics/` | HTML: сторінка аналітики (графіки) | Staff (admin) |
| GET | `/admin/stats/` | Те саме, що `/api/admin/stats/` | Staff (admin) |
| GET | `/admin/analytics/` | Те саме, що `/api/admin/analytics/` | Staff (admin) |
| GET | `/admin/analytics/data/` | JSON з часовими рядами та топами | Staff (admin) |

**Параметри для GET /admin/analytics/data/:**
- `days` — кількість днів у вибірці (1–365, за замовчуванням `30`)

**Приклад відповіді** `/admin/analytics/data/?days=30` (скорочено):

```json
{
  "days": 30,
  "labels": ["2026-04-26", "2026-04-27"],
  "series": {
    "users_new": [0, 1],
    "reviews": [2, 0],
    "favorites": [0, 0],
    "places": [1, 0],
    "borsches": [0, 2]
  },
  "top_cities": {
    "reviews": [{ "city": "Київ", "count": 12 }],
    "favorites": [{ "city": "Львів", "count": 3 }],
    "places": [{ "city": "Київ", "count": 5 }],
    "borsches": [{ "city": "Одеса", "count": 2 }]
  },
  "generated_at": "2026-05-25T12:00:00+03:00"
}
```

---

## 🔐 Авторизація

### Як це працює

1. Клієнт інтегрує **Google Sign-In** і отримує **`id_token`** (JWT від Google).
2. Клієнт надсилає цей токен на **`POST /api/auth/google/`**.
3. Бекенд перевіряє підпис і `aud` (ваш Google OAuth Client ID), створює або оновлює **`User`** та **`UserProfile`**, повертає **JWT**:
   - **`access`** — короткоживучий токен для API;
   - **`refresh`** — довгоживучий токен для оновлення `access`.
4. Для захищених операцій додавайте заголовок:

```
Authorization: Bearer <access>
```

5. Коли `access` прострочився:

```http
POST /api/auth/token/refresh/
Content-Type: application/json

{"refresh": "<refresh>"}
```

Відповідь містить новий `access` (а при увімкненій ротації refresh у проєкті — також новий `refresh`; старий refresh після ротації вважається відкликаним через blacklist).

6. При виході з акаунта надішліть поточний `refresh` на logout і **видаліть `access` та `refresh` локально** (SecureStore / localStorage):

```http
POST /api/auth/logout/
Content-Type: application/json

{"refresh": "<refresh>"}
```

Відповідь `205` з `{"message": "Вихід виконано успішно."}`. Після цього цей `refresh` не можна використати для оновлення access. **Access JWT** залишається технічно валідним до закінчення `ACCESS_TOKEN_LIFETIME` (60 хв) — це обмеження stateless JWT; на клієнті токен все одно потрібно стерти.

### Публічні та приватні ендпоінти

**Без токена (типово GET):** списки закладів, борщів, відгуків, довідники тощо.

**З токеном (POST / PATCH / DELETE):** створення та зміна сутностей, профіль, обране, завантаження фото.

### Помилки при Google-вході

| HTTP | Причина |
|------|---------|
| 400 | Невалідний `id_token`, прострочений токен, не підтверджений email у Google, не налаштовані `GOOGLE_OAUTH_CLIENT_IDS` на сервері |
| 409 | Конфлікт прив’язки: локальний профіль уже має інший `google_id` для цього email |

---

## 📝 Приклади запитів (cURL)

### Увійти через Google (отримати JWT)

Після Google Sign-In на клієнті візьміть `id_token` і надішліть:

```bash
curl -X POST "http://localhost:8000/api/auth/google/" \
  -H "Content-Type: application/json" \
  -d '{"id_token": "<google-id-token>"}'
```

У відповіді будуть поля `access`, `refresh`, `user`, `profile`. Далі використовуйте:

```bash
curl -X POST "http://localhost:8000/api/auth/token/refresh/" \
  -H "Content-Type: application/json" \
  -d '{"refresh": "<refresh>"}'
```

### Вийти з акаунта (logout)

```bash
curl -X POST "http://localhost:8000/api/auth/logout/" \
  -H "Content-Type: application/json" \
  -d '{"refresh": "<refresh>"}'
```

Після успіху видаліть збережені `access` і `refresh` на клієнті.

### Отримати список закладів

```bash
curl -X GET "http://localhost:8000/api/places/?search=Пузата&city=Київ"
```

**Відповідь:**
```json
{
  "count": 2,
  "next": null,
  "previous": null,
  "page": 1,
  "page_size": 20,
  "total_pages": 1,
  "results": [
    {
      "id": "c4f2d26e-9b1b-4a21-9c8a-1a6d3c251234",
      "name": "Пузата Хата",
      "address": "Хрещатик, 25",
      "location_lat": "50.450001",
      "location_lng": "30.523333",
      "country": "Україна",
      "city": "Київ",
      "type": "RESTAURANT",
      "type_label": "Ресторан",
      "created_at": "2025-03-12T10:15:00Z",
      "updated_at": "2025-03-12T10:15:00Z"
    }
  ]
}
```

### Створити новий заклад

```bash
curl -X POST "http://localhost:8000/api/places/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Пузата Хата",
    "address": "Хрещатик, 25",
    "location_lat": 50.450001,
    "location_lng": 30.523333,
    "country": "Україна",
    "city": "Київ",
    "type": "RESTAURANT"
  }'
```

### Отримати список борщів

```bash
curl -X GET "http://localhost:8000/api/borsches/?place_id=c4f2d26e-9b1b-4a21-9c8a-1a6d3c251234&type_meat=pork"
```

### Створити новий борщ

```bash
curl -X POST "http://localhost:8000/api/borsches/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "place": "c4f2d26e-9b1b-4a21-9c8a-1a6d3c251234",
    "name": "Борщ з пампушками",
    "type_meat": "pork",
    "price_uah": 350.00,
    "weight_grams": 600,
    "photo_urls": []
  }'
```

### Створити відгук

```bash
curl -X POST "http://localhost:8000/api/reviews/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "borsch": "b1a2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "message": "Дуже смачний борщ! Рекомендую.",
    "rating_salt": 9,
    "rating_meat": 8,
    "rating_beet": 9,
    "rating_density": 10,
    "rating_aftertaste": 8,
    "rating_serving": 10,
    "overall_rating": 9
  }'
```

**Важливо:** Усі 6 оцінок (`rating_*`) та `overall_rating` є **обов'язковими**. Діапазон: 0–10.

### Отримати відгуки для борщу

```bash
curl -X GET "http://localhost:8000/api/reviews/?borsch_id=b1a2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d&page=1&page_size=10"
```

### Отримати профіль користувача

```bash
curl -X GET "http://localhost:8000/api/profile/me/" \
  -H "Authorization: Bearer <token>"
```

### Оновити профіль користувача

```bash
curl -X PATCH "http://localhost:8000/api/profile/me/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "given_name": "Марта",
    "email": "newemail@gmail.com",
    "country": "Україна"
  }'
```

### Додати борщ до обраних

```bash
curl -X POST "http://localhost:8000/api/favorites/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "borsch": "b1a2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
  }'
```

---

## 📸 Завантаження фото борщу

### Endpoint

```
POST /api/borsches/{id}/upload_photo/
```

### Формат запиту

**Content-Type:** `multipart/form-data`

**Параметри:**
- `photo` (file) — файл зображення (PNG, JPG, WEBP)

### Приклад cURL

```bash
curl -X POST "http://localhost:8000/api/borsches/b1a2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d/upload_photo/" \
  -H "Authorization: Bearer <token>" \
  -F "photo=@/path/to/borsch-photo.png"
```

### Відповідь

```json
{
  "photo_url": "/media/borsches/b1a2c3d4/photos/abc123.png",
  "message": "Фото успішно завантажено"
}
```

### Інтеграція з React (приклад)

```javascript
async function uploadBorschPhoto(borschId, file) {
  const formData = new FormData();
  formData.append('photo', file);
  
  const response = await fetch(
    `http://localhost:8000/api/borsches/${borschId}/upload_photo/`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Не встановлюйте Content-Type для FormData!
      },
      body: formData
    }
  );
  
  const data = await response.json();
  return data.photo_url;
}
```

### Важливі нотатки

1. **Авторизація обов'язкова** — тільки авторизовані користувачі можуть завантажувати фото
2. **Формати файлів** — PNG, JPG, WEBP
3. **URL зберігається** — після завантаження URL додається до масиву `photo_urls` борщу
4. **Повна URL** — для відображення використовуйте `${API_URL}${data.photo_url}`

---

## 🆕 Нові ендпоінти

Нижче зібрані додаткові маршрути, які варто відзначити у фронтенді.

| Метод | Endpoint | Що робить |
|-------|----------|-----------|
| POST | `/api/auth/google/` | Реєстрація / вхід через Google. Повертає `access`, `refresh`, `user` та `profile`. |
| POST | `/api/auth/token/refresh/` | Оновлення `access`-токена за `refresh`. |
| POST | `/api/auth/logout/` | Вихід із системи з відкликанням `refresh`-токена. |
| GET | `/api/profile/me/` | Отримати профіль поточного користувача. |
| PATCH | `/api/profile/me/` | Оновити профіль поточного користувача. |
| POST | `/api/borsches/{id}/upload_photo/` | Завантажити фото борщу. |
| GET | `/api/admin/stats/` | Службова статистика для staff/admin. |
| GET | `/api/admin/analytics/` | Службова аналітика для staff/admin. |

---

## 📊 Структури даних

### Place (Заклад)

```json
{
  "id": "uuid",
  "name": "string",
  "address": "string",
  "location_lat": "decimal",
  "location_lng": "decimal",
  "country": "string",
  "city": "string",
  "type": "string (код типу)",
  "type_label": "string (назва типу)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Borsch (Борщ)

```json
{
  "id": "uuid",
  "place": "uuid (ID закладу)",
  "place_name": "string",
  "name": "string",
  "type_meat": "string (no_meat|chicken|pork|beef|other)",
  "price_uah": "decimal",
  "weight_grams": "integer",
  "photo_urls": ["string (URL)"],
  "rating_salt": "decimal (0-10)",
  "rating_meat": "decimal (0-10)",
  "rating_beet": "decimal (0-10)",
  "rating_density": "decimal (0-10)",
  "rating_aftertaste": "decimal (0-10)",
  "rating_serving": "decimal (0-10)",
  "overall_rating": "decimal (0-10)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Review (Відгук)

```json
{
  "id": "uuid",
  "borsch": "uuid (ID борщу)",
  "borsch_name": "string",
  "user": "integer (ID користувача)",
  "author_username": "string",
  "temp_user_id": "string",
  "message": "string",
  "rating_salt": "decimal (0-10)",
  "rating_meat": "decimal (0-10)",
  "rating_beet": "decimal (0-10)",
  "rating_density": "decimal (0-10)",
  "rating_aftertaste": "decimal (0-10)",
  "rating_serving": "decimal (0-10)",
  "overall_rating": "decimal (0-10)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### UserProfile (Профіль)

```json
{
  "user": "integer",
  "username": "string",
  "email": "string (email)",
  "google_id": "string",
  "given_name": "string",
  "surname": "string",
  "country": "string",
  "locale": "string",
  "avatar_url": "string (URL)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

---

## ❌ Коди помилок

| Код | Опис | Приклад |
|-----|------|---------|
| 200 | Успішний запит | — |
| 201 | Ресурс створено | Після POST |
| 204 | Ресурс видалено | Після DELETE |
| 205 | Успішний вихід (logout) | `{"message": "Вихід виконано успішно."}` |
| 400 | Помилка валідації | `{"error": "Поле 'name' є обов'язковим"}` |
| 401 | Потрібна авторизація | `{"error": "Потрібна авторизація"}` |
| 403 | Недостатньо прав | `{"error": "Ви можете редагувати тільки власні відгуки"}` |
| 404 | Ресурс не знайдено | `{"error": "Ресурс не знайдено"}` |
| 500 | Помилка сервера | `{"error": "Внутрішня помилка сервера"}` |

---

## 💡 Поради для фронтенд-розробника

1. **Використовуйте пагінацію** — для великих списків додавайте `?page=2&page_size=20`
2. **Обробляйте помилки** — завжди перевіряйте статус відповіді та поле `error`
3. **Кешуйте довідники** — типи закладів (`/api/place-types/`) змінюються рідко
4. **Слідкуйте за рейтингами** — після створення/оновлення/видалення відгуку рейтинги борщу перераховуються автоматично
5. **Фото завантажуйте через FormData** — не встановлюйте `Content-Type` вручну для `multipart/form-data`
