import { useEffect } from 'react';

export function useOffline() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (import.meta.env.MODE === 'private') {
      // Private deployments require a live Access session on every request.
      // /sw.js retires old registrations, including on previously used devices.
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker
          .getRegistrations()
          .then(async (registrations) => {
            for (const registration of registrations) await registration.unregister();
            for (const key of await caches.keys()) {
              if (key.startsWith('kanto-offline-')) await caches.delete(key);
            }
          })
          .catch(() => {});
      }
      return;
    }
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    let registration: ServiceWorkerRegistration | undefined;
    const update = () => {
      if (!navigator.onLine) return;
      void registration?.update().catch(() => {});
      registration?.waiting?.postMessage({ type: 'ACTIVATE_TIMETABLE_WORKER' });
    };
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .then((value) => {
        registration = value;
        update();
      })
      .catch(() => {});
    const resume = () => {
      if (document.visibilityState === 'visible') update();
    };
    const timer = window.setInterval(update, 5 * 60_000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', update);
    };
  }, []);
}
