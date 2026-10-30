// SEO por rota: título, descrição, Open Graph e Twitter Card injetados no index.html pelo _worker.js, para a prévia
// de link (Discord, WhatsApp) e o buscador verem a página certa sem rodar o JavaScript do front.
// - Tabela espelha src/lib/router.ts; os títulos repetem o document.title de cada tela (sem pular na troca).
// - /item/:id e /previsao/:id: nome do item pela fatia names/t<tier>.json lida como texto (labelsFor), nunca o
//   items-index.json inteiro nem JSON.parse da fatia (CPU do plano grátis, ver docs/ARMADILHAS.md § Cloudflare).
// - No Workers usa HTMLRewriter (streaming); fora dele (vitest no Node) cai em applyMetaToHtml, com o mesmo resultado.
// - Línguas: /es/... é a mesma tela em espanhol (src/lib/i18n). Título e descrição de FIXED_ES, <html lang>,
//   og:locale, canonical na própria língua e <link rel="alternate" hreflang> (pt-BR, es, x-default = pt) nas duas.
//   Os títulos em espanhol de FIXED_ES são os mesmos que cada tela põe no document.title com tx().
import type { Env } from './env';
import { labelFromShardText, labelsFor } from './api/insightsA';
import { HEALTH_BASKET } from './api/goldHealth';
import { htmlLangFor, localeFromPath, localizePath, stripLocale, type Locale } from '../src/lib/i18n/core';

/** Endereço público usado no canonical, no og:url, no og:image e no sitemap. */
export const SITE = 'https://guarita.pages.dev';
export const OG_IMAGE = `${SITE}/og.png`;
const SUFFIX = ' · Guarita';
/** Cara de nome de guilda do Albion: letras (com acento), dígitos e espaço, de 3 a 30. Sem ponto, barra ou dois-pontos. */
const GUILD_NAME = /^[\p{L}\p{N} ]{3,30}$/u;

export interface PageMeta {
  title: string;
  description: string;
  /** Caminho canônico (começa com /). */
  path: string;
  /** Página que não deve ir para o buscador (dinâmica, pessoal, OBS ou inexistente). */
  noindex?: boolean;
  /** Língua da página (padrão pt). O `path` já vem com o prefixo /es quando é espanhol. */
  locale?: Locale;
}

const DEFAULT_DESCRIPTION =
  'Guarita: preços do Albion Online com idade e confiança, alertas no celular, relógio do servidor Americas em horário de Brasília e dossiê de jogador. Em português.';
const DEFAULT_DESCRIPTION_ES =
  'Guarita: precios de Albion Online con antigüedad y confianza, alertas en el celular, reloj del servidor Americas en horario de Brasilia y dosier de jugador. En español.';

type Fixed = [path: string, title: string, description: string, opts?: { noindex?: boolean; sitemap?: false }];

