// Módulo (e): /api/alerts (criar, listar, apagar) e /api/push/* — repassa ao Durable Object Hub do guarita-core.
// Exporta as funções que o bot usa para /alerta.
// Pela API pública só se cria alerta "push" (dono = id de inscrição existente, conferido no Hub);
// alerta "discord" só nasce pelo bot, que já sabe quem é o usuário (senão qualquer um mandaria DM em nome de outro).
// Proteção contra abuso: item conferido no catálogo (id inventado nunca dispara e só ocupa o motor) e, no Hub,
// limite por origem (hash do IP em `x-guarita-client`, nunca o IP cru), teto global de regras e poda de inscrição ociosa.
import type { Env } from '../env';
import type { AlertCondition, AlertRule, City, Quality } from '../../shared/types';
import { ALL_CITIES } from '../../shared/market';
import { findItem } from '../../shared/items';
import { BM_SELL_ERROR, MEDIAN_PCT_MAX, MEDIAN_PCT_MIN, sideAllowsCities } from '../../shared/alertLimits';
import { loadItemsIndex } from '../lib/items';

export type NewAlert = Omit<AlertRule, 'id' | 'createdAt' | 'lastFiredAt'>;
/** Mantido por compatibilidade: itemName agora é campo opcional do próprio AlertRule. */
export type NewAlertInput = NewAlert;

export const MAX_RULES_PER_OWNER = 20;
export { MEDIAN_PCT_MIN, MEDIAN_PCT_MAX, BM_SELL_ERROR };
const MAX_BODY = 4096;
const ITEM_ID_RE = /^[A-Z0-9_]{2,80}(@[0-9])?$/;
const OWNER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valida o corpo de POST /api/alerts (e o que o bot manda). Espelha validateNewAlert do core. */
export function validateAlertBody(body: unknown): Validated<NewAlertInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'corpo inválido' };
  const b = body as Record<string, unknown>;

  const itemId = typeof b.itemId === 'string' ? b.itemId.trim() : '';
  if (!ITEM_ID_RE.test(itemId)) return { ok: false, error: 'item inválido' };

  let itemName: string | undefined;
  if (b.itemName !== undefined && b.itemName !== null) {
    if (typeof b.itemName !== 'string') return { ok: false, error: 'nome do item inválido' };
    const clean = b.itemName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
    if (clean) itemName = clean;
  }

  const quality = b.quality === undefined ? 1 : b.quality;
  if (typeof quality !== 'number' || !Number.isInteger(quality) || quality < 1 || quality > 5) {
    return { ok: false, error: 'qualidade deve ser de 1 a 5' };
  }

  if (!Array.isArray(b.cities) || b.cities.length === 0) return { ok: false, error: 'escolha ao menos uma cidade' };
  const cities: City[] = [];
  for (const c of b.cities) {
    if (typeof c !== 'string' || !ALL_CITIES.includes(c as City)) return { ok: false, error: `cidade desconhecida: ${String(c).slice(0, 40)}` };
    if (!cities.includes(c as City)) cities.push(c as City);
  }

  const side = b.side === undefined ? 'sell' : b.side;
  if (side !== 'sell' && side !== 'buy') return { ok: false, error: 'lado deve ser sell ou buy' };
  if (!sideAllowsCities(side, cities)) return { ok: false, error: BM_SELL_ERROR };

  const cond = b.condition as Record<string, unknown> | undefined;
  if (!cond || typeof cond !== 'object') return { ok: false, error: 'condição ausente' };
  let condition: AlertCondition;
  if (cond.kind === 'below' || cond.kind === 'above') {
    const price = cond.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 1 || price > 2_000_000_000) {
      return { ok: false, error: 'preço-alvo inválido' };
    }
    condition = { kind: cond.kind, price: Math.round(price) };
  } else if (cond.kind === 'belowMedianPct') {
    const pct = cond.pct;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < MEDIAN_PCT_MIN || pct > MEDIAN_PCT_MAX) {
      return { ok: false, error: `percentual deve ser de ${MEDIAN_PCT_MIN} a ${MEDIAN_PCT_MAX}` };
    }
    condition = { kind: 'belowMedianPct', pct: Math.round(pct) };
  } else {
    return { ok: false, error: 'tipo de condição desconhecido' };
  }

  const cooldownRaw = b.cooldownMin === undefined ? 60 : b.cooldownMin;
  if (typeof cooldownRaw !== 'number' || !Number.isFinite(cooldownRaw)) return { ok: false, error: 'intervalo inválido' };
  const cooldownMin = Math.round(cooldownRaw);
  if (cooldownMin < 5 || cooldownMin > 7 * 24 * 60) return { ok: false, error: 'intervalo entre avisos deve ser de 5 min a 7 dias' };

  const channel = b.channel === undefined ? 'push' : b.channel;
  if (channel !== 'push' && channel !== 'discord') return { ok: false, error: 'canal deve ser push ou discord' };

  const owner = typeof b.owner === 'string' ? b.owner : typeof b.sub === 'string' ? b.sub : '';
  if (!OWNER_RE.test(owner)) return { ok: false, error: 'dono inválido' };
  if (channel === 'discord' && !/^\d{15,22}$/.test(owner)) return { ok: false, error: 'id do Discord inválido' };

  const value: NewAlertInput = { itemId, quality: quality as Quality, cities, side, condition, cooldownMin, channel, owner };
  if (itemName) value.itemName = itemName;
  return { ok: true, value };
}

