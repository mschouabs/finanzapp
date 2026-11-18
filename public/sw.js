/* Service worker mínimo: hace que FinanzApp se pueda instalar como app.
   No guarda nada en caché: todo sigue viniendo de la red, así los números
   siempre son los reales. Si no hay conexión, muestra un aviso claro en
   vez del error del navegador. */
const SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0E10;color:#F5F5F7;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center}
@media (prefers-color-scheme:light){body{background:#FAF5F2;color:#2B1A22}}p{opacity:.7;margin:.5em 0 1.5em}
button{font:inherit;font-weight:600;border:0;border-radius:12px;padding:12px 20px;background:currentColor}button span{color:#0E0E10}
@media (prefers-color-scheme:light){button span{color:#FAF5F2}}</style></head>
<body><main><h1 style="font-size:22px;margin:0">Sin conexión</h1><p>Tus datos están a salvo. Cuando vuelva internet, se cargan solos.</p>
<button onclick="location.reload()"><span>Reintentar</span></button></main>
<script>addEventListener('online',()=>location.reload())</script></body></html>`

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
  }
})

/* Al tocar una notificación: abrir la app en la pantalla que corresponde. */
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const href = (e.notification.data && e.notification.data.href) || '/dashboard'
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abiertas) { if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(href); return } }
    await self.clients.openWindow(href)
  })())
})
