// Módulo (d) da Fase 3: GET /api/forecast/:id?city=&q= — previsão de 1 a 3 dias com o placar do teste.
// Um pedido de histórico ao AODP (todas as cidades, mesma URL e cache de 1 h da página de item: quem abriu o item
// já pagou a chamada), no máximo 3 subrequests (cache match, fetch, cache put). A conta é pura (shared/forecast.ts)
// e leva menos de 1 ms. `city` vazio ou ausente → a cidade com mais unidades vendidas nos últimos 14 dias.
//
// Línguas: `?lang=es` devolve `method` (e os erros 400) em espanhol; padrão pt, igual a antes. O texto em pt nasce em
// shared/forecast.ts e é traduzido aqui por molde (forecastMethodEs); molde desconhecido fica em pt, e o teste
// tests/i18n-economia.test.ts passa por todos os ramos para pegar a deriva. O histórico (o subrequest) é o mesmo para
// as duas línguas; a resposta HTTP varia pela URL inteira, que já leva o lang.
import type { Env } from '../env';
import type { City, ForecastResponse, Quality } from '../../shared/types';
import { ALL_CITIES, ROYAL_CITIES } from '../../shared/market';
import { buildForecast, mostLiquidCity, type ForecastResult } from '../../shared/forecast';
import { AodpError, TTL, aodpHistoryMeta, type HistoryPoint } from '../lib/aodp';
import { badRequest, json, upstreamError } from '../lib/respond';
import { ID_RE, parseCity, parseQuality } from './market';

export type ForecastLang = 'pt' | 'es';

/** Candidatas da escolha automática: mercados de cidade (o Black Market só entra se pedido). */
export const FORECAST_AUTO_CITIES: City[] = [...ROYAL_CITIES, 'Caerleon', 'Brecilien'];
/** O AODP devolve uns 30 dias de histórico diário sem `date=`; pedir mais exigiria outra URL (e outro cache). */
const HISTORY_DAYS = 31;
/** Sem histórico em nenhuma cidade: a resposta precisa de uma cidade; Caerleon é o maior mercado. */
const FALLBACK_CITY: City = 'Caerleon';