export interface SubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Id atual guardado no aparelho: prova de posse para reaproveitar a inscrição do mesmo endpoint. */
  subId?: string;
}

/** Confere o formato de uma PushSubscription.toJSON() (+ subId opcional) antes de mandar ao Hub (que valida de novo). */
export function validateSubscriptionBody(body: unknown): Validated<SubscriptionBody> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'inscrição inválida' };
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; subId?: unknown };
  if (typeof b.endpoint !== 'string' || !b.endpoint.startsWith('https://') || b.endpoint.length > 1024) {
    return { ok: false, error: 'endpoint inválido' };
  }
  const k = b.keys;
  const b64 = /^[A-Za-z0-9_-]+=*$/;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || !b64.test(k.p256dh) || !b64.test(k.auth) || k.p256dh.length > 120 || k.auth.length > 40) {
    return { ok: false, error: 'chaves da inscrição inválidas' };
  }
  const value: SubscriptionBody = { endpoint: b.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
  if (b.subId !== undefined && b.subId !== null) {
    if (typeof b.subId !== 'string' || !OWNER_RE.test(b.subId)) return { ok: false, error: 'subId inválido' };
    value.subId = b.subId;
  }
  return { ok: true, value };
}

/** Item existe no catálogo? Devolve o nome PT-BR oficial (usado na notificação no lugar do nome que o cliente mandou). */
export async function catalogName(env: Env, itemId: string): Promise<string | null> {
  const t = findItem(await loadItemsIndex(env), itemId);
  return t ? t[1] || t[2] || t[0] : null;
}

/** Chave de origem para o limite do Hub: SHA-256 do IP, 32 hex. Sem IP (teste, chamada interna) → null. */
export async function clientKey(request: Request): Promise<string | null> {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('guarita-rl:' + ip));
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Hub ----------

function hub(env: Env): DurableObjectStub {
  return env.HUB.get(env.HUB.idFromName('main'));
}

async function hubCall(env: Env, path: string, init?: RequestInit): Promise<{ status: number; data: any }> {
  const res = await hub(env).fetch('https://hub' + path, init);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = { error: 'resposta inválida do hub' };
  }
  return { status: res.status, data };
}

