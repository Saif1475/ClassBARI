// Offline support: app pages and files are cached as you use them, so notes and lessons
// you've opened still load on a weak or missing connection.
const CACHE = "edunest-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Built JS/CSS/fonts never change under the same URL: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  // Pages and everything else: network first, fall back to the last cached copy.
  e.respondWith(fetch(req).then((res) => put(req, res)).catch(() => caches.match(req).then((hit) => hit || caches.match("/"))));
});

function put(req, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

// Push notifications from teachers (class news, homework, results).
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    /* ignore malformed */
  }
  e.waitUntil(self.registration.showNotification(data.title || "Instanton Campus", { body: data.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: data.url || "/" } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      return open ? open.navigate(url).then((w) => w && w.focus()) : self.clients.openWindow(url);
    }),
  );
});