/** Rotas fixas: caminho, título (igual ao document.title da tela), descrição. */
export const FIXED_ROUTES: readonly Fixed[] = [
  ['/', 'Guarita: companheiro do Albion Online em português', DEFAULT_DESCRIPTION],
  ['/relogio', 'Relógio do Americas · Guarita', 'Hora do servidor Americas do Albion Online em horário de Brasília, reset diário, festividades e status do servidor.'],
  ['/janela', 'Janela flutuante · Guarita', 'Preço e relógio do Albion numa janela pequena por cima do jogo, sem instalar nada.'],
  ['/jogador', 'Dossiê de jogador · Guarita', 'Busque um jogador do Albion Online (Americas) e veja fama, kills e mortes recentes e o equipamento usado, pelo killboard público.'],
  ['/alertas', 'Alertas · Guarita', 'Avisos no celular ou no Discord quando o preço de um item do Albion passa do valor que você escolheu.'],
  ['/apoie', 'Apoie · Guarita', 'Como ajudar a manter a Guarita no ar: projeto gratuito, de código aberto, feito para o jogador brasileiro de Albion.'],
  ['/permitido', 'Isso é permitido? · Guarita', 'O que a Guarita faz e o que ela nunca faz, de acordo com os Termos da Sandbox Interactive para ferramentas de terceiros.'],
  ['/mais', 'Tudo o que a Guarita faz · Guarita', 'Todas as ferramentas da Guarita para Albion Online: mercado, PvP, guildas, novato, relógio, alertas, app para PC e extensão.'],
  ['/perdas', 'Perdas no PvP · Guarita', 'Os itens que mais caem nas mortes de PvP do Albion Online (Americas) e quanto custam para repor.'],
  ['/guilda', 'Guildas · Guarita', 'Busque uma guilda do Albion Online (Americas) e veja kills, mortes, armas e horários de atividade.'],
  ['/arriscar', 'Quanto vale arriscar · Guarita', 'Calcule quanto custa o equipamento que você leva para a zona vermelha ou preta do Albion e quanto pode perder.'],
  ['/golpes', 'Golpes comuns · Guarita', 'Os golpes mais comuns no Albion Online e como se proteger, explicados para quem está começando.'],
  ['/glossario', 'Glossário · Guarita', 'Termos e siglas do Albion Online explicados em português: zonas, mercado, PvP e economia.'],
  ['/ouro', 'Ouro e Premium · Guarita', 'Preço do ouro em prata no Albion Online (Americas), histórico de 90 dias e quanto custa o Premium hoje.'],
  ['/saude', 'Saúde do dado · Guarita', 'Quão recente é o preço de cada cidade no Albion Online Data Project: transparência sobre a fonte dos preços da Guarita.'],
  ['/mcp', 'Guarita no seu assistente de IA · Guarita', 'Ligue a Guarita ao seu assistente de IA pelo protocolo MCP e pergunte preços e informações do Albion em português.'],
  ['/despertador', 'Despertador · Guarita', 'Avisos no celular quando a colheita da ilha ou o foco do Albion ficarem prontos.'],
  ['/app', 'App para PC · Guarita', 'App gratuito da Guarita para Windows: janelas soltas, atalhos e avisos locais, sem tocar no jogo.'],
  ['/hoje', 'O que fazer hoje · Guarita', 'Três caminhos para ganhar prata hoje no Albion Online, com o capital e o tempo que você tem e a conta aberta.'],
  ['/previsao', 'Previsão de preço · Guarita', 'Previsão de preço de itens do Albion Online para os próximos dias, com o acerto do modelo publicado.'],
  ['/live', 'Painel de live · Guarita', 'Painel com relógio, preços e killfeed para usar como fonte de navegador no OBS.', { noindex: true, sitemap: false }],
  ['/extensao', 'Extensão de navegador · Guarita', 'Extensão da Guarita para Chrome, Edge e Firefox: nome em português e preço do item ao passar o mouse nos sites de Albion.'],
  ['/status', 'Status e custos · Guarita', 'Quanto custa manter a Guarita no ar, os limites do plano grátis da Cloudflare, de onde vem cada dado e a saúde ao vivo do site.'],
];

const FIXED = new Map(FIXED_ROUTES.map((r) => [r[0], r]));

/**
 * Mesmas rotas fixas em espanhol (/es + caminho): título (igual ao document.title da tela em espanhol) e descrição.
 * Toda rota de FIXED_ROUTES tem par aqui (conferido em tests/seo.test.ts); sem par, cai no português.
 */
