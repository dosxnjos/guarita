// Módulo (d) da Fase 3: GET /api/forecast/:id?city=&q= — previsão de 1 a 3 dias com o placar do teste.
// Um pedido de histórico ao AODP (todas as cidades, mesma URL e cache de 1 h da página de item: quem abriu o item
// já pagou a chamada), no máximo 3 subrequests (cache match, fetch, cache put). A conta é pura (shared/forecast.ts)
// e leva menos de 1 ms. `city` vazio ou ausente → a cidade com mais unidades vendidas nos últimos 14 dias.
import type { Env } from '../env';
import type { City, ForecastResponse, Quality } from '../../shared/types';
import { ALL_CITIES, ROYAL_CITIES } from '../../shared/market';
import { buildForecast, mostLiquidCity, type ForecastResult } from '../../shared/forecast';
import { AodpError, TTL, aodpHistoryMeta, type HistoryPoint } from '../lib/aodp';
import { badRequest, json, upstreamError } from '../lib/respond';
import { ID_RE, parseCity, parseQuality } from './market';

/** Candidatas da escolha automática: mercados de cidade (o Black Market só entra se pedido). */
export const FORECAST_AUTO_CITIES: City[] = [...ROYAL_CITIES, 'Caerleon', 'Brecilien'];
/** O AODP devolve uns 30 dias de histórico diário sem `date=`; pedir mais exigiria outra URL (e outro cache). */
const HISTORY_DAYS = 31;
/** Sem histórico em nenhuma cidade: a resposta precisa de uma cidade; Caerleon é o maior mercado. */
const FALLBACK_CITY: City = 'Caerleon';

export function toResponse(id: string, quality: Quality, city: City, r: ForecastResult, fetchedAt: string): ForecastResponse {
  return {
    id,
    quality,
    city,
    history: r.history.map((p) => ({ date: p.date, avg: p.avg, count: p.count })),
    forecast: r.forecast,
    backtest: r.backtest,
    method: r.method,
    fetchedAt,
  };
}

/** Escolhe a cidade e monta a previsão a partir do histórico já normalizado (exportada para teste). */
export function forecastFromHistory(
  id: string,
  quality: Quality,
  wanted: City | null,
  history: { city: City; points: HistoryPoint[] }[],
  now: number,
  fetchedAt: string,
): ForecastResponse {
  const city = wanted ?? mostLiquidCity(history, FORECAST_AUTO_CITIES, now) ?? FALLBACK_CITY;
  const points = history.find((h) => h.city === city)?.points ?? [];
  return toResponse(id, quality, city, buildForecast(points, now, city), fetchedAt);
}

export async function getForecast(ctx: ExecutionContext, rawId: string, quality: Quality, wanted: City | null): Promise<{ data: ForecastResponse; ageS: number }> {
  const id = rawId.toUpperCase();
  const hist = await aodpHistoryMeta(id, ALL_CITIES, quality, HISTORY_DAYS, ctx);
  const now = Date.now();
  const ageS = Math.max(0, Math.floor((now - Date.parse(hist.at)) / 1000)) || 0;
  return { data: forecastFromHistory(id, quality, wanted, hist.data, now, hist.at), ageS };
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

export async function handleForecast(request: Request, url: URL, _env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const m = /^\/api\/forecast\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'método não permitido' }, 405, 0, { Allow: 'GET, HEAD' });
  }
  const id = safeDecode(m[1]);
  if (!id || !ID_RE.test(id)) return badRequest('Id de item inválido.');
  const quality = parseQuality(url.searchParams.get('q'));
  if (quality === null) return badRequest('Qualidade inválida (use de 1 a 5).');
  const cityRaw = (url.searchParams.get('city') ?? '').trim();
  const city = cityRaw ? parseCity(cityRaw) : null;
  if (cityRaw && !city) return badRequest(`Cidade desconhecida: "${cityRaw.slice(0, 40)}".`);
  try {
    const { data, ageS } = await getForecast(ctx, id, quality, city);
    // o histórico tem 1 h de cache: o navegador guarda só o que falta para ele vencer
    return json(data, 200, Math.max(60, TTL.history - ageS));
  } catch (err) {
    if (err instanceof AodpError && err.status === 400) return badRequest(err.message);
    return upstreamError(err);
  }
}
