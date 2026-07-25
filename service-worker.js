const CACHE_NAME = 'lohas-swallow-v2';

// 需要快取的核心靜態檔案清單
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5403745127757660'
];

// 1. 安裝 Service Worker 並寫入 Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] 快取 App Shell 核心資源');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. 啟動 Service Worker 並清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] 清除舊版快取:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. 攔截網路請求：Firebase 實時數據走 Network First，靜態資源走 Cache First
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Firebase Realtime DB 與 Storage 請求走網絡優先
  if (url.includes('firebasedatabase.app') || url.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    // 靜態 UI 資源走快取優先
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
