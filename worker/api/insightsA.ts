// Módulo (a) da Fase 2: perdas PvP (/api/losses) e página da guilda (/api/guild/:nome, /api/guilds?q=).
// Reexportado por insights.ts (getLosses, getGuild), que o bot e o MCP importam.
//
// Fontes: KillLog do guarita-core pelo service binding CORE (/internal/killlog/*), AODP (preço atual) e gameinfo
// (busca de guilda e /guilds/{id}). Orçamento do plano grátis (10 ms de CPU, 50 subrequests):
// - Nome do item: NÃO usa JSON.parse das fatias names/t<tier>.json (5 × ~115 KB passam de 10 ms com o isolate
//   frio). Lê a fatia como texto e recorta só os ids pedidos (labelsFor), com teto de LABEL_MAX ids.
// - Preço: um lote só no AODP (Royal + Caerleon, qualidade 1), com o cache do aodp.ts.
// - Cada parte tem cache próprio (KillLog 10 min, gameinfo 10 min com reserva); a montagem final é barata.
import type { Env } from '../env';
import type { City, GuildHit, GuildSummary, LossItem, LossesResponse, PriceRow } from '../../shared/types';
import { ROYAL_CITIES, minutesSince } from '../../shared/market';
import { WEAPON_LABEL_PT, weaponFamily, type WeaponFamily } from '../../shared/weapons';
import { labelFromShardText } from '../lib/shardText';
import { aodpPricesMeta } from '../lib/aodp';
import { cachedJson, cachedJsonMeta } from '../lib/cache';
import { GameinfoError, gameinfoFetch, Budget } from '../lib/gameinfo';
import { badRequest, json, upstreamError } from '../lib/respond';

export const LOSSES_TTL_S = 600;
export const GUILD_TTL_S = 600;
export const LOSSES_MAX_DAYS = 7;
export const LOSSES_MAX_LIMIT = 50;
/** Teto de ids com nome resolvido no Worker (o resto fica com o id; a tela completa pelo índice do navegador). */
export const LABEL_MAX = 50;
export const GUILD_NAME_MAX = 64;
/** A gameinfo pode levar 60 s; a página da guilda não espera tanto: sem ela, mostra só o KillLog. */
const GI_GUILD_TIMEOUT_MS = 15_000;
export const PRICE_CITIES: City[] = [...ROYAL_CITIES, 'Caerleon'];

// ---------------------------------------------------------------------------------------------------------
// Funções puras (testadas em tests/losses.test.ts e tests/guild.test.ts)

