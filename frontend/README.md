# frontend

React-застосунок мапи борщу — те, що видно на
[map.navernyborshchu.com](https://map.navernyborshchu.com).

Create React App 5 + React 19, SCSS-модулі, Google Maps JS API, власний i18n
(`uk` / `en`). Стан — у контекстах `src/context/`, весь HTTP — через
`src/api/index.js`.

```bash
cp .env.example .env.local     # щонайменше REACT_APP_API_KEY_MAP
npm ci
npm start                      # http://localhost:3000
CI=true npx react-scripts test --watchAll=false
```

Без ключа Google Maps мапа не відрендериться. Деталі, включно з роботою проти
бойового API без локальної бази, — [../docs/local-development.md](../docs/local-development.md).

Опис структури — [../docs/architecture.md](../docs/architecture.md).
