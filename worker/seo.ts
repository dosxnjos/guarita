// SEO por rota: título, descrição, Open Graph e Twitter Card injetados no index.html pelo _worker.js, para a prévia
// de link (Discord, WhatsApp) e o buscador verem a página certa sem rodar o JavaScript do front.
// - Tabela espelha src/lib/router.ts; os títulos repetem o document.title de cada tela (sem pular na troca).
// - /item/:id e /previsao/:id: nome do item pela fatia names/t<tier>.json lida como texto (labelsFor), nunca o
//   items-index.json inteiro nem JSON.parse da fatia (CPU do plano grátis, ver docs/ARMADILHAS.md § Cloudflare).
// - No Workers usa HTMLRewriter (streaming); fora dele (vitest no Node) cai em applyMetaToHtml, com o mesmo resultado.
import type { Env } from './env';
import { labelsFor } from './api/insightsA';
import { HEALTH_BASKET } from './api/goldHealth';

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
}

const DEFAULT_DESCRIPTION =
  'Guarita: preços do Albion Online com idade e confiança, alertas no celular, relógio do servidor Americas em horário de Brasília e dossiê de jogador. Em português.';

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
];

const FIXED = new Map(FIXED_ROUTES.map((r) => [r[0], r]));

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

/** Id de item pedido na URL (/item/:id ou /previsao/:id), em maiúsculas, ou null. Pura. */
export function itemIdFromPath(pathname: string): string | null {
  const m = /^\/(?:item|previsao)\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  const id = safeDecode(m[1]).trim().toUpperCase();
  return /^[A-Z0-9_@]{2,80}$/.test(id) ? id : null;
}

/**
 * Meta da página para o caminho. `itemLabel` é o nome PT-BR já resolvido para /item/:id e /previsao/:id
 * (null = não achou). Pura.
 */
export function routeMeta(pathname: string, itemLabel: string | null = null): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const fixed = FIXED.get(path);
  if (fixed) return { title: fixed[1], description: fixed[2], path, noindex: fixed[3]?.noindex };

  let m = /^\/item\/([^/]+)$/.exec(path);
  if (m) {
    const id = itemIdFromPath(path);
    if (id && itemLabel) {
      return {
        title: `${itemLabel}${SUFFIX}`,
        description: `Preço de ${itemLabel} no Albion Online (servidor Americas): compra e venda em cada cidade, com a idade do dado e o selo de confiança.`,
        path: `/item/${idPath(id)}`,
      };
    }
    return { title: `Preço de item${SUFFIX}`, description: DEFAULT_DESCRIPTION, path, noindex: true };
  }

  m = /^\/previsao\/([^/]+)$/.exec(path);
  if (m) {
    const id = itemIdFromPath(path);
    if (id && itemLabel) {
      return {
        title: `Previsão: ${itemLabel}${SUFFIX}`,
        description: `Previsão de preço de ${itemLabel} no Albion Online (Americas) para os próximos dias, com faixa de incerteza e o acerto do modelo publicado.`,
        path: `/previsao/${idPath(id)}`,
      };
    }
    return { title: `Previsão de preço${SUFFIX}`, description: DEFAULT_DESCRIPTION, path, noindex: true };
  }

  m = /^\/guilda\/([^/]+)$/.exec(path);
  if (m) {
    // Nome vem da URL sem conferência: só entra na prévia se tiver cara de nome de guilda do Albion (letras,
    // dígitos e espaço, 3 a 30). Fora disso, título genérico: "Sorteio oficial em golpe.xyz" não vira cartão com a
    // marca da Guarita. E buscador nunca (evita indexar nome inventado).
    const raw = safeDecode(m[1]).trim();
    const name = GUILD_NAME.test(raw) ? raw : '';
    return {
      title: name ? `${name} · Guilda${SUFFIX}` : `Guilda${SUFFIX}`,
      description: `Kills, mortes, armas mais usadas e horários da guilda${name ? ` ${name}` : ''} no Albion Online (Americas), pelo killboard público.`,
      path,
      noindex: true,
    };
  }

  if (/^\/jogador\/[^/]+\/morte$/.test(path)) {
    return { title: `Autópsia${SUFFIX}`, description: 'O que matou o jogador na última morte, o equipamento perdido e quanto custa repor, no Albion Online (Americas).', path, noindex: true };
  }
  if (/^\/jogador\/[^/]+$/.test(path)) {
    return { title: `Dossiê${SUFFIX}`, description: 'Fama, kills e mortes recentes e o equipamento usado por este jogador do Albion Online (Americas), pelo killboard público.', path, noindex: true };
  }

  // Interface em espanhol (Fase 3, outro módulo): sem tabela própria ainda, fica com o padrão e indexável.
  if (path === '/es' || path.startsWith('/es/')) return { title: 'Guarita', description: DEFAULT_DESCRIPTION, path };

  return { title: `Página não encontrada${SUFFIX}`, description: DEFAULT_DESCRIPTION, path, noindex: true };
}

