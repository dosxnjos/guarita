// Módulo (b): /api/prices, /api/item/:id, /api/book/:id. Também exporta as funções que o bot usa.
// getItem gasta no máximo 3 subrequests (prices, history e orderbook, todas as cidades por pedido) e cai para
// resposta parcial se history ou livro falharem; só a falta de preço vira erro.
import type { Env } from '../env';
import type {
  BookFillResponse, BookLevel, City, CityBook, CityHistory, CityQuote, Flip, ItemResponse, PriceRow, PricesResponse, Quality,
} from '../../shared/types';
import { ALL_CITIES, ROYAL_CITIES, flipProfit, minutesSince } from '../../shared/market';
import { bookDepth, confidence, median, verdict, weightedQuantile } from '../../shared/confidence';
import { AodpError, aodpBook, aodpBookMeta, aodpHistoryMeta, aodpPricesMeta, oldestAt, type HistoryPoint } from '../lib/aodp';
import { badRequest, json } from '../lib/respond';
import { apiLang, tl, type ApiLang } from '../../shared/lang';
import { aodpMessageEs, upstreamErrorL } from './langErrors';

const BM: City = 'Black Market';
/** Cidades com mercado "de verdade": entram na faixa de preço e são origem de flip. */
export const REAL_CITIES: City[] = [...ROYAL_CITIES, 'Caerleon', 'Brecilien'];
/** Níveis do livro devolvidos por lado e cidade (a profundidade é calculada antes do corte). */
const BOOK_LEVELS_OUT = 30;
export const MAX_IDS = 300;
export const MAX_FILL = 100_000;
const HISTORY_DAYS = 30;

export const ID_RE = /^[A-Za-z0-9_]{2,80}(@[0-4])?$/;

// ---------- lógica pura (exportada para teste) ----------

type RawHistory = { city: City; points: HistoryPoint[] }[];
type RawBook = { city: City; sell: BookLevel[]; buy: BookLevel[] }[];

function lastDays(points: HistoryPoint[], days: number, now: number): HistoryPoint[] {
  const since = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  return points.filter((p) => p.date >= since);
}

/** Faixa de preço: mediana de 7 dias e P25/P75 de 30 dias, ponderadas pela quantidade vendida. */
export function priceRange(history: RawHistory, cities: City[], now: number): { median7d: number | null; p25: number | null; p75: number | null } {
  const set = new Set(cities);
  const pts = history.filter((h) => set.has(h.city)).flatMap((h) => h.points);
  const toW = (p: HistoryPoint[]) => p.map((x) => ({ value: x.avg, weight: x.count }));
  return {
    median7d: weightedQuantile(toW(lastDays(pts, 7, now)), 0.5),
    p25: weightedQuantile(toW(lastDays(pts, 30, now)), 0.25),
    p75: weightedQuantile(toW(lastDays(pts, 30, now)), 0.75),
  };
}