export const FIXED_ES: Readonly<Record<string, readonly [title: string, description: string]>> = {
  '/': ['Guarita: compañero de Albion Online en español', DEFAULT_DESCRIPTION_ES],
  '/relogio': ['Reloj de Americas · Guarita', 'Hora del servidor Americas de Albion Online en horario de Brasilia, reinicio diario, festividades y estado del servidor.'],
  '/janela': ['Ventana flotante · Guarita', 'Precio y reloj de Albion en una ventana pequeña encima del juego, sin instalar nada.'],
  '/jogador': ['Dosier de jugador · Guarita', 'Busca un jugador de Albion Online (Americas) y mira su fama, asesinatos y muertes recientes y el equipo que usa, según el killboard público.'],
  '/alertas': ['Alertas · Guarita', 'Avisos en el celular o en Discord cuando el precio de un objeto de Albion pasa del valor que elegiste.'],
  '/apoie': ['Apoya · Guarita', 'Cómo ayudar a mantener la Guarita en línea: proyecto gratuito y de código abierto, hecho para los jugadores de Albion.'],
  '/permitido': ['¿Esto está permitido? · Guarita', 'Lo que la Guarita hace y lo que nunca hace, según los Términos de Sandbox Interactive para herramientas de terceros.'],
  '/mais': ['Todo lo que hace la Guarita · Guarita', 'Todas las herramientas de la Guarita para Albion Online: mercado, PvP, gremios, novatos, reloj, alertas, app para PC y extensión.'],
  '/perdas': ['Pérdidas en PvP · Guarita', 'Los objetos que más se pierden en las muertes de PvP de Albion Online (Americas) y cuánto cuesta reponerlos.'],
  '/guilda': ['Gremios · Guarita', 'Busca un gremio de Albion Online (Americas) y mira asesinatos, muertes, armas y horarios de actividad.'],
  '/arriscar': ['Cuánto vale arriesgar · Guarita', 'Calcula cuánto cuesta el equipo que llevas a la zona roja o negra de Albion y cuánto puedes perder.'],
  '/golpes': ['Estafas comunes · Guarita', 'Las estafas más comunes en Albion Online y cómo protegerte, explicadas para quien está empezando.'],
  '/glossario': ['Glosario · Guarita', 'Términos y siglas de Albion Online explicados en español: zonas, mercado, PvP y economía.'],
  '/ouro': ['Oro y Premium · Guarita', 'Precio del oro en plata en Albion Online (Americas), historial de 90 días y cuánto cuesta el Premium hoy.'],
  '/saude': ['Salud de los datos · Guarita', 'Qué tan reciente es el precio de cada ciudad en el Albion Online Data Project: transparencia sobre la fuente de los precios de la Guarita.'],
  '/mcp': ['La Guarita en tu asistente de IA · Guarita', 'Conecta la Guarita a tu asistente de IA con el protocolo MCP y pregunta precios e información de Albion.'],
  '/despertador': ['Despertador · Guarita', 'Avisos en el celular cuando la cosecha de la isla o el foco de Albion estén listos.'],
  '/app': ['App para PC · Guarita', 'App gratuita de la Guarita para Windows: ventanas sueltas, atajos y avisos locales, sin tocar el juego.'],
  '/hoje': ['Qué hacer hoy · Guarita', 'Tres caminos para ganar plata hoy en Albion Online, con el capital y el tiempo que tienes y el cálculo a la vista.'],
  '/previsao': ['Previsión de precios · Guarita', 'Previsión de precios de objetos de Albion Online para los próximos días, con el acierto del modelo publicado.'],
  '/live': ['Panel para directos · Guarita', 'Panel con reloj, precios y killfeed para usar como fuente de navegador en OBS.'],
  '/extensao': ['Extensión de navegador · Guarita', 'Extensión de la Guarita para Chrome, Edge y Firefox: nombre del objeto en español y precio al pasar el mouse en los sitios de Albion.'],
  '/status': ['Estado y costos · Guarita', 'Cuánto cuesta mantener la Guarita en línea, los límites del plan gratuito de Cloudflare, de dónde viene cada dato y la salud en vivo del sitio.'],
};

/** Escapa texto para HTML/XML (conteúdo e atributo). Pura. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Id no caminho como o site usa (T4_BAG@1, com o @ sem codificar, igual ao link compartilhado). Pura. */
export function idPath(id: string): string {
  return encodeURIComponent(id).replace(/%40/g, '@');
}

