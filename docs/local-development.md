# Локальна розробка

Три способи підняти проєкт — від найшвидшого до найповнішого.

## 0. Що знадобиться в будь-якому разі

**Ключ Google Maps JavaScript API.** Без нього мапа не відрендериться — ані
локально, ані будь-де. Заведіть свій у
[Google Cloud Console](https://console.cloud.google.com/google/maps-apis):
увімкніть *Maps JavaScript API* і *Places API (New)*, створіть ключ і
**обмежте його** за HTTP-реферером (`http://localhost:3000/*`) і за переліком
API. Необмежений ключ у публічному бандлі — це чужий рахунок за ваші гроші.

Вхід через Google потрібен лише для сценаріїв з акаунтом (обране, «мої
відгуки»). Мапу, список і сторінку борщу видно без нього.

## 1. Тільки фронтенд, проти бойового API

Найшвидший шлях, якщо ви правите інтерфейс: бази не треба взагалі.

```bash
cd frontend
cp .env.example .env.local
#   REACT_APP_API_KEY_MAP=<ваш ключ>
#   REACT_APP_API_URL=https://api.navernyborshchu.com/api
npm ci
npm start            # http://localhost:3000
```

`localhost:3000` і `localhost:3001` є у `CORS_ALLOWED_ORIGINS` бойового
бекенду, тож читання працює одразу.

⚠️ Це **бойові дані**. Усе, що ви створите чи оціните, побачать живі
користувачі. Для експериментів із записом підніміть бекенд локально.

## 2. Docker: база + API одним рядком

```bash
docker compose up --build      # PostgreSQL + Django на 127.0.0.1:8000
curl http://127.0.0.1:8000/api/places/
```

Порти навмисно прибиті до `127.0.0.1`: dev-сервер Django з `DEBUG=True` не
має дивитися в інтернет.

База підніметься порожня — міграції застосуються самі. Далі:

```bash
docker compose exec api python manage.py createsuperuser   # /admin/
```

Фронтенд у цьому режимі запускається нативно, з `REACT_APP_API_URL=http://127.0.0.1:8000/api`.

## 3. Усе нативно

**Бекенд.**

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

`.env` треба заповнити: `DJANGO_SECRET_KEY` (будь-який довгий рядок для
розробки), `DB_NAME`, `DB_USER`, `DB_PASSWORD`. Далі:

```bash
export $(grep -v '^#' .env | xargs)
python manage.py migrate
python manage.py runserver 8000
```

**Фронтенд.**

```bash
cd frontend
cp .env.example .env.local     # REACT_APP_API_URL=http://localhost:8000/api
npm ci
npm start
```

## Тести

```bash
# бекенд: SQLite, PostgreSQL не потрібен
cd backend
DJANGO_SETTINGS_MODULE=naverny_borschu_api.settings_test pytest

# фронтенд
cd frontend
CI=true npx react-scripts test --watchAll=false
```

Очікуваний результат на чистій гілці — **55 тестів бекенду** і **119 тестів
фронтенду**, усі зелені.

## Збірка фронтенду так, як це робить CI

```bash
cd frontend
CI=true REACT_APP_API_URL=/api REACT_APP_VARIANT=map1 \
  REACT_APP_NAV=wide REACT_APP_RATE_SCALE=10 \
  REACT_APP_API_KEY_MAP=<ключ> REACT_APP_API_KEY_AUTH=<client id> \
  npm run build
```

`CI=true` перетворює ворнінги ESLint на помилки — саме так падає прод-збірка.
Прогнати це локально дешевше, ніж чекати червоного CI.

## Змінні оточення

**`frontend/.env.local`** (CRA запікає все `REACT_APP_*` у бандл — секретів
там бути не може):

| Змінна | Навіщо |
|---|---|
| `REACT_APP_API_KEY_MAP` | ключ Google Maps JS API, обовʼязковий |
| `REACT_APP_API_KEY_AUTH` | OAuth client id для входу через Google |
| `REACT_APP_API_URL` | база API, дефолт — бойовий `https://api.navernyborshchu.com/api` |
| `REACT_APP_VARIANT` | дизайн-варіант, у проді `map1` |
| `REACT_APP_NAV` | арм нижньої навігації (`wide` / `compact`) |
| `REACT_APP_RATE_SCALE` | шкала оцінювання (`10` / `5`) |

**`backend/.env`**:

| Змінна | Навіщо |
|---|---|
| `DJANGO_SECRET_KEY` | підпис сесій і токенів |
| `DJANGO_DEBUG` | `False` у будь-якому середовищі, що дивиться назовні |
| `DJANGO_ALLOWED_HOSTS` | список хостів через кому |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` | PostgreSQL |
| `GOOGLE_OAUTH_CLIENT_IDS` | дозволені audience Google ID token, через кому |

## Часті граблі

- **Порожня мапа, у консолі `ApiNotActivatedMapError`** — не ввімкнено *Maps
  JavaScript API* у проєкті Google Cloud.
- **`POST /api/places/` віддає 400** — координати Google треба округлити до
  шести знаків (це робить `toStoredCoord()` у `src/api/index.js`), і місто не
  може бути порожнім.
- **Сторінка зумиться на iOS** — поле вводу з `font-size < 16px`. У
  `index.scss` для цього є floor.
- **`npm start` бачить стару змінну** — CRA читає `.env*` лише на старті;
  після правки перезапустіть dev-сервер.
