// Keeps the app shell on the device so it opens with no signal. The data
// itself is kept offline by Firestore's own cache, not by this file.
const CACHE = "tutor-shell-v54";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./logic.js",
               "./firebase-config.js", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  const shell = url.origin === self.location.origin;
  const sdk = url.hostname === "www.gstatic.com";
  if (!shell && !sdk) return;            // Firestore and sign in go straight out
  // Network first, so a new version shows up; the cache is the fallback.
  event.respondWith(
    fetch(event.request).then((answer) => {
      const copy = answer.clone();
      caches.open(CACHE).then((c) => c.put(event.request, copy));
      return answer;
    }).catch(() => caches.match(event.request))
  );
});