/** Junta preços, histórico e livro na resposta da página de item. `now` em ms. */
export function buildItem(
  id: string,
  quality: Quality,
  rows: PriceRow[],
  history: RawHistory,
  book: RawBook,
  now: number,
  /** Quando o dado foi buscado no AODP (o carimbo mais antigo do cache); padrão `now`. */
  fetchedAt: string = new Date(now).toISOString(),
  /** Língua dos motivos do selo de confiança (o resto da resposta é número ou código). */
  lang: ApiLang = 'pt',
): ItemResponse {
  const range = priceRange(history, REAL_CITIES, now);
  const bmRange = priceRange(history, [BM], now);
  const histByCity = new Map(history.map((h) => [h.city, h.points]));
  const bookByCity = new Map(book.map((b) => [b.city, b]));
  const up = id.toUpperCase();
  const rowByCity = new Map(rows.filter((r) => r.id.toUpperCase() === up && r.quality === quality).map((r) => [r.city, r]));

  const cities: CityQuote[] = ALL_CITIES.map((city) => {
    const r = rowByCity.get(city);
    const sellMin = r?.sellMin ?? null;
    const sellMinAt = r?.sellMinAt ?? null;
    const buyMax = r?.buyMax ?? null;
    const buyMaxAt = r?.buyMaxAt ?? null;
    const isBM = city === BM;
    // No Black Market o preço que importa é a buy order (venda instantânea); nas cidades, a sell order.
    const useBuy = isBM ? buyMax !== null : sellMin === null;
    const price = useBuy ? buyMax : sellMin;
    const ageMin = minutesSince(useBuy ? buyMaxAt : sellMinAt, now);

    const pts = histByCity.get(city) ?? [];
    const week = lastDays(pts, 7, now);
    // mediana da própria cidade quando há histórico suficiente (preço alto constante não é isca); senão a geral
    const ownMed = week.length >= 3 ? weightedQuantile(week.map((p) => ({ value: p.avg, weight: p.count })), 0.5) : null;
    const ref = isBM ? bmRange.median7d : ownMed ?? range.median7d;
    const vol = week.length ? week.reduce((s, p) => s + p.count, 0) / 7 : pts.length ? 0 : null;
    const b = bookByCity.get(city);
    const depth = b ? bookDepth(useBuy ? b.buy : b.sell, useBuy ? 'buy' : 'sell') : null;

    return {
      city, sellMin, sellMinAt, buyMax, buyMaxAt, ageMin,
      confidence: confidence({ price, ageMin, depth, median7d: ref, sellMin, buyMax, avgDailyVolume: vol }, lang),
      verdict: isBM ? verdict(buyMax, bmRange.p25, bmRange.p75) : verdict(sellMin, range.p25, range.p75),
    };
  });

  const bm = rowByCity.get(BM);
  const flips: Flip[] = [];
  if (bm?.buyMax) {
    for (const from of REAL_CITIES) {
      const r = rowByCity.get(from);
      if (!r?.sellMin) continue;
      const profitPremium = flipProfit(r.sellMin, bm.buyMax, true);
      if (profitPremium <= 0) continue;
      const a = minutesSince(r.sellMinAt, now);
      const c = minutesSince(bm.buyMaxAt, now);
      flips.push({
        from,
        buyAt: r.sellMin,
        sellAt: bm.buyMax,
        profitPremium,
        profitNoPremium: flipProfit(r.sellMin, bm.buyMax, false),
        roi: Math.round((profitPremium / r.sellMin) * 10_000) / 10_000,
        ageMin: a === null || c === null ? null : Math.max(a, c),
      });
    }
    flips.sort((x, y) => y.profitPremium - x.profitPremium);
  }

  const historyOut: CityHistory[] = history.map((h) => ({ city: h.city, days: h.points.map((p) => ({ date: p.date, avg: p.avg, count: p.count })) }));
  const bookOut: CityBook[] = book
    .filter((b) => b.sell.length || b.buy.length)
    .map((b) => ({ city: b.city, sell: b.sell.slice(0, BOOK_LEVELS_OUT), buy: b.buy.slice(0, BOOK_LEVELS_OUT) }));

  return {
    id, quality, fetchedAt, cities, history: historyOut,
    median7d: range.median7d === null ? null : Math.round(range.median7d),
    p25: range.p25, p75: range.p75, book: bookOut, flips,
  };
}

/**
 * Preço médio para N unidades consumindo o livro: side='sell' compra das sell orders (mais barata primeiro),
 * side='buy' vende para as buy orders (mais cara primeiro). `levels` devolve só o que foi consumido.
 */
export function fillBook(levels: BookLevel[], side: 'buy' | 'sell', n: number): { avgPrice: number | null; filled: number; levels: BookLevel[] } {
  const sorted = [...levels].filter((l) => l.price > 0 && l.amount > 0).sort((a, b) => (side === 'sell' ? a.price - b.price : b.price - a.price));
  let left = Math.max(0, Math.floor(n));
  let total = 0;
  let filled = 0;
  const used: BookLevel[] = [];
  for (const l of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, l.amount);
    total += take * l.price;
    filled += take;
    left -= take;
    used.push({ ...l, amount: take });
  }
  return { avgPrice: filled ? Math.round(total / filled) : null, filled, levels: used };
}

