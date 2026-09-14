const CACHE_NAME = 'lohas-swallow-v3';

// 僅快取本機核心 App Shell 資源
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// 1. 安裝並寫入快取
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. 啟動並清理舊版本快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. 網絡請求攔截
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Firebase Realtime DB、Storage 上傳、Auth 與外部 CDN 放行，不予攔截
  if (
    url.includes('firebasedatabase.app') || 
    url.includes('googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('pagead2')
  ) {
    return;
  }

  // 核心靜態頁面走「快取優先，降級走網絡」
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
