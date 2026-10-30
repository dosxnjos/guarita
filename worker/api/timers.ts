// Módulo (f): /api/timers — despertador da ilha e do foco. Repassa ao Durable Object Timers do guarita-core
// (um objeto por dono: env.TIMERS.idFromName(owner)), que guarda os timers e dispara o push pelo alarm().
//   POST   /api/timers               corpo {owner, kind, label, endsAt} → 201 Timer
//   GET    /api/timers?owner=        → {timers: Timer[]}
//   DELETE /api/timers/:id?owner=    → {ok: true}
// Dono = id de inscrição push existente (o segredo do aparelho), conferido no Hub antes de tudo. Inscrição que sumiu
// responde 404 com "inscrição" na mensagem: o front (isSubGone) esquece o id e volta a oferecer "Ativar".
// A validação completa (tipo, rótulo, 1 min a 30 dias, 30 por dono) mora no DO; aqui só formato e tamanho.
import type { Env } from '../env';
import { cacheUrl } from '../lib/cache';

const MAX_BODY = 2048;
const OWNER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
export const SUB_GONE_ERROR = 'inscrição de notificação não encontrada: ative os avisos neste aparelho de novo';

function reply(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

/** Status do DO/Hub para o cliente: 4xx passa, 5xx vira 502. Pura. */
export function upstreamStatus(status: number): number {
  return status >= 500 ? 502 : status;
}

async function readJson(res: Response): Promise<{ error?: string } & Record<string, unknown>> {
  try {
    return (await res.json()) as { error?: string } & Record<string, unknown>;
  } catch {
    return { error: 'resposta inválida do serviço de despertador' };
  }
}

/** Por quanto tempo o resultado de checkOwner (existe / sumiu) fica guardado na Cache API do colo. */
export const OWNER_CACHE_S = 60;

function ownerCache(): Cache | null {
  try {
    return (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

/** Chave da Cache API pelo hash do dono (o id da inscrição é segredo: não vai cru na URL do cache). */
async function ownerCacheUrl(owner: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(owner)));
  return cacheUrl('timers-owner/' + [...d].map((b) => b.toString(16).padStart(2, '0')).join(''));
}

/**
 * Confere no Hub se o dono é uma inscrição existente. null = ok; senão, a resposta de erro pronta.
 * O resultado (existe ou sumiu) fica OWNER_CACHE_S na Cache API: um laço de pedidos com o mesmo dono, ou a tela
 * recarregando a lista, não vira uma ida ao DO Hub (o mesmo objeto dos alertas e do killfeed) por pedido.
 */
async function checkOwner(env: Env, owner: string): Promise<Response | null> {
  const cache = ownerCache();
  let key = '';
  if (cache) {
    try {
      key = await ownerCacheUrl(owner);
      const hit = await cache.match(key);
      const v = hit?.headers.get('x-owner');
      if (v === 'ok') return null;
      if (v === 'gone') return reply({ error: SUB_GONE_ERROR }, 404);
    } catch {
      /* sem cache: segue para o Hub */
    }
  }
  const remember = async (v: 'ok' | 'gone') => {
    if (!cache || !key) return;
    try {
      await cache.put(key, new Response(null, { headers: { 'x-owner': v, 'Cache-Control': `max-age=${OWNER_CACHE_S}` } }));
    } catch {
      /* put falhou: só perde o atalho */
    }
  };
  let res: Response;
  try {
    res = await env.HUB.get(env.HUB.idFromName('main')).fetch('https://hub/push/sub/' + encodeURIComponent(owner));
  } catch (e) {
    console.error('timers: Hub', e);
    return reply({ error: 'não deu para conferir os avisos deste aparelho agora; tente de novo em instantes' }, 502);
  }
  // Corpo descartado: nada da inscrição (endpoint, chaves) volta para o cliente.
  await res.body?.cancel().catch(() => {});
  if (res.status === 404) {
    await remember('gone');
    return reply({ error: SUB_GONE_ERROR }, 404);
  }
  if (!res.ok) return reply({ error: 'não deu para conferir os avisos deste aparelho agora; tente de novo em instantes' }, 502);
  await remember('ok');
  return null;
}

function timers(env: Env, owner: string): DurableObjectStub {
  return env.TIMERS.get(env.TIMERS.idFromName(owner));
}

async function forward(env: Env, owner: string, path: string, init: RequestInit, fallback: string): Promise<Response> {
  let res: Response;
  try {
    res = await timers(env, owner).fetch('https://timers' + path, init);
  } catch (e) {
    console.error('timers: DO', e);
    return reply({ error: fallback }, 502);
  }
  const data = await readJson(res);
  if (!res.ok) return reply({ error: data.error ?? fallback }, upstreamStatus(res.status));
  return reply(data, res.status);
}

/** Corpo de POST /api/timers só com os campos do contrato (o resto é ignorado). Pura. */
export function pickTimerBody(body: unknown): { owner: string; kind: unknown; label: unknown; endsAt: unknown } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.owner !== 'string' || !OWNER_RE.test(b.owner)) return null;
  return { owner: b.owner, kind: b.kind, label: b.label, endsAt: b.endsAt };
}

export async function handleTimers(request: Request, url: URL, env: Env): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (path !== '/api/timers' && !path.startsWith('/api/timers/')) return null;
  if (!env.TIMERS) return reply({ error: 'despertador indisponível no momento' }, 503);

  if (path === '/api/timers' && method === 'POST') {
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return reply({ error: 'corpo grande demais' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY) return reply({ error: 'corpo grande demais' }, 413);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return reply({ error: 'JSON inválido' }, 400);
    }
    const body = pickTimerBody(raw);
    if (!body) return reply({ error: 'informe o id da inscrição deste aparelho (owner)' }, 400);
    const gone = await checkOwner(env, body.owner);
    if (gone) return gone;
    return forward(env, body.owner, '/timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 'não deu para criar o despertador agora');
  }

  if (path === '/api/timers' && method === 'GET') {
    const owner = url.searchParams.get('owner') ?? '';
    if (!OWNER_RE.test(owner)) return reply({ error: 'informe ?owner= com o id da inscrição' }, 400);
    const gone = await checkOwner(env, owner);
    if (gone) return gone;
    return forward(env, owner, `/timers?owner=${encodeURIComponent(owner)}`, { method: 'GET' }, 'não deu para carregar os despertadores agora');
  }

  const one = /^\/api\/timers\/([^/]+)$/.exec(path);
  if (one && method === 'DELETE') {
    const owner = url.searchParams.get('owner') ?? '';
    let id = '';
    try {
      id = decodeURIComponent(one[1]);
    } catch {
      /* fica vazio e cai no 400 */
    }
    if (!OWNER_RE.test(owner) || !ID_RE.test(id)) return reply({ error: 'parâmetros inválidos' }, 400);
    const gone = await checkOwner(env, owner);
    if (gone) return gone;
    return forward(env, owner, `/timers/${encodeURIComponent(id)}?owner=${encodeURIComponent(owner)}`, { method: 'DELETE' }, 'não deu para apagar o despertador agora');
  }

  return reply({ error: 'método não permitido' }, 405);
}
