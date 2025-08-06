const CACHE_NAME = 'sewmart-cache-v7';

const urlsToCache = [
  '/index.html',
  '/auth.html',
  '/clients.html',
  '/add-client.html',
  '/products.html',
  '/add-product.html',
  '/sales.html',
  '/add-sale.html',
  '/payments.html',
  '/add-payment.html',
  '/settings.html',
  '/manifest.json',
  '/css/sales.css',
  '/css/styles.css',
  '/css/date_footer.css',
  '/css/reports.css',
  '/css/settings.css',
  '/js/config.js',
  '/js/reports.js',
  '/js/categories.js',
  '/js/products.js',
  '/js/sales.js',
  '/js/dashboard.js',
  '/js/script.js',
  '/js/settings.js',
  '/js/date_footer.js',
  '/js/auth.js',
  '/js/backup.js',
  '/js/add-client.js',
  '/js/add-product.js',
  '/js/add-sale.js',
  '/js/clientManager.js',
  '/js/paymentManager.js',
  '/js/clients.js',
  '/database/Database.js',
  '/database/ProductsDB.js',
  '/database/SalesDB.js',
  '/database/CategoriesDB.js',
  '/database/SettingsDB.js',
  '/database/ClientsDB.js',
  '/database/PaymentsDB.js',
  '/database/SaleItemsDB.js',
  '/icon/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/libs/lucide/lucide.min.js',
  '/libs/sql.js/sql-wasm.js',
  '/libs/sql.js/sql-wasm.wasm',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;700&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/ar.js',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://apis.google.com/js/api.js'
];

const NETWORK_ONLY_DOMAINS = [
  'httpbin.org',
  'googleapis.com',
  'accounts.google.com',
  'drive.google.com',
  'https://oauth2.googleapis.com/token',
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
];

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[Service Worker] Caching files:', urlsToCache);
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
          console.log(`[Service Worker] Cached: ${url}`);
        } catch (err) {
          console.warn(`[Service Worker] Failed to cache ${url}:`, err);
        }
      }
    }).catch(err => {
      console.error('[Service Worker] Cache initialization failed:', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Check if the request belongs to network-only domains
  const isNetworkOnly = NETWORK_ONLY_DOMAINS.some(domain =>
    url.hostname.includes(domain)
  );

  // If it is, bypass the service worker
  if (isNetworkOnly) {
    return;
  }

  if (event.request.method !== 'GET') return;

  // External requests (non-exempt): Network-first + Cache fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(url.href, networkResponse.clone());
          return networkResponse;
        });
      }).catch(error => {
        console.error(`[Service Worker] Network fetch failed for ${url.href}:`, error);
        return caches.match(url.href).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          return new Response('📴 المورد غير متوفر في الوضع غير المتصل.', {
            status: 504,
            statusText: 'Gateway Timeout'
          });
        });
      })
    );
    return;
  }

  // Local requests: Cache-first + Network fallback
  event.respondWith(
    caches.match(url.pathname).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then(networkResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(url.pathname, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        return new Response('📴 المورد غير متوفر في الوضع غير المتصل.', {
          status: 504,
          statusText: 'Gateway Timeout'
        });
      });
    })
  );
});