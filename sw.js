// MoonCam service worker: network-first for the page and app code (so updates arrive on the
// next open), cache-first for heavy static assets (AI model, wasm, fonts). Works offline.
const CACHE = "mooncam-v5";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./css/app.css?v=5", "./js/app.js?v=5", "./js/engine.js", "./js/looks.js", "./js/fx.js",
  "./js/face.js", "./js/social.js", "./js/exif.js", "./js/camera.js", "./js/device.js", "./js/store.js", "./vendor/piexif.js", "./vendor/qrcode.js",
  "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const HEAVY = /\/vendor\/(mediapipe|models)\/|fonts\.(gstatic|googleapis)\.com|\/icons\//;
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !HEAVY.test(req.url)) return;
  if (HEAVY.test(req.url) || url.pathname.endsWith(".apk")) {
    if (url.pathname.endsWith(".apk")) return;
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; })));
    return;
  }
  e.respondWith(fetch(req, {cache: "no-store"}).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; })
    .catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))));
});
