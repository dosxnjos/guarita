// Service worker da Guarita: só notificações push (sem cache de páginas, para nunca mostrar preço velho).
// O corpo do push vem do motor de alertas do guarita-core: {title, body, url, tag}.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
