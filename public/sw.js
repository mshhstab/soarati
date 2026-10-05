// Service Worker: يخلي التطبيق يفتح بدون إنترنت
const CACHE = 'soarati-v2';
const ASSETS = [
  '/',
  '/foods.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a)))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return; // الـ API دائماً من الشبكة

  // الصفحة: من الشبكة أولاً عشان التحديثات توصل، وإذا ما فيه نت من الكاش
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  // قائمة الأكلات: من الكاش فوراً، ونحدّثها من الشبكة بالخلفية للمرة الجاية
  if (url.origin === location.origin && url.pathname === '/foods.js') {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match('/foods.js');
      const net = fetch(req).then((res) => {
        if (res.ok) c.put('/foods.js', res.clone());
        return res;
      });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
    return;
  }

  // باقي الملفات (الخطوط، المكتبة، الأيقونات): من الكاش أولاً
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