/** Número de query preso na faixa; vazio ou inválido vira o padrão. */
export function clampParam(v: string | null | undefined, def: number, min: number, max: number): number {
  const n = v === null || v === undefined || v === '' ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Menor preço de venda por item entre as linhas (0 e null já são "sem dado" no aodp.ts) e a idade dele. */
export function cheapestById(rows: PriceRow[], now = Date.now()): Map<string, { price: number; ageMin: number | null }> {
  const out = new Map<string, { price: number; ageMin: number | null }>();
  for (const r of rows) {
    if (r.city === 'Black Market' || r.sellMin === null || !(r.sellMin > 0)) continue;
    const id = r.id.toUpperCase();
    const cur = out.get(id);
    if (!cur || r.sellMin < cur.price) out.set(id, { price: r.sellMin, ageMin: minutesSince(r.sellMinAt, now) });
  }
  return out;
}

/** Rótulo recortado do texto da fatia (sem JSON.parse do arquivo). Mora em worker/lib/shardText.ts. */
export { labelFromShardText };

export interface CoreLossItem {
  type: string;
  count: number;
}

/** Junta contagem, preço e nome; value = count × price. Mantém a ordem por contagem do KillLog. */
export function buildLossItems(
  items: CoreLossItem[],
  prices: Map<string, { price: number; ageMin: number | null }>,
  names: Map<string, string>,
): LossItem[] {
  return items.map(({ type, count }) => {
    const id = type.toUpperCase();
    const p = prices.get(id);
    const price = p ? p.price : null;
    return {
      id,
      name: names.get(id) ?? id,
      count,
      price,
      value: price === null ? null : Math.round(price * count),
      ageMin: p ? p.ageMin : null,
    };
  });
}

/**
 * Armas cruas (id → contagem) somadas por família PT-BR. `type` = a arma mais usada da família (serve de ícone,
 * como em PlayerDossier.weapons); 'Outra' vai para o fim.
 */
export function foldWeapons(raw: { type: string; count: number }[], max = 8): GuildSummary['weapons'] {
  const fam = new Map<WeaponFamily, { count: number; top: string; topCount: number }>();
  for (const { type, count } of raw) {
    if (!type || !(count > 0)) continue;
    const f = weaponFamily(type);
    const cur = fam.get(f) ?? { count: 0, top: type, topCount: 0 };
    cur.count += count;
    if (count > cur.topCount) {
      cur.top = type;
      cur.topCount = count;
    }
    fam.set(f, cur);
  }
  return [...fam.entries()]
    .sort((a, b) => Number(a[0] === 'other') - Number(b[0] === 'other') || b[1].count - a[1].count)
    .slice(0, max)
    .map(([f, v]) => ({ type: v.top, labelPt: WEAPON_LABEL_PT[f], count: v.count }));
}

export type { GuildHit } from '../../shared/types';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** guilds[] da busca da gameinfo, enxuto. */
export function normalizeGuildSearch(raw: unknown): GuildHit[] {
  const list = (raw as { guilds?: unknown } | null)?.guilds;
  if (!Array.isArray(list)) return [];
  const out: GuildHit[] = [];
  for (const g of list as Record<string, unknown>[]) {
    const id = str(g?.Id);
    const name = str(g?.Name);
    if (!id || !name) continue;
    out.push({ id, name, alliance: str(g.AllianceName) || str(g.AllianceTag) || null, deathFame: numOrNull(g.DeathFame) });
  }
  return out.slice(0, 20);
}

/** Comparação de nome de guilda: sem diferença de maiúsculas e de espaços nas pontas. */
export function sameGuildName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('en') === b.trim().toLocaleLowerCase('en');
}

/** A busca da gameinfo é aproximada ("bagre" devolve Bagres, Bagreros...): só vale o nome igual. */
export function pickGuild(hits: GuildHit[], name: string): GuildHit | null {
  return hits.find((h) => h.name === name.trim()) ?? hits.find((h) => sameGuildName(h.name, name)) ?? null;
}

export interface GuildInfo {
  id: string;
  name: string;
  alliance: string | null;
  members: number | null;
  killFame: number | null;
  deathFame: number | null;
}

/** /guilds/{id}: killFame vem com k minúsculo; AllianceName pode ser null com AllianceTag "". */
export function normalizeGuildInfo(raw: unknown): GuildInfo {
  const g = (raw ?? {}) as Record<string, unknown>;
  const id = str(g.Id);
  if (!id) throw new GameinfoError('upstream', 'gameinfo: guilda em formato inesperado');
  return {
    id,
    name: str(g.Name),
    alliance: str(g.AllianceName) || str(g.AllianceTag) || null,
    members: numOrNull(g.MemberCount),
    killFame: numOrNull(g.killFame) ?? numOrNull(g.KillFame),
    deathFame: numOrNull(g.DeathFame),
  };
}

export interface CoreGuildSummary {
  guild: string;
  days: { day: string; kills: number; deaths: number }[];
  totals?: { kills: number; deaths: number };
  detail?: {
    windowDays: number;
    kills: number;
    deaths: number;
    topKillers: { id: string; name: string; kills: number }[];
    weapons: { type: string; count: number }[];
    hoursBrt: number[];
    coverageSince: string | null;
  };
}

/** 24 posições inteiras (protege a tela de resposta torta). */
export function hours24(h: unknown): number[] {
  const a = Array.isArray(h) ? h : [];
  return Array.from({ length: 24 }, (_, i) => (typeof a[i] === 'number' && Number.isFinite(a[i]) && a[i] > 0 ? Math.round(a[i]) : 0));
}