// ---------- funções usadas pela rota e pelo bot ----------

// O AODP devolve item_id sempre em maiúsculas (e o índice de itens também): normaliza na entrada.
// fetchedAt é quando o dado saiu do AODP, não a hora da resposta: com o AODP fora, o cache devolve a reserva
// (até 24 h) e a tela precisa poder dizer "pode estar desatualizado".
export async function getPrices(_env: Env, ctx: ExecutionContext, ids: string[], cities: City[] = ALL_CITIES, qualities: Quality[] = [1]): Promise<PricesResponse> {
  const r = await aodpPricesMeta(ids.map((i) => i.toUpperCase()), cities.length ? cities : ALL_CITIES, qualities.length ? qualities : [1], ctx);
  return { fetchedAt: r.at, rows: r.data };
}

/** `lang` 'es': motivos do selo em espanhol (mesmo dado em cache do AODP, mesmos subrequests). */
export async function getItem(_env: Env, ctx: ExecutionContext, rawId: string, quality: Quality = 1, lang: ApiLang = 'pt'): Promise<ItemResponse> {
  const id = rawId.toUpperCase();
  const [rows, hist, book] = await Promise.allSettled([
    aodpPricesMeta([id], ALL_CITIES, [quality], ctx),
    aodpHistoryMeta(id, ALL_CITIES, quality, HISTORY_DAYS, ctx),
    aodpBookMeta(id, ALL_CITIES, quality, ctx),
  ]);
  if (rows.status === 'rejected') throw rows.reason;
  if (hist.status === 'rejected') console.warn('item: histórico indisponível', id, String(hist.reason));
  if (book.status === 'rejected') console.warn('item: livro indisponível', id, String(book.reason));
  // Preço e livro decidem o "consultado há": o histórico tem TTL de 1 h por natureza e não conta.
  const ats = [rows.value.at, ...(book.status === 'fulfilled' ? [book.value.at] : [])];
  return buildItem(
    id, quality, rows.value.data,
    hist.status === 'fulfilled' ? hist.value.data : [],
    book.status === 'fulfilled' ? book.value.data : [],
    Date.now(), oldestAt(ats), lang,
  );
}

export async function getBookFill(_env: Env, ctx: ExecutionContext, id: string, city: City, side: 'buy' | 'sell', n: number, quality: Quality = 1): Promise<BookFillResponse> {
  // mesmo pedido (todas as cidades) que getItem: divide o cache e o subrequest
  const book = await aodpBook(id.toUpperCase(), ALL_CITIES, quality, ctx);
  const b = book.find((x) => x.city === city);
  const fill = fillBook(side === 'sell' ? b?.sell ?? [] : b?.buy ?? [], side, n);
  return { city, side, n, ...fill };
}

// ---------- parâmetros ----------

const CITY_BY_KEY = new Map(ALL_CITIES.map((c) => [c.toLowerCase().replace(/[\s_-]+/g, ''), c]));
/** Aceita "Fort Sterling", "fort-sterling", "fortsterling", "blackmarket"… */
export function parseCity(s: string | null | undefined): City | null {
  if (!s) return null;
  return CITY_BY_KEY.get(s.trim().toLowerCase().replace(/[\s_-]+/g, '')) ?? null;
}

