// PWA-UPDATE-SYSTEM v2: auto-update, version banner, Check for updates. Do not remove this line.
// Polysmith service worker.
// PWA-UPDATE-SYSTEM v2 notes:
// - One cache per release, named pwa::markplaga/Polysmith::<release>.
//   Cache Storage is origin-wide, so only caches under that exact
//   namespace are ever deleted, and only in activate, and only when
//   they are not the current release's cache. The legacy cache
//   (polysmith-v1) is deliberately RETAINED: it may still serve
//   clients on the old worker. The old worker deleted every other
//   cache on activate; this worker never does that.
// - Version-consistent shell: a navigation is served from this
//   release's own cache; the network is only a fallback and its
//   response is never written into this cache, so a new index.html
//   can never land in an old release's cache.
// - Only the precached shell files are ever served from cache.
//   Google Fonts are network-only and never cached. version.json is
//   never intercepted. Non-GET requests are never intercepted.
// - Help images are the one exception to "only precache populates
//   the cache": they are best-effort at install (a failure never
//   breaks installation) and are also cached lazily on first fetch,
//   as the old worker did. They are pictures, not executable shell,
//   so a newer image in an old release's cache cannot mix code.
// - localStorage / IndexedDB / saved settings, artwork and library
//   are never touched.
const RELEASE = '1.0.0-20261126-1';
const DISPLAY_VERSION = '1.0.0';
const NAMESPACE = 'pwa::markplaga/Polysmith::';
const CACHE = NAMESPACE + RELEASE;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/icon-180.png', 'icons/favicon-32.png',
  'help/index.html'
];
// Help images: optional. A failed fetch must not break installation.
const HELP_IMGS = [
  'help/img/acrylic.jpg', 'help/img/artwork-3d.jpg',
  'help/img/artwork.jpg', 'help/img/bevel-3d.jpg',
  'help/img/construction.jpg', 'help/img/cutouts.jpg',
  'help/img/cutsheet.jpg', 'help/img/explode.jpg',
  'help/img/finger.jpg', 'help/img/jig-3d.jpg',
  'help/img/jig-card.jpg', 'help/img/lamp.jpg',
  'help/img/material.jpg', 'help/img/net.jpg',
  'help/img/one-face.jpg', 'help/img/overview.jpg',
  'help/img/pattern-3d.jpg', 'help/img/size.jpg',
  'help/img/solid.jpg', 'help/img/stereo.jpg',
  'help/img/view-controls.jpg'
];
// Shell paths relative to the app base (the worker's scope). The
// worker lives at the app base, so a request path is the base path
// plus one of these; at the site root the base path is empty.
const SHELL_PATHS = new Set([
  '/', '/index.html', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/maskable-192.png', '/icons/maskable-512.png',
  '/icons/icon-180.png', '/icons/favicon-32.png',
  '/help/index.html'
].concat(HELP_IMGS.map(u => '/' + u)));

self.addEventListener('install', e => {
  // cache:'reload' skips the browser's HTTP cache, so a new version
  // never installs stale files. Install fails if any required shell
  // file is missing or does not belong to this release, so a broken
  // deploy can never replace the working release. Help images are
  // best-effort and never fail the install.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of SHELL) {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (!r.ok) throw new Error('precache failed: ' + u + ' ' + r.status);
      if (u === './' || u === 'index.html') {
        const text = await r.clone().text();
        if (!text.includes(RELEASE)) throw new Error('precache mismatch: ' + u + ' is not release ' + RELEASE);
      }
      await cache.put(u, r);
    }
    for (const u of HELP_IMGS) {
      try {
        const r = await fetch(new Request(u, { cache: 'reload' }));
        if (r.ok) await cache.put(u, r);
      } catch (err) { /* optional: help still works without its pictures */ }
    }
  })());
  // No skipWaiting here: the page asks the user first.
});

self.addEventListener('message', e => {
  const port = e.ports && e.ports[0];
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'GET_VERSION' && port) {
    port.postMessage({ release: RELEASE, displayVersion: DISPLAY_VERSION });
  }
  if (e.data && e.data.type === 'GET_CLIENTS' && port) {
    // includeUncontrolled: a waiting worker controls no clients yet,
    // but the pages it is about to take over are in its scope and
    // must be counted. Without this the count would always be 0.
    self.clients.matchAll({ includeUncontrolled: true })
      .then(cs => port.postMessage({ count: cs.length }));
  }
});

self.addEventListener('activate', e => {
  // Delete ONLY caches under this app's exact namespace that are not
  // the current release. Legacy caches outside the namespace are
  // retained on purpose (see header comment).
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(k => k.startsWith(NAMESPACE) && k !== CACHE)
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // The version file is always fetched live so update checks are
  // never fooled by a cache.
  if (url.origin === location.origin && url.pathname.endsWith('/version.json')) return;
  // Fonts are network-only: never cached, never intercepted.
  if (/fonts\.(googleapis|gstatic)\.com/.test(url.host)) return;
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      // Version-consistent shell: this release's own cached page
      // for the exact navigation (the app page, or the help page).
      const cached = await caches.match(req, { cacheName: CACHE });
      if (cached) return cached;
      // A navigation to /?anything still gets this release's app page.
      const appPage = await caches.match('./index.html', { cacheName: CACHE });
      try {
        // Network is a fallback only; the response is NOT cached,
        // so a newer page can never be written into this cache.
        return await fetch(req);
      } catch (err) {
        return appPage;
      }
    })());
    return;
  }

  // Same-origin static files: only the precached shell may be
  // served from cache. Anything else is left to the browser.
  // Accept the shell path with or without the app-base prefix.
  const stripped = url.pathname.replace(/^\/[^/]+(\/.*)$/, '$1');
  const shellPath = SHELL_PATHS.has(url.pathname) ? url.pathname
    : (SHELL_PATHS.has(stripped) ? stripped : null);
  if (!shellPath) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { cacheName: CACHE });
    if (cached) return cached;
    const res = await fetch(req);
    // Help images only: cache lazily on first fetch, as the old
    // worker did, so the help page works offline after one visit
    // even if an image missed the best-effort install precache.
    // Shell files are never written here: only this release's
    // precache populates the cache, at install time.
    if (res.ok && shellPath.indexOf('/help/img/') === 0) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  })());
});
