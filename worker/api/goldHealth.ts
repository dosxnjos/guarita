// Módulo (d) da Fase 2: ouro (série, percentis, veredito) e saúde do dado do AODP por cidade.
// Reexportado por insights.ts com as assinaturas do contrato; a rota HTTP fica em routesF2.ts (routeGoldHealth).
//
// Régua do ouro (decidida em 30/10/2026):
//   - limpeza: mediana dos preços crus da janela; fica só o que está em [mediana/3, mediana×3] (o AODP às vezes
//     grava uma hora com preço absurdo, de 1 ou de milhões);
//   - faixa desenhada: p10–p90 (onde o ouro ficou em 80% das horas da janela);
//   - veredito: abaixo do p25 = "barato", acima do p75 = "caro", entre os dois = "normal". Quartis em vez de
//     p10/p90 para o "barato" aparecer em ~1/4 do tempo e não só em 1/10; é a mesma régua do VerdictTag dos
//     itens. O veredito vale para a janela escolhida (7, 30 ou 90 dias): a tela sempre diz qual;
//   - menos de 24 pontos limpos (um dia) = "sem dado".
//
// Saúde do dado: cesta fixa de 40 itens populares num único lote de /prices (8 cidades, qualidade 1). As linhas
// cruas ficam 30 min em cache e as idades são calculadas a cada pedido contra o relógio, para "fresco (< 1 h)" não
// congelar. No Black Market (que só compra) vale a data da melhor ordem de compra e só os equipamentos da cesta:
// ele não compra recursos refinados, então contá-los como "sem preço" acusaria falta de scan que não existe.
import type { Env } from '../env';
import type { City, DataHealthCity, DataHealthResponse, GoldResponse, PriceRow } from '../../shared/types';
import { ALL_CITIES, minutesSince } from '../../shared/market';
import { aodpGold, aodpPricesMeta } from '../lib/aodp';
import { cachedJsonMeta } from '../lib/cache';
import { badRequest, json, upstreamError } from '../lib/respond';

export const GOLD_DAYS = [7, 30, 90] as const;
export type GoldDays = (typeof GOLD_DAYS)[number];
export const GOLD_TTL = 600; // 10 min
export const HEALTH_TTL = 1800; // 30 min
/** Mínimo de pontos horários limpos para dar veredito. */
export const GOLD_MIN_POINTS = 24;

export const FRESH_MIN = 60;
export const STALE_MIN = 1440;

// ---------- ouro: lógica pura ----------

export type GoldPoint = { price: number; at: string };

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Percentil com interpolação linear sobre um vetor JÁ ORDENADO (p de 0 a 1). */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Tira preços absurdos (fora de [mediana/3, mediana×3]) e devolve do mais antigo para o mais recente. */
export function cleanGold(points: GoldPoint[]): GoldPoint[] {
  const valid = points.filter((p) => Number.isFinite(p.price) && p.price > 0 && !Number.isNaN(Date.parse(p.at)));
  const med = median(valid.map((p) => p.price));
  if (med === null) return [];
  const lo = med / 3;
  const hi = med * 3;
  return valid.filter((p) => p.price >= lo && p.price <= hi).sort((a, b) => a.at.localeCompare(b.at));
}

export function goldVerdict(current: number | null, p25: number | null, p75: number | null, n: number): GoldResponse['verdict'] {
  if (current === null || p25 === null || p75 === null || n < GOLD_MIN_POINTS) return 'sem dado';
  if (current < p25) return 'barato';
  if (current > p75) return 'caro';
  return 'normal';
}

/** Monta a resposta do ouro a partir dos pontos crus (qualquer ordem). */
export function summarizeGoldWindow(raw: GoldPoint[], fetchedAt: string): GoldResponse {
  const points = cleanGold(raw);
  const sorted = points.map((p) => p.price).sort((a, b) => a - b);
  const round = (n: number | null) => (n === null ? null : Math.round(n));
  const current = points.length ? points[points.length - 1].price : null;
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  return {
    points,
    current,
    p10: round(percentile(sorted, 0.1)),
    p50: round(percentile(sorted, 0.5)),
    p90: round(percentile(sorted, 0.9)),
    verdict: goldVerdict(current, p25, p75, points.length),
    fetchedAt,
  };
}

export function parseGoldDays(s: string | null): GoldDays | null {
  if (s === null || s === '') return 30;
  const n = Number(s);
  return (GOLD_DAYS as readonly number[]).includes(n) ? (n as GoldDays) : null;
}

// ---------- saúde do dado: cesta e lógica pura ----------

/** Recursos refinados: o Black Market não compra, então ficam fora da conta dele. */
const REFINED = ['PLANKS', 'METALBAR', 'LEATHER', 'CLOTH', 'STONEBLOCK'];

/** 42 itens populares (ids conferidos no items-index.json em 30/10/2026). Cabe numa só URL do /prices. */
export const HEALTH_BASKET: readonly string[] = [
  'T4_BAG', 'T5_BAG', 'T6_BAG',
  'T4_CAPE', 'T5_CAPE', 'T6_CAPE',
  ...[4, 5, 6].flatMap((t) => REFINED.map((r) => `T${t}_${r}`)),
  'T4_MAIN_SWORD', 'T5_MAIN_SWORD', 'T6_MAIN_SWORD',
  'T4_2H_BOW', 'T5_2H_BOW',
  'T4_MAIN_FIRESTAFF', 'T4_MAIN_HOLYSTAFF', 'T4_MAIN_NATURESTAFF', 'T4_MAIN_FROSTSTAFF', 'T4_MAIN_CURSEDSTAFF', 'T4_MAIN_ARCANESTAFF',
  'T4_MAIN_SPEAR', 'T4_MAIN_DAGGER', 'T4_2H_QUARTERSTAFF', 'T4_MAIN_AXE', 'T4_MAIN_MACE', 'T4_2H_CROSSBOW',
  'T4_ARMOR_PLATE_SET1', 'T4_ARMOR_LEATHER_SET1', 'T4_ARMOR_CLOTH_SET1',
  'T4_MOUNT_HORSE',
];