export function parseQuality(s: string | null | undefined, fallback: Quality = 1): Quality | null {
  if (s === null || s === undefined || s === '') return fallback;
  const n = Number(s);
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 ? n : null;
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function list(s: string | null): string[] {
  return (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

// ---------- rotas ----------

/**
 * /api/prices, /api/item/:id e /api/book/:id. `?lang=es` devolve em espanhol os motivos do selo de confiança (só
 * /api/item tem texto) e as mensagens de erro; sem ele (ou com outro valor), tudo igual a antes.
 */
export async function routeMarket(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const p = url.pathname;
  const isPrices = p === '/api/prices';
  const itemM = /^\/api\/item\/([^/]+)\/?$/.exec(p);
  const bookM = /^\/api\/book\/([^/]+)\/?$/.exec(p);
  if (!isPrices && !itemM && !bookM) return null;
  const lang = apiLang(url.searchParams.get('lang'));
  const t = (pt: string, es: string) => tl(lang, pt, es);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: t('método não permitido', 'método no permitido') }, 405, 0, { Allow: 'GET, HEAD' });
  }

  try {
    if (isPrices) {
      const ids = [...new Set(list(url.searchParams.get('ids')))];
      if (!ids.length) return badRequest(t('Informe ao menos um item em "ids" (ex.: ids=T4_BAG,T5_BAG).', 'Indica al menos un objeto en "ids" (ej.: ids=T4_BAG,T5_BAG).'));
      if (ids.length > MAX_IDS) return badRequest(t(`No máximo ${MAX_IDS} itens por consulta.`, `Como máximo ${MAX_IDS} objetos por consulta.`));
      const bad = ids.find((i) => !ID_RE.test(i));
      if (bad) return badRequest(t(`Id de item inválido: "${bad.slice(0, 80)}".`, `Id de objeto no válido: "${bad.slice(0, 80)}".`));
      const cityNames = list(url.searchParams.get('cities'));
      const cities: City[] = [];
      for (const c of cityNames) {
        const city = parseCity(c);
        if (!city) return badRequest(t(`Cidade desconhecida: "${c.slice(0, 40)}".`, `Ciudad desconocida: "${c.slice(0, 40)}".`));
        if (!cities.includes(city)) cities.push(city);
      }
      const qualities: Quality[] = [];
      for (const q of list(url.searchParams.get('q'))) {
        const v = parseQuality(q);
        if (v === null) return badRequest(t(`Qualidade inválida: "${q.slice(0, 10)}" (use de 1 a 5).`, `Calidad no válida: "${q.slice(0, 10)}" (usa de 1 a 5).`));
        if (!qualities.includes(v)) qualities.push(v);
      }
      return json(await getPrices(env, ctx, ids, cities.length ? cities : ALL_CITIES, qualities.length ? qualities : [1]), 200, 60);
    }

    const id = safeDecode((itemM ?? bookM)![1]);
    if (!id || !ID_RE.test(id)) return badRequest(t('Id de item inválido.', 'Id de objeto no válido.'));
    const quality = parseQuality(url.searchParams.get('q'));
    if (quality === null) return badRequest(t('Qualidade inválida (use de 1 a 5).', 'Calidad no válida (usa de 1 a 5).'));

    if (itemM) return json(await getItem(env, ctx, id, quality, lang), 200, 60);

    const city = parseCity(url.searchParams.get('city'));
    if (!city) return badRequest(t('Informe uma cidade válida em "city" (ex.: city=Caerleon).', 'Indica una ciudad válida en "city" (ej.: city=Caerleon).'));
    const sideRaw = url.searchParams.get('side') ?? 'sell';
    if (sideRaw !== 'sell' && sideRaw !== 'buy') {
      return badRequest(t(
        '"side" deve ser "sell" (comprar das ofertas de venda) ou "buy" (vender para as ofertas de compra).',
        '"side" debe ser "sell" (comprar de las órdenes de venta) o "buy" (vender a las órdenes de compra).',
      ));
    }
    const nRaw = url.searchParams.get('n') ?? '1';
    const n = Number(nRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_FILL) {
      return badRequest(t(
        `"n" deve ser um número inteiro de 1 a ${MAX_FILL.toLocaleString('pt-BR')}.`,
        `"n" debe ser un número entero de 1 a ${MAX_FILL.toLocaleString('es-419')}.`,
      ));
    }
    return json(await getBookFill(env, ctx, id, city, sideRaw, n, quality), 200, 60);
  } catch (err) {
    if (err instanceof AodpError && err.status === 400) return badRequest(lang === 'es' ? aodpMessageEs(err) : err.message);
    return upstreamErrorL(err, lang);
  }
}
