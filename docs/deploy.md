# Деплой

Два сайти, дві гілки, один шлях у продакшн — і жодного іншого.

| Гілка | Сайт | Що це |
|---|---|---|
| `develop` | [map1.navernyborshchu.com](https://map1.navernyborshchu.com) | дев-сайт на реальних даних |
| `main` | [map.navernyborshchu.com](https://map.navernyborshchu.com) | продакшн |

Бекенд їде окремо: `main` → [api.navernyborshchu.com](https://api.navernyborshchu.com).

Робота лягає в `develop` і одразу видима на map1. Промоушн у прод — це PR
`develop → main` з людським апрувом і зеленим чеком. `main` захищений: без
прямих пушів, без force-push, без видалення, і правило діє на адміністраторів
теж.

## Фронтенд: артефакт, а не чекаут

`.github/workflows/frontend.yml` — єдине, що може змінити будь-який із двох
сайтів.

1. Actions ставить залежності, ганяє тести й збирає з `CI=true` (ворнінг =
   помилка), з прапорцями, вирішеними з імені гілки.
2. Перевіряє, що артефакт узгоджений: `index.html` існує і бандл, на який він
   посилається, справді лежить поруч.
3. Пакує `build/` і POST-ить тарбол на `/deploy-webhook`, підписуючи HMAC над
   `ref + sha + run_id + sha256(body) + repo`.
4. Приймач на сервері (`deploy/frontend-receiver.js`) звіряє підпис, відкидає
   будь-який ref, крім `main` і `develop`, розпаковує в
   `/var/www/nb-map{,1}/releases/<sha>-<stamp>`, ще раз валідує дерево й
   атомарно перекидає симлінк `current`.
5. Actions робить димову перевірку живого хоста й валить ран, якщо сайт або
   його бандл не віддають 200.

### Чому docroot — не git-чекаут

Колись був. nginx віддавав `build/` просто з робочої копії, тому `npm run
build` у ній **і був** деплоєм — без PR, без рев'ю, без Actions, без сліду.

20 серпня 2026 саме це й сталося: локальна правка `package.json` перевела
`npm run build` на переписану з нуля апку на Vite/Leaflet, і прод став іншим
застосунком. Правку ніхто не мерджив — це був PR, який два тижні лежав
відкритим, поки його ефект стояв у продакшні.

Тепер у зібраного фронтенду немає жодного маршруту в прод. Перевіряється
руками:

```bash
echo hi > <чекаут>/frontend/build/canary.txt
curl -s https://map.navernyborshchu.com/canary.txt   # віддасть index.html, не "hi"
```

### Відкат

Деплой — це перекидання симлінка, тож і відкат теж:

```bash
ls /var/www/nb-map/releases/                       # зберігаються останні 5
ln -sfn /var/www/nb-map/releases/<старіший> /var/www/nb-map/current
```

Без перезбірки й без даунтайму. Далі — фікс уперед через PR: наступний деплой
із `main` перепише симлінк.

## Бекенд: чекаут, який оновлює себе

`.github/workflows/backend.yml` ганяє `pytest` і на `main` б'є в
`https://api.navernyborshchu.com/deploy-webhook`, підписавши payload HMAC.
Приймач (`deploy/backend-webhook.js`) робить на сервері:

```
git fetch && git reset --hard origin/main
pip install -r requirements.txt
manage.py migrate --noinput
manage.py collectstatic --noinput
rsync staticfiles/ → /var/www/navernyborshchu/photos/staticfiles/
systemctl --user restart naverny-borschu-api.service
```

Далі workflow перевіряє живий API — і не лише код 200: порожній список теж
віддає 200, тому перевірка вимагає, щоб `count > 0`.

⚠️ `git reset --hard` означає, що **будь-яка локальна правка в чекауті
злітає** з наступним деплоєм. Сервер — не місце для редагування коду.
Завантажені фото (`backend/media/`) і `venv/` не відстежуються git, тому
переживають reset.

### Відкат бекенду

Відкату одним рухом немає: міграції вже застосовані. Порядок — зробити
revert-коміт у `main` і дати конвеєру прокотити його; якщо винна міграція,
спершу `manage.py migrate core <попередній_номер>` на сервері.

## Секрети й змінні CI

| Ім'я | Тип | Де живе |
|---|---|---|
| `WEBHOOK_SECRET` | secret | спільний із приймачами на сервері |
| `REACT_APP_API_KEY_MAP` | variable | ключ Google Maps, потрапляє в публічний бандл |
| `REACT_APP_API_KEY_AUTH` | variable | OAuth client id, теж публічний |

Два ключі Google — саме **variables**, а не secrets, і це свідомо: CRA запікає
їх у бандл, який завантажує кожен браузер. Ховати їх немає сенсу. Єдиний
робочий захист — **обмеження за HTTP-реферером і за переліком API в Google
Cloud Console**. Необмежений ключ у публічному бандлі означає, що рахунок за
Google Maps може виписати вам будь-хто.

## Файли в `deploy/`

Довідкові копії того, що крутиться на сервері. Це не автодеплой: сервер
запускає свої копії, і при зміні цих файлів їх треба покласти на місце руками
(шлях — у коментарі всередині кожного файлу).
