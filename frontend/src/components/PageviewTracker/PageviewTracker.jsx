import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageview } from '../../analytics';

/**
 * Перехід між маршрутами в SPA не перезавантажує документ, тож сам по собі
 * PostHog побачив би рівно один перегляд на весь візит. Шлемо $pageview на
 * кожну зміну маршруту, включно з першим рендером.
 *
 * Рахуємо лише зміну шляху, не рядка запиту. FilterUrlSync дописує в адресу
 * поточне місто одразу після монтування, і від кожного відкриття мапи в
 * даних з'являлось два перегляди за 30 мс — заміряно на map1. Зміна фільтра
 * взагалі не є переглядом сторінки; для неї є власна подія.
 */
export const PageviewTracker = () => {
  const location = useLocation();
  const lastPath = useRef(null);

  useEffect(() => {
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    trackPageview();
  }, [location.pathname]);

  return null;
};
