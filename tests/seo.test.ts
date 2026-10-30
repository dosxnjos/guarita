// SEO por rota (worker/seo.ts) e a injeção no HTML pelo _worker.js. No Node não há HTMLRewriter: o worker cai em
// applyMetaToHtml, que produz o mesmo resultado (a prova com o HTMLRewriter de verdade roda no workerd, à parte).
import { describe, expect, it } from 'vitest';
import worker from '../worker/index';
import type { Env } from '../worker/env';
import {
  FIXED_ES, FIXED_ROUTES, SITE, applyMetaToHtml, escapeHtml, headTags, itemIdFromPath, routeMeta, sitemapPaths, sitemapXml,
} from '../worker/seo';
import { HEALTH_BASKET } from '../worker/api/goldHealth';
import { readPublic } from './helpers/public';

// Cabeça igual à do index.html gerado pelo Vite (dist/index.html).
const INDEX_HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#16130f" />
    <meta name="description" content="Guarita: preços do Albion com idade e confiança, alertas no celular, relógio do servidor Americas em horário de Brasília e dossiê de jogador. Em português." />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <title>Guarita</title>
    <script type="module" crossorigin src="/assets/index-x.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;

const ORIGIN = 'https://guarita.local';
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

function fakeEnv(): Env & { hits: string[] } {
  const hits: string[] = [];
  const ASSETS = {
    async fetch(input: RequestInfo | URL) {
      const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
      hits.push(path);
      if (path === '/' || path === '/index.html') {
        return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"abc"', 'content-length': '999' } });
      }
      if (path === '/offline') return new Response('<html><head><title>Sem conexão · Guarita</title></head></html>', { headers: { 'content-type': 'text/html' } });
      const text = path.startsWith('/data/') ? readPublic(path) : null;
      if (text !== null) return new Response(text, { headers: { 'content-type': 'application/json' } });
      return new Response('not found', { status: 404 });
    },
  } as unknown as Fetcher;
  const none = {} as never;
  return { ASSETS, HUB: none, CORE: none, TIMERS: none, DISCORD_PUBLIC_KEY: '', DISCORD_APP_ID: '', DISCORD_BOT_TOKEN: '', VAPID_PUBLIC: '', hits };
}

async function page(path: string, init?: RequestInit) {
  const env = fakeEnv();
  const res = await worker.fetch(new Request(ORIGIN + path, init), env, ctx);
  return { res, html: await res.text(), env };
}

const titleOf = (html: string) => /<title>([\s\S]*?)<\/title>/.exec(html)?.[1];
const metaOf = (html: string, attr: string, key: string) => new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1];

describe('routeMeta', () => {
  it('rotas fixas repetem o título da tela', () => {
    expect(routeMeta('/perdas').title).toBe('Perdas no PvP · Guarita');
    expect(routeMeta('/permitido').title).toBe('Isso é permitido? · Guarita');
    expect(routeMeta('/relogio/').path).toBe('/relogio');
    expect(routeMeta('/').noindex).toBeFalsy();
  });

  it('item com nome resolvido vira título e canonical do item', () => {
    const m = routeMeta('/item/t4_bag', 'Bolsa do Adepto (T4)');
    expect(m.title).toBe('Bolsa do Adepto (T4) · Guarita');
    expect(m.path).toBe('/item/T4_BAG');
    expect(m.description).toContain('Bolsa do Adepto (T4)');
    expect(m.noindex).toBeFalsy();
  });

  it('item sem nome fica genérico e fora do buscador', () => {
    const m = routeMeta('/item/NAO_EXISTE', null);
    expect(m.title).toBe('Preço de item · Guarita');
    expect(m.noindex).toBe(true);
  });

  it('previsão de item usa o nome', () => {
    expect(routeMeta('/previsao/T4_BAG', 'Bolsa do Adepto (T4)').title).toBe('Previsão: Bolsa do Adepto (T4) · Guarita');
  });

  it('guilda mostra o nome da URL, sem indexar', () => {
    const m = routeMeta('/guilda/Os%20Bagres');
    expect(m.title).toBe('Os Bagres · Guilda · Guarita');
    expect(m.noindex).toBe(true);
    expect(routeMeta('/guilda/Ação%20Rápida%202').title).toBe('Ação Rápida 2 · Guilda · Guarita');
  });

  it('guilda: texto que não tem cara de nome de guilda não vai para a prévia do link', () => {
    for (const p of [
      '/guilda/Sorteio%20oficial%3A%2010M%20de%20prata%20em%20golpe.xyz',
      '/guilda/ganhe-prata.com',
      '/guilda/ab',
      `/guilda/${'A'.repeat(31)}`,
    ]) {
      const m = routeMeta(p);
      expect(m.title, p).toBe('Guilda · Guarita');
      expect(m.description, p).not.toMatch(/golpe|ganhe|AAAA/);
      expect(m.noindex).toBe(true);
    }
  });

  it('dossiê, autópsia, live e caminho desconhecido ficam fora do buscador', () => {
    expect(routeMeta('/jogador/abc').noindex).toBe(true);
    expect(routeMeta('/jogador/abc/morte').title).toBe('Autópsia · Guarita');
    expect(routeMeta('/live').noindex).toBe(true);
    const nf = routeMeta('/nada-aqui');
    expect(nf.title).toBe('Página não encontrada · Guarita');
    expect(nf.noindex).toBe(true);
  });

  it('URL malformada não quebra', () => {
    expect(() => routeMeta('/guilda/%E0%A4%A')).not.toThrow();
    expect(itemIdFromPath('/item/%E0%A4%A')).toBeNull();
  });

  it('itemIdFromPath', () => {
    expect(itemIdFromPath('/item/t4_bag@1')).toBe('T4_BAG@1');
    expect(itemIdFromPath('/previsao/T6_2H_BOW')).toBe('T6_2H_BOW');
    expect(itemIdFromPath('/item/<script>')).toBeNull();
    expect(itemIdFromPath('/perdas')).toBeNull();
  });
});

