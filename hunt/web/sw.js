// 弓猎 PWA Service Worker —— cache-first + 后台刷新(stale-while-revalidate)
// 资源均为静态文件, 离线可直接玩; 有网络时静默更新缓存, 下次加载生效。
const CACHE = 'gonglie-html5-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.png',
  './apple-touch-icon.png',
  './src/main.js',
  './src/config.js',
  './src/sphere.js',
  './src/world.js',
  './src/entities.js',
  './src/input.js',
  './src/touchui.js',
  './src/ui.js',
  './lib/three.module.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
