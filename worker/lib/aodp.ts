// Cliente do Albion Online Data Project (Americas). Dono: módulo (b). Regras: gzip sempre, Cache API,
// lote por URL até 4096 caracteres, 429 → respeitar RateLimit-Reset. Outros módulos importam daqui.
// Toda resposta é normalizada antes de ir para o cache (datas ISO UTC, preço 0 → null, livro ordenado).
import type { BookLevel, City, PriceRow, Quality } from '../../shared/types';
import { AODP_BASE, ALL_CITIES, aodpDate, ticksToIso } from '../../shared/market';
import { cachedJsonMeta, type Cached } from './cache';

export interface HistoryPoint { date: string; avg: number; count: number }

export interface FestivityRaw {
  kind: number;
  category: string;
  name: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
}

/** Erro vindo do AODP (rede, 429, 5xx, resposta inválida). A API devolve 502 com `message`. */
export class AodpError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterS: number | null = null) {
    super(message);
    this.name = 'AodpError';
  }
}

export const USER_AGENT = 'guarita (github.com/dosxnjos/guarita)';
/** Margem abaixo do limite de 4096 caracteres de URL do AODP. */
export const MAX_URL = 4000;
/** Nunca passar disso numa invocação (plano grátis: 50 subrequests, sobra para o resto). */
export const MAX_PRICE_CHUNKS = 20;
const TIMEOUT_MS = 20_000;

export const TTL = { prices: 120, history: 3600, book: 120, gold: 600, festivities: 1800 } as const;

const CITY_SET = new Set<string>(ALL_CITIES);
function asCity(s: unknown): City | null {
  return typeof s === 'string' && CITY_SET.has(s) ? (s as City) : null;
}
function asQuality(q: unknown): Quality | null {
  return q === 1 || q === 2 || q === 3 || q === 4 || q === 5 ? q : null;
}
function price(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Codifica um id de item para o caminho; `@` (encantamento) continua literal. */
function encId(id: string): string {
  return encodeURIComponent(id).replace(/%40/g, '@');
}
function locations(cities: City[]): string {
  return cities.map((c) => encodeURIComponent(c)).join(',');
}

/** Chamada crua ao AODP: gzip, User-Agent, timeout, 429 com RateLimit-Reset. */
async function aodpFetch(pathAndQuery: string): Promise<unknown> {
  const url = AODP_BASE + pathAndQuery;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new AodpError(timeout ? 'O AODP demorou demais para responder.' : 'Não foi possível falar com o AODP.', 504);
  }
  if (res.status === 429) {
    const reset = Number(res.headers.get('RateLimit-Reset') ?? res.headers.get('Retry-After'));
    const secs = Number.isFinite(reset) && reset > 0 ? Math.ceil(reset) : null;
    throw new AodpError(
      secs ? `O AODP limitou as requisições; tente de novo em ${secs} s.` : 'O AODP limitou as requisições; tente de novo em instantes.',
      429,
      secs,
    );
  }
  if (!res.ok) throw new AodpError(`O AODP respondeu com erro ${res.status}.`, res.status);
  try {
    return await res.json();
  } catch {
    throw new AodpError('O AODP devolveu uma resposta inválida.', 502);
  }
}

/** Busca com cache (normalizado). Em erro da fonte o cache.ts devolve a última cópia boa, se houver. */
function getJson<T>(pathAndQuery: string, ttl: number, ctx: ExecutionContext | undefined, normalize: (raw: unknown) => T): Promise<T> {
  return getJsonMeta(pathAndQuery, ttl, ctx, normalize).then((r) => r.data);
}

/**
 * Igual a getJson, mas diz quando o dado foi buscado no AODP (`at`) e se veio da reserva porque a fonte falhou
 * (`stale`). Quem mostra "consultado há X" ao usuário usa este: com o AODP fora, a reserva pode ter até 24 h.
 */
function getJsonMeta<T>(pathAndQuery: string, ttl: number, ctx: ExecutionContext | undefined, normalize: (raw: unknown) => T): Promise<Cached<T>> {
  return cachedJsonMeta(`aodp${pathAndQuery}`, ttl, ctx, async () => normalize(await aodpFetch(pathAndQuery)));
}

/** O mais antigo de vários carimbos ISO (string ISO compara em ordem). */
export function oldestAt(ats: string[]): string {
  return ats.reduce((a, b) => (b < a ? b : a));
}

// ---------- normalizadores (exportados para teste) ----------

export function normalizePrices(raw: unknown): PriceRow[] {
  if (!Array.isArray(raw)) throw new AodpError('O AODP devolveu preços em formato inesperado.', 502);
  const rows: PriceRow[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const city = asCity(r.city);
    const quality = asQuality(r.quality);
    if (!city || !quality || typeof r.item_id !== 'string') continue;
    const sellMin = price(r.sell_price_min);
    const buyMax = price(r.buy_price_max);
    rows.push({
      id: r.item_id,
      city,
      quality,
      sellMin,
      sellMinAt: sellMin === null ? null : aodpDate(r.sell_price_min_date as string),
      buyMax,
      buyMaxAt: buyMax === null ? null : aodpDate(r.buy_price_max_date as string),
    });
  }
  return rows;
}