describe('injeção no HTML', () => {
  it('escapa texto vindo da URL', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    const html = applyMetaToHtml(INDEX_HTML, routeMeta('/guilda/%3Cscript%3E%22'));
    expect(html).not.toContain('<script>"');
    expect(titleOf(html)).toBe('Guilda · Guarita');
    // Mesmo um título com caractere especial (vindo de rota que aceita) sai escapado.
    const raw = applyMetaToHtml(INDEX_HTML, { title: `<b>"x"</b>`, description: 'd', path: '/x' });
    expect(titleOf(raw)).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });

  it('não duplica as tags se o HTML já tiver Open Graph', () => {
    const once = applyMetaToHtml(INDEX_HTML, routeMeta('/perdas'));
    const twice = applyMetaToHtml(once, routeMeta('/relogio'));
    expect(twice.match(/og:title/g)).toHaveLength(1);
    expect(twice.match(/rel="canonical"/g)).toHaveLength(1);
    expect(metaOf(twice, 'property', 'og:title')).toBe('Relógio do Americas · Guarita');
  });

  it('headTags traz imagem 1200×630 e robots só com noindex', () => {
    expect(headTags(routeMeta('/'))).toContain(`${SITE}/og.png`);
    expect(headTags(routeMeta('/'))).not.toContain('noindex');
    expect(headTags(routeMeta('/live'))).toContain('<meta name="robots" content="noindex" />');
  });
});