/** Monta o GuildSummary do contrato a partir do KillLog e (quando houver) da gameinfo. */
export function buildGuildSummary(name: string, core: CoreGuildSummary | null, info: GuildInfo | null, fetchedAt: string): GuildSummary {
  const d = core?.detail;
  return {
    name: info?.name || core?.guild || name.trim(),
    id: info?.id ?? null,
    alliance: info?.alliance ?? null,
    members: info?.members ?? null,
    killFame: info?.killFame ?? null,
    deathFame: info?.deathFame ?? null,
    days: (core?.days ?? []).slice(-30).map((x) => ({ date: x.day, kills: x.kills, deaths: x.deaths })),
    topKillers: (d?.topKillers ?? []).slice(0, 10).map((k) => ({ name: k.name, id: k.id, kills: k.kills })),
    weapons: foldWeapons(d?.weapons ?? []),
    hoursBrt: hours24(d?.hoursBrt),
    coverageSince: d?.coverageSince ?? null,
    fetchedAt,
  };
}

/** Guilda sem nada no KillLog nem na gameinfo. */
export function isEmptyGuild(core: CoreGuildSummary | null): boolean {
  return !core || ((core.days?.length ?? 0) === 0 && (core.detail?.kills ?? 0) === 0 && (core.detail?.deaths ?? 0) === 0);
}

// ---------------------------------------------------------------------------------------------------------
// Acesso às fontes

/** Erro do KillLog (core fora, binding ausente): vira 502 na rota. */
export class CoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreError';
  }
}

async function coreGet<T>(env: Env, path: string): Promise<T> {
  if (!env.CORE) throw new CoreError('O histórico do killboard está indisponível agora.');
  let res: Response;
  try {
    res = await env.CORE.fetch(new Request(`https://core/internal/killlog${path}`, { headers: { accept: 'application/json' } }));
  } catch {
    throw new CoreError('O histórico do killboard está indisponível agora.');
  }
  if (!res.ok) throw new CoreError(`O histórico do killboard respondeu com erro ${res.status}.`);
  return (await res.json()) as T;
}

const shardText = new Map<string, Promise<string>>();

/** Texto da fatia names/t<n>.json, guardado no isolate (uma ida ao ASSETS por tier). */
function loadShardText(env: Env, tier: string): Promise<string> {
  let p = shardText.get(tier);
  if (!p) {
    p = env.ASSETS.fetch(new Request(`https://assets.local/data/names/t${tier}.json`)).then((r) => (r.ok ? r.text() : ''));
    p.catch(() => shardText.delete(tier));
    shardText.set(tier, p);
  }
  return p;
}

/** id → rótulo PT-BR para até LABEL_MAX ids, recortando o texto das fatias (sem JSON.parse do arquivo). */
export async function labelsFor(env: Env, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = [...new Set(ids.map((i) => i.toUpperCase()))].slice(0, LABEL_MAX);
  const byTier = new Map<string, string[]>();
  for (const id of want) {
    const t = /^T(\d)_/.exec(id)?.[1] ?? '0';
    byTier.set(t, [...(byTier.get(t) ?? []), id]);
  }
  await Promise.all(
    [...byTier.entries()].map(async ([tier, list]) => {
      const text = await loadShardText(env, tier).catch(() => '');
      if (!text) return;
      for (const id of list) {
        const label = labelFromShardText(text, id);
        if (label) out.set(id, label);
      }
    }),
  );
  return out;
}

interface CoreLosses {
  days: number;
  deaths: number;
  items: CoreLossItem[];
  since: string | null;
}

