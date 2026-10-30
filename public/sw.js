// Service worker da Guarita: notificações push e uma tela offline para navegação. Páginas, preços e /api/ nunca
// vêm do cache (para nunca mostrar preço velho): só quando a navegação falha por falta de rede é que sai a
// offline.html guardada na instalação. O corpo do push vem do motor de alertas do guarita-core: {title, body, url, tag}.

const SHELL_CACHE = 'guarita-shell-v1';
const OFFLINE_URL = '/offline.html';
const SHELL_FILES = [OFFLINE_URL, '/icons/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest'];

/** Cópia "limpa" da resposta: o Pages redireciona /offline.html → /offline, e resposta redirecionada não pode
 *  responder a uma navegação (o navegador recusa). */
async function cleanCopy(res) {
  const body = await res.blob();
  return new Response(body, { status: 200, headers: { 'content-type': res.headers.get('content-type') || 'text/html; charset=utf-8' } });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Um arquivo que falhar não impede a instalação (o push continua funcionando).
      await Promise.all(
        SHELL_FILES.map(async (path) => {
          try {
            const res = await fetch(path, { cache: 'reload' });
            if (res.ok) await cache.put(path, await cleanCopy(res));
          } catch {
            /* sem rede na instalação: tenta de novo na próxima versão do service worker */
          }
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('guarita-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Só navegação (abrir/recarregar página): rede primeiro, offline.html se a rede falhar. Nada mais passa por aqui.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
        return cached || new Response('Sem conexão com a internet.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })(),
  );
});

/** Só abre caminhos do próprio site (evita a notificação levar para fora). */
function safeUrl(raw) {
  try {
    const u = new URL(raw || '/alertas', self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL('/alertas', self.location.origin).href;
  } catch {
    return new URL('/alertas', self.location.origin).href;
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const options = {
    body: data.body || 'Um alerta de preço disparou.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'pt-BR',
    data: { url: safeUrl(data.url) },
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Guarita', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || safeUrl('/alertas');
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Já existe aba da Guarita: foca e navega até a página do alerta.
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if (client.url !== url && 'navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              /* aba não controlada: ao menos fica focada */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