describe('_worker.js', () => {
  it('/item/T4_BAG sai com o título e a meta do item', async () => {
    const { res, html, env } = await page('/item/T4_BAG');
    expect(res.status).toBe(200);
    expect(titleOf(html)).toBe('Bolsa do Adepto (T4) · Guarita');
    expect(metaOf(html, 'property', 'og:title')).toBe('Bolsa do Adepto (T4) · Guarita');
    expect(metaOf(html, 'name', 'description')).toContain('Preço de Bolsa do Adepto (T4)');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/item/T4_BAG" />`);
    expect(html).toContain('<script type="module" crossorigin src="/assets/index-x.js"></script>');
    // Barato: só a fatia do tier, nunca o índice inteiro. A fatia fica em cache no módulo (insightsA.ts): este tem de
    // ser o primeiro teste a pedir um item T4, senão o ASSETS nem é chamado.
    expect(env.hits).toContain('/data/names/t4.json');
    expect(env.hits.some((h) => h.includes('items-index'))).toBe(false);
    expect(res.headers.get('etag')).toBeNull();
    expect(res.headers.get('content-length')).toBeNull();
  });

  it('id minúsculo com encantamento também resolve', async () => {
    const { html } = await page('/item/t4_bag@1');
    expect(titleOf(html)).toBe('Bolsa do Adepto (T4.1) · Guarita');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/item/T4_BAG@1" />`);
  });

  it('início e rota fixa', async () => {
    expect(titleOf((await page('/')).html)).toBe('Guarita: companheiro do Albion Online em português');
    expect(titleOf((await page('/perdas')).html)).toBe('Perdas no PvP · Guarita');
  });

  it('caminho desconhecido leva noindex', async () => {
    const { html } = await page('/nao-existe');
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });

  it('offline.html servida em /offline não é reescrita', async () => {
    expect(titleOf((await page('/offline')).html)).toBe('Sem conexão · Guarita');
  });

  it('HEAD e arquivo com extensão passam intactos', async () => {
    const head = await page('/', { method: 'HEAD' });
    expect(head.res.headers.get('etag')).toBe('"abc"');
    const missing = await page('/nao-tem.png');
    expect(missing.res.status).toBe(404);
  });

  it('/api/ continua com a API (não vira página)', async () => {
    const { res } = await page('/api/nao-existe');
    expect(res.headers.get('content-type') ?? '').toContain('json');
  });

  it('/sitemap.xml', async () => {
    const { res, html } = await page('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(html).toContain(`<loc>${SITE}/item/T4_BAG</loc>`);
    expect(html).toContain(`<loc>${SITE}/relogio</loc>`);
    expect(html).toContain(`<loc>${SITE}/es/relogio</loc>`);
    expect(html).toContain(`<loc>${SITE}/es/item/T4_BAG</loc><changefreq>hourly</changefreq>`);
  });

  it('página em português leva lang pt-BR, hreflang das duas línguas e canonical sem /es', async () => {
    const { html } = await page('/perdas');
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/perdas" />`);
    expect(html).toContain(`<link rel="alternate" hreflang="pt-BR" href="${SITE}/perdas" />`);
    expect(html).toContain(`<link rel="alternate" hreflang="es" href="${SITE}/es/perdas" />`);
    expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE}/perdas" />`);
    expect(metaOf(html, 'property', 'og:locale')).toBe('pt_BR');
  });

  it('/es/... serve o index.html em espanhol: lang es, título e descrição da tabela, canonical em /es', async () => {
    const { res, html, env } = await page('/es/perdas');
    expect(res.status).toBe(200);
    expect(env.hits).toContain('/index.html');
    expect(html).toContain('<html lang="es">');
    expect(titleOf(html)).toBe('Pérdidas en PvP · Guarita');
    expect(metaOf(html, 'name', 'description')).toContain('Los objetos que más se pierden');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/es/perdas" />`);
    expect(html).toContain(`<link rel="alternate" hreflang="pt-BR" href="${SITE}/perdas" />`);
    expect(html).toContain(`<link rel="alternate" hreflang="es" href="${SITE}/es/perdas" />`);
    expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE}/perdas" />`);
    expect(metaOf(html, 'property', 'og:locale')).toBe('es_LA');
    expect(html).toContain('<script type="module" crossorigin src="/assets/index-x.js"></script>');
  });

  it('/es e /es/ são o início em espanhol', async () => {
    for (const p of ['/es', '/es/']) {
      const { html } = await page(p);
      expect(titleOf(html), p).toBe('Guarita: compañero de Albion Online en español');
      expect(html, p).toContain(`<link rel="canonical" href="${SITE}/es" />`);
      expect(html, p).toContain(`<link rel="alternate" hreflang="pt-BR" href="${SITE}/" />`);
    }
  });

  it('/es/item/:id usa o nome em espanhol da fatia names-es do tier e mantém o canonical em /es', async () => {
    const { html, env } = await page('/es/item/t4_bag@2');
    expect(titleOf(html)).toBe('Bolsa del iniciado (T4.2) · Guarita');
    expect(metaOf(html, 'name', 'description')).toContain('Precio de Bolsa del iniciado (T4.2)');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/es/item/T4_BAG@2" />`);
    expect(env.hits).toContain('/data/names-es/t4.json');
    expect(env.hits.some((h) => h.includes('items-index'))).toBe(false);
  });

  it('caminho desconhecido em espanhol: noindex, título em espanhol e sem hreflang', async () => {
    const { html } = await page('/es/nao-existe');
    expect(titleOf(html)).toBe('Página no encontrada · Guarita');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('hreflang');
  });
});