/** Id de item pedido na URL (/item/:id ou /previsao/:id, também com /es na frente), em maiúsculas, ou null. Pura. */
export function itemIdFromPath(pathname: string): string | null {
  const m = /^\/(?:item|previsao)\/([^/]+)$/.exec(stripLocale(pathname));
  if (!m) return null;
  const id = safeDecode(m[1]).trim().toUpperCase();
  return /^[A-Z0-9_@]{2,80}$/.test(id) ? id : null;
}

/**
 * Meta da página para o caminho. `itemLabel` é o nome PT-BR já resolvido para /item/:id e /previsao/:id
 * (null = não achou). Pura.
 */
export function routeMeta(pathname: string, itemLabel: string | null = null): PageMeta {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const locale = localeFromPath(trimmed);
  const meta = baseRouteMeta(stripLocale(trimmed), itemLabel, locale);
  return { ...meta, path: localizePath(meta.path, locale), locale };
}

/** Meta para o caminho SEM o prefixo de língua (o path devolvido também sai sem). */
function baseRouteMeta(path: string, itemLabel: string | null, loc: Locale): PageMeta {
  const E = loc === 'es';
  const defaultDescription = E ? DEFAULT_DESCRIPTION_ES : DEFAULT_DESCRIPTION;
  const fixed = FIXED.get(path);
  if (fixed) {
    const es = E ? FIXED_ES[path] : undefined;
    return { title: es?.[0] ?? fixed[1], description: es?.[1] ?? fixed[2], path, noindex: fixed[3]?.noindex };
  }

  let m = /^\/item\/([^/]+)$/.exec(path);
  if (m) {
    const id = itemIdFromPath(path);
    if (id && itemLabel) {
      return {
        title: `${itemLabel}${SUFFIX}`,
        description: E
          ? `Precio de ${itemLabel} en Albion Online (servidor Americas): compra y venta en cada ciudad, con la antigüedad del dato y el sello de confianza.`
          : `Preço de ${itemLabel} no Albion Online (servidor Americas): compra e venda em cada cidade, com a idade do dado e o selo de confiança.`,
        path: `/item/${idPath(id)}`,
      };
    }
    return { title: E ? `Precio de objeto${SUFFIX}` : `Preço de item${SUFFIX}`, description: defaultDescription, path, noindex: true };
  }

  m = /^\/previsao\/([^/]+)$/.exec(path);
  if (m) {
    const id = itemIdFromPath(path);
    if (id && itemLabel) {
      return {
        title: E ? `Previsión: ${itemLabel}${SUFFIX}` : `Previsão: ${itemLabel}${SUFFIX}`,
        description: E
          ? `Previsión de precio de ${itemLabel} en Albion Online (Americas) para los próximos días, con rango de incertidumbre y el acierto del modelo publicado.`
          : `Previsão de preço de ${itemLabel} no Albion Online (Americas) para os próximos dias, com faixa de incerteza e o acerto do modelo publicado.`,
        path: `/previsao/${idPath(id)}`,
      };
    }
    return { title: E ? `Previsión de precios${SUFFIX}` : `Previsão de preço${SUFFIX}`, description: defaultDescription, path, noindex: true };
  }

  m = /^\/guilda\/([^/]+)$/.exec(path);
  if (m) {
    // Nome vem da URL sem conferência: só entra na prévia se tiver cara de nome de guilda do Albion (letras,
    // dígitos e espaço, 3 a 30). Fora disso, título genérico: "Sorteio oficial em golpe.xyz" não vira cartão com a
    // marca da Guarita. E buscador nunca (evita indexar nome inventado).
    const raw = safeDecode(m[1]).trim();
    const name = GUILD_NAME.test(raw) ? raw : '';
    const word = E ? 'Gremio' : 'Guilda';
    return {
      title: name ? `${name} · ${word}${SUFFIX}` : `${word}${SUFFIX}`,
      description: E
        ? `Asesinatos, muertes, armas más usadas y horarios del gremio${name ? ` ${name}` : ''} en Albion Online (Americas), según el killboard público.`
        : `Kills, mortes, armas mais usadas e horários da guilda${name ? ` ${name}` : ''} no Albion Online (Americas), pelo killboard público.`,
      path,
      noindex: true,
    };
  }

  if (/^\/jogador\/[^/]+\/morte$/.test(path)) {
    return E
      ? { title: `Autopsia${SUFFIX}`, description: 'Qué mató al jugador en su última muerte, el equipo perdido y cuánto cuesta reponerlo, en Albion Online (Americas).', path, noindex: true }
      : { title: `Autópsia${SUFFIX}`, description: 'O que matou o jogador na última morte, o equipamento perdido e quanto custa repor, no Albion Online (Americas).', path, noindex: true };
  }
  if (/^\/jogador\/[^/]+$/.test(path)) {
    return E
      ? { title: `Dosier${SUFFIX}`, description: 'Fama, asesinatos y muertes recientes y el equipo que usa este jugador de Albion Online (Americas), según el killboard público.', path, noindex: true }
      : { title: `Dossiê${SUFFIX}`, description: 'Fama, kills e mortes recentes e o equipamento usado por este jogador do Albion Online (Americas), pelo killboard público.', path, noindex: true };
  }

  return { title: E ? `Página no encontrada${SUFFIX}` : `Página não encontrada${SUFFIX}`, description: defaultDescription, path, noindex: true };
}