export function normalizeHistory(raw: unknown): { city: City; points: HistoryPoint[] }[] {
  if (!Array.isArray(raw)) throw new AodpError('O AODP devolveu histórico em formato inesperado.', 502);
  const byCity = new Map<City, Map<string, { sum: number; count: number }>>();
  for (const s of raw as Record<string, unknown>[]) {
    const city = asCity(s.location);
    if (!city || !Array.isArray(s.data)) continue;
    const days = byCity.get(city) ?? new Map<string, { sum: number; count: number }>();
    byCity.set(city, days);
    for (const d of s.data as Record<string, unknown>[]) {
      const avg = price(d.avg_price);
      const count = typeof d.item_count === 'number' && d.item_count > 0 ? d.item_count : 0;
      const ts = aodpDate(d.timestamp as string);
      if (avg === null || !count || !ts) continue;
      const date = ts.slice(0, 10);
      // mais de uma série para a mesma cidade (qualidades juntas): média ponderada pela quantidade
      const acc = days.get(date) ?? { sum: 0, count: 0 };
      acc.sum += avg * count;
      acc.count += count;
      days.set(date, acc);
    }
  }
  return [...byCity].map(([city, days]) => ({
    city,
    points: [...days]
      .map(([date, a]) => ({ date, avg: Math.round(a.sum / a.count), count: a.count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

/** Junta níveis de mesmo preço, ordena (venda asc, compra desc) e descarta preço ou quantidade inválidos. */
function levels(raw: unknown, side: 'sell' | 'buy'): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<number, BookLevel>();
  for (const l of raw as Record<string, unknown>[]) {
    const p = price(l.price);
    const amount = typeof l.amount === 'number' && l.amount > 0 ? l.amount : 0;
    if (p === null || !amount) continue;
    const at = aodpDate(l.updated_at as string) ?? undefined;
    const cur = map.get(p);
    if (cur) {
      cur.amount += amount;
      if (at && (!cur.updatedAt || at > cur.updatedAt)) cur.updatedAt = at;
    } else {
      map.set(p, at ? { price: p, amount, updatedAt: at } : { price: p, amount });
    }
  }
  return [...map.values()].sort((a, b) => (side === 'sell' ? a.price - b.price : b.price - a.price));
}

export function normalizeBook(raw: unknown): { city: City; sell: BookLevel[]; buy: BookLevel[] }[] {
  if (!Array.isArray(raw)) throw new AodpError('O AODP devolveu livro de ofertas em formato inesperado.', 502);
  const out = new Map<City, { city: City; sell: BookLevel[]; buy: BookLevel[] }>();
  for (const b of raw as Record<string, unknown>[]) {
    const city = asCity(b.city);
    if (!city) continue;
    const prev = out.get(city);
    const sell = levels(b.sell, 'sell');
    const buy = levels(b.buy, 'buy');
    if (prev) {
      // segunda entrada da mesma cidade (raro): junta
      out.set(city, { city, sell: levels([...prev.sell.map(toRaw), ...sell.map(toRaw)], 'sell'), buy: levels([...prev.buy.map(toRaw), ...buy.map(toRaw)], 'buy') });
    } else {
      out.set(city, { city, sell, buy });
    }
  }
  return [...out.values()];
}
function toRaw(l: BookLevel) {
  return { price: l.price, amount: l.amount, updated_at: l.updatedAt };
}

/** Ouro: mais recente primeiro. */
export function normalizeGold(raw: unknown): { price: number; at: string }[] {
  if (!Array.isArray(raw)) throw new AodpError('O AODP devolveu o preço do ouro em formato inesperado.', 502);
  const out: { price: number; at: string }[] = [];
  for (const g of raw as Record<string, unknown>[]) {
    const p = price(g.price);
    const at = aodpDate(g.timestamp as string);
    if (p !== null && at) out.push({ price: p, at });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function normalizeFestivities(raw: unknown): FestivityRaw[] {
  const events = (raw as { Events?: unknown } | null)?.Events;
  if (!Array.isArray(events)) throw new AodpError('O AODP devolveu festividades em formato inesperado.', 502);
  const out: FestivityRaw[] = [];
  for (const e of events as Record<string, unknown>[]) {
    if (typeof e.UniqueName !== 'string' || typeof e.StartTime !== 'number' || typeof e.EndTime !== 'number') continue;
    out.push({
      kind: typeof e.Kind === 'number' ? e.Kind : -1,
      category: typeof e.Category === 'string' ? e.Category : '',
      name: e.UniqueName,
      start: ticksToIso(e.StartTime),
      end: ticksToIso(e.EndTime),
    });
  }
  return out;
}

// ---------- lotes ----------

/** Divide ids em lotes cuja URL completa de /prices fica dentro de MAX_URL caracteres. */
export function chunkPriceUrls(ids: string[], cities: City[], qualities: Quality[]): string[] {
  const query = `?locations=${locations(cities)}&qualities=${qualities.join(',')}`;
  const fixed = AODP_BASE.length + '/prices/'.length + query.length;
  const urls: string[] = [];
  let cur: string[] = [];
  let len = fixed;
  for (const id of ids) {
    const e = encId(id);
    if (fixed + e.length > MAX_URL) throw new AodpError(`Id de item longo demais: ${id.slice(0, 40)}…`, 400);
    if (cur.length && len + 1 + e.length > MAX_URL) {
      urls.push(`/prices/${cur.join(',')}${query}`);
      cur = [];
      len = fixed;
    }
    len += cur.length ? 1 + e.length : e.length;
    cur.push(e);
  }
  if (cur.length) urls.push(`/prices/${cur.join(',')}${query}`);
  return urls; // caminhos relativos a AODP_BASE
}

// ---------- API pública do módulo ----------

export async function aodpPrices(ids: string[], cities: City[], qualities: Quality[], ctx?: ExecutionContext): Promise<PriceRow[]> {
  return (await aodpPricesMeta(ids, cities, qualities, ctx)).data;
}

/** Preços + carimbo: `at` é o do lote mais antigo; `stale` se algum lote veio da reserva. */
export async function aodpPricesMeta(ids: string[], cities: City[], qualities: Quality[], ctx?: ExecutionContext): Promise<Cached<PriceRow[]>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return { data: [], at: new Date().toISOString(), stale: false };
  const cs = cities.length ? cities : ALL_CITIES;
  const qs = qualities.length ? [...new Set(qualities)].sort() : ([1] as Quality[]);
  const paths = chunkPriceUrls(uniq, cs, qs);
  if (paths.length > MAX_PRICE_CHUNKS) throw new AodpError('Itens demais numa só consulta.', 400);
  const parts = await Promise.all(paths.map((p) => getJsonMeta(p, TTL.prices, ctx, normalizePrices)));
  return { data: parts.flatMap((p) => p.data), at: oldestAt(parts.map((p) => p.at)), stale: parts.some((p) => p.stale) };
}

/** Histórico diário (time-scale=24) das cidades, num pedido só; só os últimos `days` dias, mais antigo primeiro. */
export async function aodpHistory(id: string, cities: City[], quality: Quality, days: number, ctx?: ExecutionContext): Promise<{ city: City; points: HistoryPoint[] }[]> {
  return (await aodpHistoryMeta(id, cities, quality, days, ctx)).data;
}

export async function aodpHistoryMeta(id: string, cities: City[], quality: Quality, days: number, ctx?: ExecutionContext): Promise<Cached<{ city: City; points: HistoryPoint[] }[]>> {
  const cs = cities.length ? cities : ALL_CITIES;
  const path = `/history/${encId(id)}?time-scale=24&locations=${locations(cs)}&qualities=${quality}`;
  const all = await getJsonMeta(path, TTL.history, ctx, normalizeHistory);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const data = all.data
    .map((h) => ({ city: h.city, points: h.points.filter((p) => p.date >= since) }))
    .filter((h) => h.points.length > 0);
  return { ...all, data };
}

/** Livro de ofertas das cidades, num pedido só. Venda em ordem crescente, compra em decrescente. */
export async function aodpBook(id: string, cities: City[], quality: Quality, ctx?: ExecutionContext): Promise<{ city: City; sell: BookLevel[]; buy: BookLevel[] }[]> {
  return (await aodpBookMeta(id, cities, quality, ctx)).data;
}

export async function aodpBookMeta(id: string, cities: City[], quality: Quality, ctx?: ExecutionContext): Promise<Cached<{ city: City; sell: BookLevel[]; buy: BookLevel[] }[]>> {
  const cs = cities.length ? cities : ALL_CITIES;
  const path = `/orderbook/${encId(id)}?locations=${locations(cs)}&qualities=${quality}`;
  return getJsonMeta(path, TTL.book, ctx, normalizeBook);
}

/**
 * Preço do ouro (hora a hora), mais recente primeiro. Sem `date=` o AODP corta em 720 pontos (30 dias), mesmo com
 * count maior; `sinceDay` (AAAA-MM-DD, granular por dia para não quebrar o cache) libera a série desde esse dia.
 */
export async function aodpGold(count: number, ctx?: ExecutionContext, sinceDay?: string): Promise<{ price: number; at: string }[]> {
  const n = Math.max(1, Math.min(5000, Math.floor(count) || 1));
  const date = sinceDay && /^\d{4}-\d{2}-\d{2}$/.test(sinceDay) ? `&date=${sinceDay}` : '';
  return getJson(`/gold.json?count=${n}${date}`, TTL.gold, ctx, normalizeGold);
}

/** Festividades do servidor west (evento sazonal, bônus de atividade, bônus de produção). */
export async function aodpFestivities(ctx?: ExecutionContext): Promise<FestivityRaw[]> {
  return getJson('/festivities', TTL.festivities, ctx, normalizeFestivities);
}
