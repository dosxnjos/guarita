// Previsão (módulo d): textos e geometria do gráfico, sem DOM. Testado em tests/forecast.test.ts.
// Textos nas duas línguas: `loc` no fim (padrão: a língua atual do site, como em format.ts).
import type { City, ForecastResponse, Quality } from '../../../shared/types';
import { ALL_CITIES } from '../../../shared/market';
import { BACKTEST_DAYS, dayNumber, weekday } from '../../../shared/forecast';
import { extent, linePath, niceTicks, scale } from '../ui/chart';
import { currentLocale, intlLocaleFor, type Locale } from '../i18n/core';

const cityEs = (c: string, loc: Locale) => (loc === 'es' && c === 'Black Market' ? 'Mercado Negro' : c);

export type ForecastKind = 'empty' | 'model' | 'naive';

/** empty = sem previsão (dado insuficiente ou velho); naive = o modelo não bateu o ingênuo; model = bateu. */
export function forecastKind(r: ForecastResponse): ForecastKind {
  if (!r.forecast.length) return 'empty';
  return r.backtest.beatsNaive ? 'model' : 'naive';
}

/**
 * Frase curta para o leitor de tela (região role="status"). Gráfico, tabela e método ficam fora de aria-live: o
 * leitor releria tudo a cada troca de cidade ou qualidade.
 */
export function anuncioPrevisao(s: { loading: boolean; error: string; data: ForecastResponse | null }, loc: Locale = currentLocale()): string {
  if (loc === 'es') {
    if (s.loading) return 'Calculando la previsión…';
    if (s.error && !s.data) return `No se pudo calcular la previsión: ${s.error}`;
    if (!s.data) return '';
    const c = cityEs(s.data.city, loc);
    if (s.error) return `No se pudo actualizar. Mostrando la última previsión de ${c}.`;
    const k = forecastKind(s.data);
    if (k === 'empty') return `No hay previsión para este objeto en ${c}.`;
    return k === 'naive'
      ? `Previsión cargada para ${c}: el modelo no superó a la estimación ingenua, así que vale el último precio repetido.`
      : `Previsión cargada para ${c}.`;
  }
  if (s.loading) return 'Calculando a previsão…';
  if (s.error && !s.data) return `Não deu para calcular a previsão: ${s.error}`;
  if (!s.data) return '';
  if (s.error) return `Não deu para atualizar. Mostrando a última previsão de ${s.data.city}.`;
  const k = forecastKind(s.data);
  if (k === 'empty') return `Sem previsão para este item em ${s.data.city}.`;
  return k === 'naive'
    ? `Previsão carregada para ${s.data.city}: o modelo não bateu o palpite ingênuo, então vale o último preço repetido.`
    : `Previsão carregada para ${s.data.city}.`;
}

/** Quanto o modelo errou a menos que o ingênuo (0,25 = 25% menos erro). Negativo = errou mais. */
export function errorGain(r: ForecastResponse): number | null {
  const { maeModel, maeNaive } = r.backtest;
  if (maeModel === null || maeNaive === null || !(maeNaive > 0)) return null;
  return 1 - maeModel / maeNaive;
}

/** "25%" (sem sinal, inteiro): o mesmo arredondamento em todo texto da previsão. */
export const pct = (f: number) => `${Math.round(Math.abs(f) * 100)}%`;
const silver = (n: number, loc: Locale = 'pt') => Math.round(n).toLocaleString(intlLocaleFor(loc));

/** Frase do placar para a tela. */
export function scoreText(r: ForecastResponse, loc: Locale = currentLocale()): string {
  const { maeModel, maeNaive, days } = r.backtest;
  const g = errorGain(r);
  if (loc === 'es') {
    if (maeModel === null || maeNaive === null) return 'Sin marcador: faltan días con venta para probar la previsión.';
    const base = `En la prueba de los últimos ${BACKTEST_DAYS} días (${days} ${days === 1 ? 'ronda' : 'rondas'}), el modelo se equivocó en promedio ${silver(maeModel, loc)} de plata y repetir el último día se equivocó ${silver(maeNaive, loc)}.`;
    if (g === null) return base;
    if (r.backtest.beatsNaive) return `${base} Es un ${pct(g)} menos de error.`;
    return g === 0
      ? `${base} Empate: la página muestra la previsión ingenua.`
      : `${base} El modelo se equivocó un ${pct(g)} más, así que la página muestra la previsión ingenua.`;
  }
  if (maeModel === null || maeNaive === null) return 'Sem placar: faltam dias com venda para testar a previsão.';
  const base = `No teste dos últimos ${BACKTEST_DAYS} dias (${days} ${days === 1 ? 'rodada' : 'rodadas'}), o modelo errou em média ${silver(maeModel)} prata e repetir o último dia errou ${silver(maeNaive)}.`;
  if (g === null) return base;
  if (r.backtest.beatsNaive) return `${base} São ${pct(g)} menos erro.`;
  return g === 0 ? `${base} Empate: a página mostra a previsão ingênua.` : `${base} O modelo errou ${pct(g)} a mais, então a página mostra a previsão ingênua.`;
}