describe('espanhol (routeMeta)', () => {
  it('toda rota fixa tem título e descrição em espanhol', () => {
    for (const [path] of FIXED_ROUTES) {
      const es = FIXED_ES[path];
      expect(es, path).toBeDefined();
      expect(routeMeta(localizedEs(path)).title, path).toBe(es[0]);
      expect(routeMeta(localizedEs(path)).locale).toBe('es');
    }
  });

  it('/estrada não é espanhol', () => {
    expect(routeMeta('/estrada').locale).toBe('pt');
    expect(routeMeta('/estrada').title).toBe('Página não encontrada · Guarita');
  });

  it('dinâmicas em espanhol continuam fora do buscador', () => {
    expect(routeMeta('/es/guilda/Os%20Bagres').title).toBe('Os Bagres · Gremio · Guarita');
    expect(routeMeta('/es/guilda/Os%20Bagres').noindex).toBe(true);
    expect(routeMeta('/es/jogador/abc').title).toBe('Dosier · Guarita');
    expect(routeMeta('/es/jogador/abc/morte').title).toBe('Autopsia · Guarita');
    expect(routeMeta('/es/live').noindex).toBe(true);
    expect(routeMeta('/es/previsao/T4_BAG', 'Bolsa do Adepto (T4)').title).toBe('Previsión: Bolsa do Adepto (T4) · Guarita');
    expect(routeMeta('/es/item/NAO_EXISTE', null).title).toBe('Precio de objeto · Guarita');
  });

  it('itemIdFromPath aceita o prefixo /es', () => {
    expect(itemIdFromPath('/es/item/t4_bag@1')).toBe('T4_BAG@1');
    expect(itemIdFromPath('/es/previsao/T6_2H_BOW')).toBe('T6_2H_BOW');
    expect(itemIdFromPath('/es/perdas')).toBeNull();
  });

  it('não duplica hreflang nem troca o lang duas vezes', () => {
    const once = applyMetaToHtml(INDEX_HTML, routeMeta('/es/perdas'));
    const twice = applyMetaToHtml(once, routeMeta('/relogio'));
    expect(twice.match(/hreflang="es"/g)).toHaveLength(1);
    expect(twice).toContain('<html lang="pt-BR">');
    expect(twice.match(/og:locale:alternate/g)).toHaveLength(1);
  });
});

const localizedEs = (p: string) => (p === '/' ? '/es' : `/es${p}`);

describe('sitemap', () => {
  it('rotas fixas indexáveis + itens populares, sem live nem rota dinâmica', () => {
    const paths = sitemapPaths();
    expect(paths).toContain('/');
    expect(paths).not.toContain('/live');
    expect(paths.filter((p) => p.startsWith('/item/'))).toHaveLength(new Set(HEALTH_BASKET).size);
    expect(paths.some((p) => p.startsWith('/jogador/') || p.startsWith('/guilda/'))).toBe(false);
    // Português e a cópia em espanhol (/es) de cada caminho.
    expect(paths.length).toBe(2 * (FIXED_ROUTES.length - 1 + new Set(HEALTH_BASKET).size));
  });

  it('cada caminho em português tem o par em /es, e /es não repete', () => {
    const paths = sitemapPaths();
    const pt = paths.filter((p) => !p.startsWith('/es'));
    const es = paths.filter((p) => p === '/es' || p.startsWith('/es/'));
    expect(es.length).toBe(pt.length);
    expect(es).toContain('/es');
    expect(es).toContain('/es/relogio');
    expect(es).toContain('/es/item/T4_BAG');
    expect(es).not.toContain('/es/live');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('XML válido e escapado', () => {
    const xml = sitemapXml(['T4_BAG', 'A&B']);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<loc>https://guarita.pages.dev/item/A%26B</loc>');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/);
  });
});

describe('arquivos públicos', () => {
  it('manifest com os atalhos Preço, Perdas, Relógio e Alertas', () => {
    const m = JSON.parse(readPublic('/manifest.webmanifest') ?? '{}') as { shortcuts: { short_name: string; url: string }[] };
    const names = m.shortcuts.map((s) => s.short_name);
    expect(names.slice(0, 4)).toEqual(['Preço', 'Perdas', 'Relógio', 'Alertas']);
    expect(m.shortcuts.every((s) => s.url.startsWith('/'))).toBe(true);
  });

  it('robots aponta o sitemap e fecha a API', () => {
    const r = readPublic('/robots.txt') ?? '';
    expect(r).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(r).toContain('Disallow: /api/');
  });

  it('service worker mantém o push e só trata navegação', () => {
    const sw = readPublic('/sw.js') ?? '';
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain("addEventListener('notificationclick'");
    expect(sw).toContain("req.mode !== 'navigate'");
    expect(sw).toContain("'/offline.html'");
  });

  it('offline.html é autocontida', () => {
    const html = readPublic('/offline.html') ?? '';
    expect(html).toContain('lang="pt-BR"');
    expect(html).not.toMatch(/<(?:link|script)[^>]+(?:href|src)=/);
  });
});
