// Keeps the app's own files on the phone so it opens quickly and works with a weak signal.
// League data is handled by Firebase's own offline cache, not by this file.
const VERSION = 'rgc-v61';
const SHELL = ['./', './index.html', './app.js', './config.js', './backend-firebase.js', './backend-mock.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first so updates arrive straight away; fall back to the saved copy offline.
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// Phone reminders sent through Firebase Cloud Messaging (round opens tomorrow, card not sent by 9pm).
self.addEventListener('push', e => {
  let j = {}; try { j = e.data ? e.data.json() : {}; } catch (_) { j = {data: {body: e.data ? e.data.text() : ''}}; }
  const n = Object.assign({}, j.data || {}, j.notification || {});
  const title = n.title || 'Pot of Gold';
  e.waitUntil(self.registration.showNotification(title, {body: n.body || '', icon: './icons/icon-192.png', badge: './icons/favicon.png', tag: n.tag || undefined, data: {url: n.url || './'}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    return open ? open.focus() : clients.openWindow(url);
  }));
});
