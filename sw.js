// Lets the app open with no signal. Only the app's own files and the PDF viewer library are cached here
// (no personal data: the timetable and progress are cached by the page itself in this device's storage,
// and examples papers the page has opened sit in the separate "tracker-papers" cache, which this file never deletes).
// Network first for the app, so a new version is picked up whenever you're online.
const CACHE = "tracker-shell-v4";
const LIB = "tracker-lib-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith("tracker-shell-") && k !== CACHE) || (k.startsWith("tracker-lib-") && k !== LIB)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === "https://cdnjs.cloudflare.com" && url.pathname.startsWith("/ajax/libs/pdf.js/")) {
    // versioned URLs never change: cache first, so the viewer works offline once it has been opened
    e.respondWith(caches.open(LIB).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;   // GitHub API, fonts: straight to network
  // "no-cache" revalidates with the server, so an update shows up straight away instead of after
  // GitHub Pages' 10-minute browser cache (a stale page with fresh data can show wrong counts)
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});

// Notifications from the checker on the laptop (Web Push; the message is decrypted by the browser).
self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "Tracker", {
    body: m.body || "", tag: m.tag || "pia-tracker", icon: "icon-192.png", badge: "icon-192.png", data: { url: m.url || "./?tab=updates" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ goTab: "updates" }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
