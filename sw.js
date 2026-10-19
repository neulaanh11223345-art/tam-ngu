// Service worker: lưu sẵn app để mở được khi không có mạng.
// Mã và dữ liệu: ưu tiên mạng (luôn lấy bản mới), mất mạng thì dùng bản đã lưu.
// Nét chữ và phông chữ: dùng bản đã lưu nếu có (nội dung không đổi).
const VERSION = 'han-lo-v4';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon-192.png',
  'data/words.json',
  'data/dialogues.json',
  'js/accounts.js',
  'js/config.js',
  'js/data.js',
  'js/dom.js',
  'js/host.js',
  'js/main.js',
  'js/pinyin.js',
  'js/pygen.js',
  'js/quiz.js',
  'js/speech.js',
  'js/srs.js',
  'js/store.js',
  'js/writer.js',
  'js/views/account.js',
  'js/views/common.js',
  'js/views/dialogue.js',
  'js/views/dialogues.js',
  'js/views/home.js',
  'js/views/lesson.js',
  'js/views/lessons.js',
  'js/views/login.js',
  'js/views/mine-edit.js',
  'js/views/practice.js',
  'js/views/quiz.js',
  'js/views/review.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'js/views/word.js',
  'js/views/write.js',
  'vendor/hanzi-writer.esm.js',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  network.catch(() => {});
  const cached = async () => (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl ? cache.match(fallbackUrl) : undefined);
  try {
    // mạng chậm quá thì dùng tạm bản đã lưu; chưa có bản lưu thì chờ tiếp
    const fast = await Promise.race([network, new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT, null))]);
    return fast || (await cached()) || (await network);
  } catch (e) {
    const hit = await cached();
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/data/strokes/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request, request.mode === 'navigate' ? 'index.html' : null));
});