/** Tags de Open Graph, Twitter, canonical, hreflang e robots (já escapadas). Pura. */
export function headTags(meta: PageMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const u = escapeHtml(SITE + meta.path);
  const es = meta.locale === 'es';
  const base = stripLocale(meta.path);
  const tags = [
    `<link rel="canonical" href="${u}" />`,
    // Par de línguas só em página indexável (noindex não entra no buscador; a alternativa não teria o que apontar).
    ...(meta.noindex
      ? []
      : [
          `<link rel="alternate" hreflang="pt-BR" href="${escapeHtml(SITE + localizePath(base, 'pt'))}" />`,
          `<link rel="alternate" hreflang="es" href="${escapeHtml(SITE + localizePath(base, 'es'))}" />`,
          `<link rel="alternate" hreflang="x-default" href="${escapeHtml(SITE + localizePath(base, 'pt'))}" />`,
        ]),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Guarita" />`,
    `<meta property="og:locale" content="${es ? 'es_LA' : 'pt_BR'}" />`,
    `<meta property="og:locale:alternate" content="${es ? 'pt_BR' : 'es_LA'}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${es ? 'Guarita, compañero de Albion Online en español' : 'Guarita, companheiro do Albion Online em português'}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ];
  if (meta.noindex) tags.push(`<meta name="robots" content="noindex" />`);
  return tags.join('\n    ');
}

// Tags que a injeção substitui (se o index.html um dia trouxer alguma, não duplica).
const OWNED_SELECTORS = [
  'meta[property^="og:"]', 'meta[name^="twitter:"]', 'link[rel="canonical"]', 'link[rel="alternate"][hreflang]', 'meta[name="robots"]',
];
const OWNED_RE =
  /[ \t]*<(?:meta\s+property="og:[^"]*"|meta\s+name="twitter:[^"]*"|link\s+rel="canonical"|link\s+rel="alternate"\s+hreflang="[^"]*"|meta\s+name="robots")[^>]*>\s*\n?/gi;

/** Mesma injeção do HTMLRewriter, sobre o texto (testes e ambiente sem HTMLRewriter). Pura. */
export function applyMetaToHtml(html: string, meta: PageMeta): string {
  return html
    .replace(OWNED_RE, '')
    .replace(/<html\b([^>]*?)\slang="[^"]*"/i, `<html$1 lang="${htmlLangFor(meta.locale ?? 'pt')}"`)
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${escapeHtml(meta.description)}$2`)
    .replace(/<\/head>/i, `  ${headTags(meta)}\n  </head>`);
}

