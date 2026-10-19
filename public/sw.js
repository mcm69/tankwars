// Offline support: the game is a handful of static files, so cache them as they're fetched.
// Pages are network-first (new versions show up right away when online); hashed assets are
// cache-first. Bump CACHE to drop everything cached by older versions.
const CACHE = 'tankwars-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          './',
          './index.html',
          './manifest.webmanifest',
          './icon.svg',
          './icon-192.png',
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const save = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  };
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(save)
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html'))),
    );
  } else {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then(save)));
  }
});