const postJson = (body: unknown, client?: string | null): RequestInit => ({
  method: 'POST',
  headers: client ? { 'Content-Type': 'application/json', 'x-guarita-client': client } : { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Cria a regra no Hub. Lança Error com mensagem PT-BR pronta para mostrar (o bot repassa ao usuário). */
export async function createAlert(env: Env, rule: NewAlertInput): Promise<AlertRule> {
  const v = validateAlertBody(rule);
  if (!v.ok) throw new Error(v.error);
  const { status, data } = await hubCall(env, '/alerts', postJson(v.value));
  if (status !== 201) throw new Error(data?.error ?? `falha ao criar alerta (${status})`);
  return data as AlertRule;
}

export async function listAlerts(env: Env, owner: string): Promise<AlertRule[]> {
  if (!OWNER_RE.test(owner)) return [];
  const { status, data } = await hubCall(env, `/alerts?owner=${encodeURIComponent(owner)}`);
  if (status !== 200) throw new Error(data?.error ?? `falha ao listar alertas (${status})`);
  return (data?.alerts ?? []) as AlertRule[];
}

export async function deleteAlert(env: Env, owner: string, id: string): Promise<boolean> {
  if (!OWNER_RE.test(owner) || !ID_RE.test(id)) return false;
  const { status, data } = await hubCall(env, `/alerts/${encodeURIComponent(id)}?owner=${encodeURIComponent(owner)}`, { method: 'DELETE' });
  if (status === 404) return false;
  if (status !== 200) throw new Error(data?.error ?? `falha ao apagar alerta (${status})`);
  return true;
}

// ---------- rotas HTTP ----------

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Status do Hub para o cliente: 503 (teto cheio) passa como está; outro 5xx vira 502. */
function hubStatus(status: number): number {
  return status === 503 ? 503 : status >= 500 ? 502 : status;
}

function reply(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

async function readBody(request: Request): Promise<Validated<unknown>> {
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > MAX_BODY) return { ok: false, error: 'corpo grande demais' };
  const text = await request.text();
  if (text.length > MAX_BODY) return { ok: false, error: 'corpo grande demais' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'JSON inválido' };
  }
}

/** Dono vindo da query: aceita ?owner= (contrato do módulo) e ?sub= (contrato do plano). */
function ownerParam(url: URL): string {
  return url.searchParams.get('owner') ?? url.searchParams.get('sub') ?? '';
}

export async function routeAlerts(request: Request, url: URL, env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/alerts') && !path.startsWith('/api/push/')) return null;

  try {
    if (path === '/api/push/vapid' && method === 'GET') {
      if (!env.VAPID_PUBLIC) return reply({ error: 'notificações ainda não configuradas' }, 503);
      return Response.json({ key: env.VAPID_PUBLIC }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
    }

    if (path === '/api/push/subscribe' && method === 'POST') {
      const body = await readBody(request);
      if (!body.ok) return reply({ error: body.error }, 400);
      const v = validateSubscriptionBody(body.value);
      if (!v.ok) return reply({ error: v.error }, 400);
      const { status, data } = await hubCall(env, '/push/subscribe', postJson(v.value, await clientKey(request)));
      if (status !== 200 && status !== 201) return reply({ error: data?.error ?? 'falha ao registrar notificações' }, hubStatus(status));
      return reply({ subId: data.subId }, status);
    }

    if (path === '/api/push/unsubscribe' && method === 'POST') {
      const body = await readBody(request);
      if (!body.ok) return reply({ error: body.error }, 400);
      const b = body.value as { subId?: unknown; endpoint?: unknown } | null;
      if (!b || typeof b.subId !== 'string' || !OWNER_RE.test(b.subId)) return reply({ error: 'subId inválido' }, 400);
      const payload: { subId: string; endpoint?: string } = { subId: b.subId };
      if (typeof b.endpoint === 'string') payload.endpoint = b.endpoint;
      const { status, data } = await hubCall(env, '/push/unsubscribe', postJson(payload));
      return reply(data, status >= 500 ? 502 : status);
    }

    if (path === '/api/alerts' && method === 'POST') {
      const body = await readBody(request);
      if (!body.ok) return reply({ error: body.error }, 400);
      const v = validateAlertBody(body.value);
      if (!v.ok) return reply({ error: v.error }, 400);
      if (v.value.channel !== 'push') return reply({ error: 'alerta no Discord se cria pelo comando /alerta do bot' }, 403);
      // Item fora do catálogo nunca teria preço: recusa antes de ocupar o motor. O nome vem do catálogo.
      let name: string | null;
      try {
        name = await catalogName(env, v.value.itemId);
      } catch (e) {
        console.error('alerts: catálogo indisponível', e);
        return reply({ error: 'não deu para conferir o item agora; tente de novo em instantes' }, 503);
      }
      if (!name) return reply({ error: 'item não encontrado no catálogo' }, 400);
      const rule: NewAlertInput = { ...v.value, itemName: name };
      // O Hub confere se o dono é uma inscrição existente, o limite de 20 por dono, o teto global e o limite por origem.
      const { status, data } = await hubCall(env, '/alerts', postJson(rule, await clientKey(request)));
      if (status !== 201) return reply({ error: data?.error ?? 'falha ao criar alerta' }, hubStatus(status));
      return reply(data, 201);
    }

    if (path === '/api/alerts' && method === 'GET') {
      const owner = ownerParam(url);
      if (!OWNER_RE.test(owner)) return reply({ error: 'informe ?owner= com o id da inscrição' }, 400);
      // Pela web só se enxergam alertas push (o id da inscrição é o segredo do aparelho; id do Discord é público).
      const { status, data } = await hubCall(env, `/alerts?owner=${encodeURIComponent(owner)}&channel=push`);
      if (status !== 200) return reply({ error: data?.error ?? 'falha ao listar alertas' }, status >= 500 ? 502 : status);
      return reply({ alerts: data.alerts ?? [] });
    }

    const one = /^\/api\/alerts\/([^/]+)$/.exec(path);
    if (one && method === 'DELETE') {
      const owner = ownerParam(url);
      const id = decodeURIComponent(one[1]);
      if (!OWNER_RE.test(owner) || !ID_RE.test(id)) return reply({ error: 'parâmetros inválidos' }, 400);
      const { status, data } = await hubCall(env, `/alerts/${encodeURIComponent(id)}?owner=${encodeURIComponent(owner)}&channel=push`, { method: 'DELETE' });
      if (status === 404) return reply({ error: 'alerta não encontrado' }, 404);
      if (status !== 200) return reply({ error: data?.error ?? 'falha ao apagar alerta' }, 502);
      return reply({ ok: true });
    }
  } catch (e) {
    console.error('alerts', path, e);
    return reply({ error: 'serviço de alertas indisponível, tente de novo em instantes' }, 503);
  }

  return reply({ error: 'método não permitido' }, 405);
}