function rewriteWithHtmlRewriter(res: Response, meta: PageMeta): Response {
  let rw = new HTMLRewriter()
    .on('html', { element: (el) => void el.setAttribute('lang', htmlLangFor(meta.locale ?? 'pt')) })
    .on('title', { element: (el) => void el.setInnerContent(meta.title) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute('content', meta.description) })
    .on('head', { element: (el) => void el.append(`  ${headTags(meta)}\n  `, { html: true }) });
  for (const sel of OWNED_SELECTORS) rw = rw.on(sel, { element: (el) => void el.remove() });
  return rw.transform(res);
}

// Fatias names-es/t<tier>.json como TEXTO, em memória no isolate (mesma regra das fatias em português: sem JSON.parse
// do arquivo inteiro, ver docs/ARMADILHAS.md § Cloudflare). Falha não fica guardada: tenta de novo na próxima.
const esShards = new Map<string, Promise<string>>();

/** Nome do item em espanhol ("Bolsa del iniciado (T4.1)") ou null. */
async function labelEs(env: Env, id: string): Promise<string | null> {
  const tier = /^T(\d)_/.exec(id)?.[1] ?? '0';
  let p = esShards.get(tier);
  if (!p) {
    p = env.ASSETS.fetch(new Request(`https://assets.local/data/names-es/t${tier}.json`)).then((r) => (r.ok ? r.text() : ''));
    esShards.set(tier, p);
    p.then((t) => t || esShards.delete(tier), () => esShards.delete(tier));
  }
  const text = await p.catch(() => '');
  return text ? labelFromShardText(text, id) : null;
}

/** Resposta de página com a meta da rota. Só mexe em GET 200 text/html; o resto passa intacto. */
export async function withPageMeta(request: Request, res: Response, env: Env): Promise<Response> {
  if (request.method !== 'GET' || res.status !== 200) return res;
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const { pathname } = new URL(request.url);
  // /offline é a offline.html servida pelo Pages sem a extensão: página própria, não o index.html.
  if (pathname.includes('.') || pathname === '/offline') return res;

  let label: string | null = null;
  const id = itemIdFromPath(pathname);
  if (id) {
    try {
      // Espanhol: nome do jogo em espanhol (names-es/); sem ele, o nome em português (melhor que a meta genérica).
      if (localeFromPath(pathname) === 'es') label = await labelEs(env, id);
      label ??= (await labelsFor(env, [id])).get(id) ?? null;
    } catch {
      label = null; // sem o nome, a página sai com a meta genérica de item
    }
  }
  const meta = routeMeta(pathname, label);

  let out: Response;
  if (typeof HTMLRewriter !== 'undefined') {
    out = rewriteWithHtmlRewriter(res, meta);
  } else {
    out = new Response(applyMetaToHtml(await res.text(), meta), res);
  }
  // O corpo muda por rota: tamanho e etag do index.html deixam de valer.
  const headers = new Headers(out.headers);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
}

/** Caminhos do sitemap: rotas fixas indexáveis + itens populares, em português e depois em espanhol (/es). Pura. */
export function sitemapPaths(items: readonly string[] = HEALTH_BASKET): string[] {
  const fixed = FIXED_ROUTES.filter((r) => !r[3]?.noindex && r[3]?.sitemap !== false).map((r) => r[0]);
  const pt = [...fixed, ...[...new Set(items)].map((id) => `/item/${idPath(id)}`)];
  return [...pt, ...pt.map((p) => localizePath(p, 'es'))];
}

/** XML do sitemap. Pura. */
export function sitemapXml(items: readonly string[] = HEALTH_BASKET): string {
  const urls = sitemapPaths(items)
    .map((p) => `  <url><loc>${escapeHtml(SITE + p)}</loc><changefreq>${stripLocale(p).startsWith('/item/') ? 'hourly' : 'weekly'}</changefreq></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function sitemapResponse(method: string): Response {
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' };
  return new Response(method === 'HEAD' ? null : sitemapXml(), { headers });
}
