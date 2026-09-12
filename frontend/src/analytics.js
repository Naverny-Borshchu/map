// Повна збірка, не «slim». Slim важить на 46 кБ gzip менше, але вона не
// просто відкладає автозахоплення кліків, запис сесій і теплокарти — вона їх
// не має взагалі й нічого не підвантажує. Перевірено живою сесією на map1:
// зі slim у проєкт приходили самі лише $pageview.
import posthog from 'posthog-js';

/**
 * Аналітика (PostHog).
 *
 * Ключ проєкту публічний — це write-only токен, який однаково їде в бандлі до
 * кожного браузера, тож тримати його в репозиторії безпечно; секретом тут є
 * лише особистий API-ключ, якого в фронтенді нема.
 *
 * Інжест іде не на posthog.com, а на наш власний шлях /kastrulia/ (nginx
 * проксює його далі). Причина проста: блокувальники реклами ріжуть запити на
 * домени аналітики за назвою, і без проксі частина візитів просто не існує
 * в даних. Шлях навмисно не схожий на «аналітику» з тієї ж причини.
 */
const KEY = process.env.REACT_APP_POSTHOG_KEY;

// map і map1 шлють в один проєкт. Щоб дашборди прода не рахували наші ж
// перевірки на map1, кожна подія несе `site`, а фільтр внутрішніх юзерів
// у PostHog відкидає map1.
const SITE = process.env.REACT_APP_SITE || 'map';

const apiHost = () =>
  process.env.REACT_APP_POSTHOG_HOST ||
  `${window.location.origin}/kastrulia`;

let ready = false;

/** Викликається один раз зі src/index.js. Без ключа — повний no-op. */
export function initAnalytics() {
  if (ready || !KEY) return;

  posthog.init(KEY, {
    api_host: apiHost(),
    // Посилання «відкрити в PostHog» з тулбара мають вести на сам PostHog,
    // а не на наш проксі.
    ui_host: 'https://eu.posthog.com',
    // Переглядів сторінок SDK сам не рахує: у SPA перехід між маршрутами не
    // перезавантажує документ, тож $pageview шлемо вручну з App.js.
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'always',
    // Одна людина, яка прийшла з лендінгу в апку, має лишитись однією людиною:
    // кука живе на домені другого рівня.
    cross_subdomain_cookie: true,
    persistence: 'localStorage+cookie',
    // Політика приватності обіцяє, що сигнал Do Not Track ми поважаємо —
    // за замовчуванням SDK на нього не дивиться.
    respect_dnt: true,
    session_recording: {
      maskAllInputs: true,
    },
  });

  posthog.register({ site: SITE });
  ready = true;
}

/** Подія продукту. Мовчки нічого не робить, поки аналітика не піднялась. */
export function track(event, properties) {
  if (!ready) return;
  posthog.capture(event, properties);
}

/** Перегляд сторінки — окремо, бо його шле роутер, а не код фічі. */
export function trackPageview() {
  if (!ready) return;
  posthog.capture('$pageview');
}

/**
 * Привʼязати події до акаунта. Викликати лише там, де вхід реально стався:
 * identify з випадковим id склеїть чужі сесії в одну людину.
 */
export function identifyUser(user) {
  if (!ready || !user) return;
  const id = user.id ?? user.pk ?? user.user_id ?? user.email;
  if (!id) return;

  posthog.identify(String(id), {
    email: user.email || undefined,
    name: user.name || user.full_name || user.username || undefined,
  });
}

/** Вихід з акаунта: далі це вже інша (анонімна) людина. */
export function resetAnalytics() {
  if (!ready) return;
  posthog.reset();
}