export function isRefined(id: string): boolean {
  return REFINED.some((r) => id.endsWith('_' + r));
}

/** Itens que contam para cada cidade: no Black Market, só os equipamentos (sem recurso refinado). */
export function basketFor(city: City, basket: readonly string[] = HEALTH_BASKET): string[] {
  return city === 'Black Market' ? basket.filter((id) => !isRefined(id)) : [...basket];
}

/** Agrega as linhas de preço por cidade. Idades contra `now` (ms). */
export function summarizeHealth(rows: PriceRow[], now: number, basket: readonly string[] = HEALTH_BASKET, cities: City[] = ALL_CITIES): DataHealthCity[] {
  const byKey = new Map<string, PriceRow>();
  for (const r of rows) if (r.quality === 1) byKey.set(`${r.city}|${r.id.toUpperCase()}`, r);
  return cities.map((city) => {
    const bm = city === 'Black Market';
    const ages: number[] = [];
    let fresh1h = 0;
    let stale24h = 0;
    let missing = 0;
    for (const id of basketFor(city, basket)) {
      const r = byKey.get(`${city}|${id.toUpperCase()}`);
      const at = r ? (bm ? (r.buyMax !== null ? r.buyMaxAt : null) : r.sellMin !== null ? r.sellMinAt : null) : null;
      const age = minutesSince(at, now);
      if (age === null) {
        missing++;
        continue;
      }
      ages.push(age);
      if (age < FRESH_MIN) fresh1h++;
      if (age > STALE_MIN) stale24h++;
    }
    const med = median(ages);
    return { city, medianAgeMin: med === null ? null : Math.round(med), fresh1h, stale24h, missing };
  });
}

// ---------- funções do contrato ----------

/** (d) Série do ouro e veredito. `days` fora de 7/30/90 vira 30 (a rota já recusa antes). */
export async function getGold(_env: Env, ctx: ExecutionContext, days: number): Promise<GoldResponse> {
  const d: GoldDays = (GOLD_DAYS as readonly number[]).includes(days) ? (days as GoldDays) : 30;
  // aodpGold não tem variante Meta: o cache próprio da resposta dá o carimbo e a reserva quando o AODP falha.
  // Sem `date=` o AODP corta gold.json em 720 pontos (30 dias) e 90 dias voltava com 30 (conferido em 30/10/2026):
  // pede desde o dia UTC anterior ao início da janela (granular por dia: a chave do cache muda 1x por dia) e
  // o filtro abaixo corta na hora exata. A tela ainda avisa pela cobertura real se a série vier curta.
  const r = await cachedJsonMeta(`gold/v2/${d}`, GOLD_TTL, ctx, async () => {
    const sinceMs = Date.now() - d * 86_400_000;
    const since = new Date(sinceMs).toISOString();
    const sinceDay = new Date(sinceMs - 86_400_000).toISOString().slice(0, 10);
    return summarizeGoldWindow((await aodpGold(d * 24 + 24, ctx, sinceDay)).filter((p) => p.at >= since), '');
  });
  return { ...r.data, fetchedAt: r.at };
}

/** (d) Saúde do dado do AODP por cidade. */
export async function getDataHealth(_env: Env, ctx: ExecutionContext): Promise<DataHealthResponse> {
  // guarda o carimbo do aodp.ts (Meta): com o AODP fora, a reserva dele pode ter até 24 h e a tela não pode
  // dizer "medido agora" sobre ela (ARMADILHAS § Alertas)
  const r = await cachedJsonMeta('data-health/v2/rows', HEALTH_TTL, ctx, async () => {
    const m = await aodpPricesMeta([...HEALTH_BASKET], ALL_CITIES, [1], ctx);
    return { rows: m.data, at: m.at };
  });
  const at = r.data.at && r.data.at < r.at ? r.data.at : r.at;
  return { basket: HEALTH_BASKET.length, cities: summarizeHealth(r.data.rows, Date.now()), fetchedAt: at };
}

// ---------- rota HTTP (chamada por routeGoldHealth em routesF2.ts) ----------

/** GET /api/gold?days=7|30|90 (padrão 30) e GET /api/data-health. Outras rotas: null. */
export async function routeGoldHealthImpl(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const p = url.pathname.replace(/\/+$/, '');
  if (p !== '/api/gold' && p !== '/api/data-health') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'método não permitido' }, 405, 0, { Allow: 'GET, HEAD' });
  }
  try {
    if (p === '/api/gold') {
      const days = parseGoldDays(url.searchParams.get('days'));
      if (days === null) return badRequest('days precisa ser 7, 30 ou 90.');
      return json(await getGold(env, ctx, days), 200, 300);
    }
    return json(await getDataHealth(env, ctx), 200, 300);
  } catch (err) {
    return upstreamError(err);
  }
}