/** Tags de Open Graph, Twitter, canonical e robots (já escapadas). Pura. */
export function headTags(meta: PageMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const u = escapeHtml(SITE + meta.path);
  const tags = [
    `<link rel="canonical" href="${u}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Guarita" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Guarita, companheiro do Albion Online em português" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ];
  if (meta.noindex) tags.push(`<meta name="robots" content="noindex" />`);
  return tags.join('\n    ');
}

// Tags que a injeção substitui (se o index.html um dia trouxer alguma, não duplica).
const OWNED_SELECTORS = ['meta[property^="og:"]', 'meta[name^="twitter:"]', 'link[rel="canonical"]', 'meta[name="robots"]'];
const OWNED_RE = /[ \t]*<(?:meta\s+property="og:[^"]*"|meta\s+name="twitter:[^"]*"|link\s+rel="canonical"|meta\s+name="robots")[^>]*>\s*\n?/gi;

/** Mesma injeção do HTMLRewriter, sobre o texto (testes e ambiente sem HTMLRewriter). Pura. */
export function applyMetaToHtml(html: string, meta: PageMeta): string {
  return html
    .replace(OWNED_RE, '')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${escapeHtml(meta.description)}$2`)
    .replace(/<\/head>/i, `  ${headTags(meta)}\n  </head>`);
}

function rewriteWithHtmlRewriter(res: Response, meta: PageMeta): Response {
  let rw = new HTMLRewriter()
    .on('title', { element: (el) => void el.setInnerContent(meta.title) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute('content', meta.description) })
    .on('head', { element: (el) => void el.append(`  ${headTags(meta)}\n  `, { html: true }) });
  for (const sel of OWNED_SELECTORS) rw = rw.on(sel, { element: (el) => void el.remove() });
  return rw.transform(res);
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
      label = (await labelsFor(env, [id])).get(id) ?? null;
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

/** Caminhos do sitemap: rotas fixas indexáveis + itens populares. Pura. */
export function sitemapPaths(items: readonly string[] = HEALTH_BASKET): string[] {
  const fixed = FIXED_ROUTES.filter((r) => !r[3]?.noindex && r[3]?.sitemap !== false).map((r) => r[0]);
  return [...fixed, ...[...new Set(items)].map((id) => `/item/${idPath(id)}`)];
}

/** XML do sitemap. Pura. */
export function sitemapXml(items: readonly string[] = HEALTH_BASKET): string {
  const urls = sitemapPaths(items)
    .map((p) => `  <url><loc>${escapeHtml(SITE + p)}</loc><changefreq>${p.startsWith('/item/') ? 'hourly' : 'weekly'}</changefreq></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function sitemapResponse(method: string): Response {
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' };
  return new Response(method === 'HEAD' ? null : sitemapXml(), { headers });
}