/** (a) Itens mais perdidos no PvP nos últimos `days` dias (1 = hoje UTC, até 7). */
export async function getLosses(env: Env, ctx: ExecutionContext, days: number, limit = 50): Promise<LossesResponse> {
  const d = clampParam(String(days), 1, 1, LOSSES_MAX_DAYS);
  const l = clampParam(String(limit), 50, 1, LOSSES_MAX_LIMIT);
  const core = await cachedJsonMeta<CoreLosses>(`insights/losses/v1/d${d}/l${l}`, LOSSES_TTL_S, ctx, async () => {
    const r = await coreGet<CoreLosses>(env, `/losses?days=${d}&limit=${l}`);
    const items = (Array.isArray(r.items) ? r.items : [])
      // Aceita também ids sem tier (UNIQUE_*, montarias especiais); labelsFor manda esses para names/t0.json.
      .filter((i) => i && typeof i.type === 'string' && /^[A-Z][A-Z0-9_]*(@\d)?$/i.test(i.type) && Number(i.count) > 0)
      .map((i) => ({ type: i.type, count: Number(i.count) }));
    return { days: d, deaths: Number(r.deaths) || 0, items, since: typeof r.since === 'string' ? r.since : null };
  });
  const ids = core.data.items.map((i) => i.type.toUpperCase());

  // Preço e nome em paralelo; preço fora (429, 5xx) não derruba a lista: fica sem preço.
  const [priced, names] = await Promise.all([
    ids.length
      ? aodpPricesMeta([...ids].sort(), PRICE_CITIES, [1], ctx).catch((e) => {
          console.warn('perdas: preço indisponível', String(e));
          return null;
        })
      : Promise.resolve(null),
    labelsFor(env, ids).catch(() => new Map<string, string>()),
  ]);
  const prices = cheapestById(priced?.data ?? []);
  const fetchedAt = priced && priced.at < core.at ? priced.at : core.at;
  return {
    days: d,
    since: core.data.since,
    sampleKills: core.data.deaths,
    items: buildLossItems(core.data.items, prices, names),
    fetchedAt,
  };
}

/** Busca de guilda na gameinfo (cache próprio: a chave da busca de jogador guarda outro formato). */
export async function searchGuilds(ctx: ExecutionContext | undefined, q: string, budget = new Budget(4), timeoutMs?: number): Promise<{ hits: GuildHit[]; at: string; stale: boolean }> {
  const query = q.trim();
  const path = `/search?q=${encodeURIComponent(query)}`;
  const r = await cachedJsonMeta(`gameinfo-guild/search/${encodeURIComponent(query.toLowerCase())}`, GUILD_TTL_S, ctx, async () =>
    normalizeGuildSearch(await gameinfoFetch(path, { ctx, budget, timeoutMs })),
  );
  return { hits: r.data, at: r.at, stale: r.stale };
}

async function guildInfo(ctx: ExecutionContext, id: string, budget: Budget): Promise<GuildInfo> {
  const r = await cachedJsonMeta(`gameinfo-guild/info/${encodeURIComponent(id)}`, GUILD_TTL_S, ctx, async () =>
    normalizeGuildInfo(await gameinfoFetch(`/guilds/${encodeURIComponent(id)}`, { ctx, budget, timeoutMs: GI_GUILD_TIMEOUT_MS })),
  );
  return r.data;
}

function coreGuild(env: Env, ctx: ExecutionContext, name: string): Promise<CoreGuildSummary> {
  return cachedJson<CoreGuildSummary>(`insights/guild/v1/${encodeURIComponent(name)}`, GUILD_TTL_S, ctx, () =>
    coreGet<CoreGuildSummary>(env, `/guild/${encodeURIComponent(name)}/summary?detail=1`),
  );
}

/** Guilda não encontrada nem no killboard oficial nem no histórico da Guarita. */
export class GuildNotFound extends Error {
  constructor(name: string) {
    super(`Guilda “${name}” não encontrada no servidor Americas. O nome precisa ser exato.`);
    this.name = 'GuildNotFound';
  }
}

