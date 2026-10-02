// Service worker for Web Push (VAPID).

// CPMS is mounted under a sub-path (/cpms) of a site it shares with the main
// CBRL pages, and this file is static — it never goes through the bundler, so
// NEXT_PUBLIC_BASE_PATH is not available here. `registration.scope` is the
// absolute URL the worker was registered for (".../cpms/"), so resolving
// against it keeps links inside the app without hardcoding the mount point.
//
// Leading slashes are stripped first: a root-absolute "/attendance" would
// resolve against the origin and send the user to the main CBRL site.
//
// An absolute URL in a payload would still win over the scope, so anything
// that resolves off this origin falls back to the attendance screen: a click
// on a CPMS notification only ever opens CPMS.
function appUrl(path) {
  const scope = self.registration.scope;
  const url = new URL(String(path).replace(/^\/+/, ''), scope);
  if (url.origin !== new URL(scope).origin) return new URL('attendance', scope).href;
  return url.href;
}

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: appUrl('favicon.png'),
    badge: appUrl('favicon.png'),
    tag: data.tag,
    data: { url: appUrl(data.url || 'attendance') },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || appUrl('attendance');
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.navigate(url); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