/** Erro médio como fração do último preço ("erra uns 4% do preço"). */
export function relativeError(r: ForecastResponse): number | null {
  const last = r.history.at(-1)?.avg;
  const mae = r.backtest.beatsNaive ? r.backtest.maeModel : r.backtest.maeNaive;
  if (!last || mae === null) return null;
  return mae / last;
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WD_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** "31/10 (sáb)" a partir de "2026-10-31" (es: "30/10 (vie)"). */
export function dayLabel(ymd: string, loc: Locale = currentLocale()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}/${m[2]} (${(loc === 'es' ? WD_ES : WD)[weekday(dayNumber(ymd))]})`;
}

/** Link da página de previsão (city null = automática). */
export function previsaoHref(id: string, city: City | null, q: Quality): string {
  const p = new URLSearchParams({ item: id });
  if (city) p.set('city', city);
  if (q !== 1) p.set('q', String(q));
  return `/previsao?${p.toString()}`;
}

const CITY_BY_KEY = new Map(ALL_CITIES.map((c) => [c.toLowerCase().replace(/[\s_-]+/g, ''), c]));
export function parseCityParam(s: string | null | undefined): City | null {
  if (!s) return null;
  return CITY_BY_KEY.get(s.trim().toLowerCase().replace(/[\s_-]+/g, '')) ?? null;
}

/** Lê ?item=&city=&q= (e aceita /previsao/:id se o roteador passar `id`). */
export function parsePrevisaoQuery(search: string, paramId?: string): { id: string; city: City | null; q: Quality } {
  const sp = new URLSearchParams(search);
  const raw = (paramId || sp.get('item') || '').trim().toUpperCase();
  const id = /^[A-Z0-9_]{2,80}(@[0-4])?$/.test(raw) ? raw : '';
  const n = Number(sp.get('q'));
  const q = (Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1) as Quality;
  return { id, city: parseCityParam(sp.get('city')), q };
}

// ---------- gráfico ----------

export interface ForecastGeometry {
  w: number;
  /** Linha do histórico (quebra em dia sem venda). */
  history: string;
  /** Linha tracejada do último dia real até a previsão central. */
  forecast: string;
  /** Polígono da faixa P10–P90 (começa no último dia real). */
  band: string;
  /** Ponto do último dia real. */
  last: [number, number] | null;
  /** x onde começa a previsão (linha vertical "hoje"). */
  splitX: number | null;
  ticks: { v: number; y: number }[];
  xTicks: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[];
  forecastDots: [number, number][];
}

export function forecastGeometry(
  r: ForecastResponse,
  width: number,
  height: number,
  M = { top: 12, right: 14, bottom: 26, left: 52 },
): ForecastGeometry {
  const w = Math.max(260, width);
  const hist = r.history.filter((p) => p.avg > 0);
  const days = [...hist.map((p) => dayNumber(p.date)), ...r.forecast.map((f) => dayNumber(f.date))];
  if (!days.length) return { w, history: '', forecast: '', band: '', last: null, splitX: null, ticks: [], xTicks: [], forecastDots: [] };
  const d0 = Math.min(...days);
  const d1 = Math.max(...days);
  const vals = [...hist.map((p) => p.avg), ...r.forecast.flatMap((f) => [f.p10, f.p90])];
  const [lo, hi] = extent(vals);
  const x = scale(d0, d1 === d0 ? d0 + 1 : d1, M.left, w - M.right);
  const y = scale(lo, hi, height - M.bottom, M.top);

  const byDay = new Map(hist.map((p) => [dayNumber(p.date), p.avg]));
  const hd0 = hist.length ? dayNumber(hist[0].date) : d0;
  const hd1 = hist.length ? dayNumber(hist[hist.length - 1].date) : d0;
  const pts: ([number, number] | null)[] = [];
  for (let d = hd0; d <= hd1 && hist.length; d++) pts.push(byDay.has(d) ? [x(d), y(byDay.get(d)!)] : null);

  const lastP = hist.at(-1);
  const last: [number, number] | null = lastP ? [x(dayNumber(lastP.date)), y(lastP.avg)] : null;
  const fc = r.forecast.map((f) => ({ x: x(dayNumber(f.date)), p10: y(f.p10), p50: y(f.p50), p90: y(f.p90) }));
  const forecastDots = fc.map((f) => [f.x, f.p50] as [number, number]);
  const forecast = fc.length ? linePath([...(last ? [last] : []), ...forecastDots]) : '';
  let band = '';
  if (fc.length) {
    const top = [...(last ? [last] : []), ...fc.map((f) => [f.x, f.p90] as [number, number])];
    const bottom = [...fc.map((f) => [f.x, f.p10] as [number, number])].reverse();
    band = linePath([...top, ...bottom]) + 'Z';
  }

  const ticks = niceTicks(lo, hi, 4).filter((t) => t >= lo && t <= hi).map((v) => ({ v, y: y(v) }));
  const lab = (d: number) => {
    const s = new Date(d * 86_400_000).toISOString();
    return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  };
  const xs = [...new Set([d0, Math.round((d0 + d1) / 2), d1])];
  const xTicks = xs.map((d, i) => ({ x: x(d), label: lab(d), anchor: (xs.length === 1 ? 'middle' : i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle') as 'start' | 'middle' | 'end' }));

  return { w, history: linePath(pts), forecast, band, last, splitX: last && fc.length ? last[0] : null, ticks, xTicks, forecastDots };
}