/** (a) Resumo da guilda pelo nome exato (maiúsculas e minúsculas não importam). */
export async function getGuild(env: Env, ctx: ExecutionContext, name: string): Promise<GuildSummary> {
  const typed = name.trim().slice(0, GUILD_NAME_MAX);
  const budget = new Budget(6);
  const [coreRes, searchRes] = await Promise.allSettled([
    coreGuild(env, ctx, typed),
    searchGuilds(ctx, typed, budget, GI_GUILD_TIMEOUT_MS),
  ]);
  // KillLog é o conteúdo principal da página: com ele fora, erro honesto ("tentar de novo") em vez de uma
  // página que diria "sem kills na amostra".
  if (coreRes.status === 'rejected') throw coreRes.reason;
  const hit = searchRes.status === 'fulfilled' ? pickGuild(searchRes.value.hits, typed) : null;

  let core: CoreGuildSummary | null = coreRes.value;
  // O KillLog guarda o nome exato do jogo: com o nome canônico diferente do digitado, consulta de novo.
  if (hit && hit.name !== typed) {
    core = await coreGuild(env, ctx, hit.name).catch(() => core);
  }

  let info: GuildInfo | null = null;
  if (hit) {
    info = await guildInfo(ctx, hit.id, budget).catch(() => ({
      id: hit.id, name: hit.name, alliance: hit.alliance, members: null, killFame: null, deathFame: hit.deathFame,
    }));
  }

  const searchOk = searchRes.status === 'fulfilled';
  if (!hit && isEmptyGuild(core)) {
    // Busca respondeu e não achou, e o KillLog também não tem nada: 404 de verdade.
    if (searchOk) throw new GuildNotFound(typed);
    // A gameinfo caiu e o KillLog não tem nada: devolve o erro dela para a tela oferecer "tentar de novo".
    throw (searchRes as PromiseRejectedResult).reason;
  }
  return buildGuildSummary(typed, core, info, new Date().toISOString());
}

// ---------------------------------------------------------------------------------------------------------
// Rotas HTTP

function errorResponse(err: unknown): Response {
  if (err instanceof GuildNotFound) return json({ error: err.message }, 404);
  if (err instanceof CoreError) return json({ error: err.message }, 502);
  if (err instanceof GameinfoError) {
    if (err.kind === 'not_found') return json({ error: 'Não encontrado no killboard oficial.' }, 404);
    if (err.kind === 'timeout') return json({ error: 'O killboard oficial demorou demais para responder. Tente de novo em instantes.' }, 504);
    return json({ error: 'O killboard oficial está instável agora. Tente de novo em instantes.' }, 502);
  }
  return upstreamError(err);
}

/** /api/losses?days=1..7&limit=, /api/guild/:nome, /api/guilds?q= (busca). null = rota de outro módulo. */
export async function handleLossesGuild(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const p = url.pathname;
  if (p !== '/api/losses' && p !== '/api/guilds' && !p.startsWith('/api/guild/')) return null;
  if (request.method !== 'GET') return json({ error: 'método não permitido' }, 405);
  try {
    if (p === '/api/losses') {
      const days = clampParam(url.searchParams.get('days'), 1, 1, LOSSES_MAX_DAYS);
      const limit = clampParam(url.searchParams.get('limit'), 50, 1, LOSSES_MAX_LIMIT);
      return json(await getLosses(env, ctx, days, limit), 200, 300);
    }
    if (p === '/api/guilds') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if (q.length < 3) return badRequest('Digite pelo menos 3 letras do nome da guilda.');
      if (q.length > GUILD_NAME_MAX) return badRequest('Nome de guilda longo demais.');
      const r = await searchGuilds(ctx, q);
      return json({ guilds: r.hits, fetchedAt: r.at }, 200, 300);
    }
    const m = /^\/api\/guild\/([^/]+)$/.exec(p);
    if (!m) return json({ error: 'rota não encontrada' }, 404);
    let name: string;
    try {
      name = decodeURIComponent(m[1]).trim();
    } catch {
      return badRequest('Nome de guilda inválido.');
    }
    if (!name || name.length > GUILD_NAME_MAX) return badRequest('Nome de guilda inválido.');
    return json(await getGuild(env, ctx, name), 200, 300);
  } catch (err) {
    return errorResponse(err);
  }
}
