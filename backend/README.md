# backend

REST API проєкту — те, що стоїть за
[api.navernyborshchu.com](https://api.navernyborshchu.com).

Django 4.2 + DRF + SimpleJWT + PostgreSQL. Застосунок один — `core`.

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # DB_*, DJANGO_SECRET_KEY
python manage.py migrate
python manage.py runserver 8000

DJANGO_SETTINGS_MODULE=naverny_borschu_api.settings_test pytest   # тести на SQLite
```

Або одним рядком разом із базою: `docker compose up --build` у корені репозиторію.

- Довідник ендпоінтів — [../docs/api.md](../docs/api.md), схема — `openapi.yaml`.
- Моделі, агрегати оцінок і авторизація — [../docs/architecture.md](../docs/architecture.md).
- Корисна команда: `manage.py recalculate_borsch_ratings --dry-run` покаже
  борщі, у яких збережений рейтинг розʼїхався з відгуками.
