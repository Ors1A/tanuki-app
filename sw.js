// Guarda a "casca" do app para abrir offline. Os dados ficam no localStorage (app.js).
const CACHE = 'tanuki-v10';
const CASCA = ['./', 'index.html', 'app.js', 'calc.js', 'style.css', 'config.js', 'lib/jspdf.umd.min.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

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
  // rede primeiro (pega atualizações, ignorando a cópia do navegador), cache se estiver sem internet
  e.respondWith(fetch(new Request(req, { cache: 'no-cache' })).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); } // erro (404/500) não entra no cache
    return r;
  }).catch(() => caches.match(req).then(r => r || caches.match('./'))));
});
