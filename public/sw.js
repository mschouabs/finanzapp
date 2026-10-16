/* Service worker mínimo: hace que FinanzApp se pueda instalar como app.
   No guarda nada en caché: todo sigue viniendo de la red, así los números
   siempre son los reales. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request))
})
