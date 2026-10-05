// Guarda a "casca" do app para abrir offline. Os dados ficam no localStorage (app.js).
const CACHE = 'tanuki-v2';
const CASCA = ['./', 'index.html', 'app.js', 'style.css', 'config.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // API: direto na rede
  if (url.pathname.indexOf('/pedido-verao/') >= 0) return; // página dos clientes: nunca guardar cópia
  // rede primeiro (pega atualizações), cache se estiver sem internet
  e.respondWith(fetch(req).then(r => {
    const copia = r.clone();
    caches.open(CACHE).then(c => c.put(req, copia));
    return r;
  }).catch(() => caches.match(req).then(r => r || caches.match('./'))));
});