/** Língua normalizada: só "es" vira espanhol. */
export function forecastLang(v: unknown): ForecastLang {
  return typeof v === 'string' && v.trim().toLowerCase() === 'es' ? 'es' : 'pt';
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Número no formato pt-BR ("1.234", "0,35") → es-419 ("1,234", "0.35"). */
const numEs = (s: string) => s.replace(/[.,]/g, (c) => (c === '.' ? ',' : '.'));
const MODEL_ES: Record<string, string> = {
  'média móvel exponencial com ajuste por dia da semana': 'media móvil exponencial con ajuste por día de la semana',
  'mediana dos últimos 7 dias com venda': 'mediana de los últimos 7 días con venta',
};
function modelEs(pt: string): string | null {
  const peso = /^(.+) \(peso ([\d.,]+) para o dia mais recente\)$/.exec(pt);
  if (peso) {
    const base = MODEL_ES[peso[1]];
    return base ? `${base} (peso ${numEs(peso[2])} para el día más reciente)` : null;
  }
  return MODEL_ES[pt] ?? null;
}

/**
 * `method` de shared/forecast.ts (pt) → espanhol, molde a molde. `place` é a cidade passada ao buildForecast. Molde
 * que não casa volta em pt (melhor que inventar), e o teste de deriva acusa.
 */
export function forecastMethodEs(pt: string, place: string): string {
  const P = escapeRe(place);
  const pe = place === 'Black Market' ? 'Mercado Negro' : place;
  const N = '([\\d.,]+)';
  let body = pt;
  let lag = '';
  const lm = / Último dia com venda: (\d{2}\/\d{2})\.$/.exec(pt);
  if (lm) {
    body = pt.slice(0, lm.index);
    lag = ` Último día con venta: ${lm[1]}.`;
  }
  let m = new RegExp(`^Dados insuficientes: (nenhum dia|só 1 dia|só (\\d+) dias) com venda registrada em ${P} no período \\(mínimo de (\\d+)\\)\\.$`).exec(body);
  if (m) {
    const d = m[1] === 'nenhum dia' ? 'ningún día' : m[1] === 'só 1 dia' ? 'solo 1 día' : `solo ${m[2]} días`;
    return `Datos insuficientes: ${d} con venta registrada en ${pe} en el período (mínimo de ${m[3]}).${lag}`;
  }
  m = new RegExp(`^Sem venda registrada em ${P} desde (\\d{2}/\\d{2}): prever os próximos dias a partir daí seria chute\\.$`).exec(body);
  if (m) return `No hay ventas registradas en ${pe} desde el ${m[1]}: prever los próximos días a partir de ahí sería adivinar.${lag}`;
  m = new RegExp(`^Dados insuficientes: só (\\d+) (?:rodada|rodadas) de teste nos últimos (\\d+) dias em ${P} \\(mínimo de (\\d+)\\)\\.$`).exec(body);
  if (m) {
    return `Datos insuficientes: solo ${m[1]} ${m[1] === '1' ? 'ronda' : 'rondas'} de prueba en los últimos ${m[2]} días en ${pe} (mínimo de ${m[3]}).${lag}`;
  }
  m = new RegExp(
    `^Modelo: (.+), sobre (\\d+) dias com venda em ${P}\\. No teste dos últimos (\\d+) dias \\((\\d+) rodadas, 1 a (\\d+) dias à frente\\) errou em média ${N} prata; repetir o último dia errou ${N}\\.$`,
  ).exec(body);
  if (m) {
    const model = modelEs(m[1]);
    if (model) {
      return `Modelo: ${model}, sobre ${m[2]} días con venta en ${pe}. En la prueba de los últimos ${m[3]} días (${m[4]} rondas, de 1 a ${m[5]} días hacia adelante) se equivocó en promedio ${numEs(m[6])} de plata; repetir el último día se equivocó ${numEs(m[7])}.${lag}`;
    }
  }
  m = new RegExp(
    `^Previsão ingênua \\(repete o último dia com venda\\)\\. A (.+) não errou menos que ela no teste dos últimos (\\d+) dias \\((\\d+) rodadas\\): ${N} contra ${N} prata de erro médio\\.$`,
  ).exec(body);
  if (m) {
    const model = modelEs(m[1]);
    if (model) {
      return `Previsión ingenua (repite el último día con venta). La ${model} no se equivocó menos que ella en la prueba de los últimos ${m[2]} días (${m[3]} rondas): ${numEs(m[4])} contra ${numEs(m[5])} de plata de error medio.${lag}`;
    }
  }
  return pt;
}

export function toResponse(id: string, quality: Quality, city: City, r: ForecastResult, fetchedAt: string, lang: ForecastLang = 'pt'): ForecastResponse {
  return {
    id,
    quality,
    city,
    history: r.history.map((p) => ({ date: p.date, avg: p.avg, count: p.count })),
    forecast: r.forecast,
    backtest: r.backtest,
    method: lang === 'es' ? forecastMethodEs(r.method, city) : r.method,
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
  lang: ForecastLang = 'pt',
): ForecastResponse {
  const city = wanted ?? mostLiquidCity(history, FORECAST_AUTO_CITIES, now) ?? FALLBACK_CITY;
  const points = history.find((h) => h.city === city)?.points ?? [];
  return toResponse(id, quality, city, buildForecast(points, now, city), fetchedAt, lang);
}

export async function getForecast(
  ctx: ExecutionContext, rawId: string, quality: Quality, wanted: City | null, lang: ForecastLang = 'pt',
): Promise<{ data: ForecastResponse; ageS: number }> {
  const id = rawId.toUpperCase();
  const hist = await aodpHistoryMeta(id, ALL_CITIES, quality, HISTORY_DAYS, ctx);
  const now = Date.now();
  const ageS = Math.max(0, Math.floor((now - Date.parse(hist.at)) / 1000)) || 0;
  return { data: forecastFromHistory(id, quality, wanted, hist.data, now, hist.at, lang), ageS };
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
  const lang = forecastLang(url.searchParams.get('lang'));
  const es = lang === 'es';
  const id = safeDecode(m[1]);
  if (!id || !ID_RE.test(id)) return badRequest(es ? 'Id de objeto no válido.' : 'Id de item inválido.');
  const quality = parseQuality(url.searchParams.get('q'));
  if (quality === null) return badRequest(es ? 'Calidad no válida (usa de 1 a 5).' : 'Qualidade inválida (use de 1 a 5).');
  const cityRaw = (url.searchParams.get('city') ?? '').trim();
  const city = cityRaw ? parseCity(cityRaw) : null;
  if (cityRaw && !city) return badRequest(es ? `Ciudad desconocida: "${cityRaw.slice(0, 40)}".` : `Cidade desconhecida: "${cityRaw.slice(0, 40)}".`);
  try {
    const { data, ageS } = await getForecast(ctx, id, quality, city, lang);
    // o histórico tem 1 h de cache: o navegador guarda só o que falta para ele vencer
    return json(data, 200, Math.max(60, TTL.history - ageS));
  } catch (err) {
    if (err instanceof AodpError && err.status === 400) return badRequest(err.message);
    return upstreamError(err);
  }
}
