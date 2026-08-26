// 弓猎 — 离线 Service Worker（手写兜底，不依赖 Godot 内置 PWA）
//
// 关键修复（v3）：此前缓存名写死 `gonghunt-v2` 且对 html/js 走 cache-first，
// 重导出后浏览器仍取老缓存 → 用户永远看不到新版本（中文/WASD 修复“不生效”）。
// 现改为【network-first + 离线回退缓存】，并保证缓存名随版本变更自动失效：
//   每次修改本文件（含 CACHE 常量）后重新部署，浏览器检测到 SW 字节变化即安装新版，
//   activate 阶段删除旧缓存，用户下次访问必然拿到最新文件。
const CACHE = 'gonghunt-v3';
const PRECACHE = [
  'index.html',
  'gh-manifest.webmanifest',
  'index.js',
  'index.png',
  'index.icon.png',
  'index.apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first：优先拿线上最新文件（保证重部署即时生效）；
// 仅在离线/网络失败时回退到已缓存副本，保证断网仍可玩。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 只处理同源资源
  e.respondWith((async () => {
    try {
      const resp = await fetch(e.request);
      if (resp && resp.status === 200) {
        const c = await caches.open(CACHE);
        c.put(e.request, resp.clone());
      }
      return resp;
    } catch (err) {
      const c = await caches.open(CACHE);
      const cached = await c.match(e.request);
      return cached || Response.error();
    }
  })());
});
