// Previsão de preço com acerto publicado (Fase 3, módulo d). Lógica pura, sem rede: o Worker
// (worker/api/forecast.ts) entrega o histórico diário do AODP e devolve o que sai daqui; a tela só mostra.
//
// Modelo, de propósito simples:
// - Série: média de venda por dia (dia do AODP = dia UTC, fecha às 21h de Brasília) de uma cidade. O dia de
//   hoje (UTC) fica de fora: ainda está em andamento e a média dele muda até fechar.
// - Com 21 dias ou mais com venda e cada dia da semana visto ao menos 2 vezes: média móvel exponencial (MME)
//   sobre o log do preço, com um ajuste por dia da semana (encolhido quando há poucas observações). O peso da
//   MME (alfa) é escolhido só com os dados de treino de cada rodada.
// - Com menos: mediana dos últimos 7 dias com venda (robusta a um dia fora da curva).
// - Teste walk-forward nos últimos 14 dias: em cada dia com venda, o modelo só enxerga o passado e prevê 1, 2 e 3
//   dias à frente; o ingênuo repete o último valor. Erro médio absoluto (MAE, em prata) de cada um.
// - Se o modelo não erra menos que o ingênuo, a previsão publicada É a ingênua, e a tela diz isso.
// - Faixa P10–P90: quantis da razão real/previsto no próprio teste (por horizonte quando há amostra, senão
//   todos juntos). Com ~14 rodadas a faixa é grosseira, e a página de metodologia avisa.

export interface DayPoint {
  date: string; // AAAA-MM-DD (UTC)
  avg: number;
  count: number;
}

export interface ForecastPoint {
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface BacktestScore {
  /** Rodadas (dias de origem) avaliadas no teste. */
  days: number;
  maeModel: number | null;
  maeNaive: number | null;
  beatsNaive: boolean | null;
}

export type ForecastModel = 'mme_semana' | 'mediana';
export type ForecastStatus = 'ok' | 'insuficiente' | 'desatualizado';

export interface ForecastResult {
  status: ForecastStatus;
  /** Modelo do procedimento testado (o que teria sido publicado se batesse o ingênuo). */
  model: ForecastModel | null;
  /** O que foi publicado em `forecast`. */
  published: ForecastModel | 'ingenuo' | null;
  history: DayPoint[];
  forecast: ForecastPoint[];
  backtest: BacktestScore;
  method: string;
}

export const HORIZON = 3;
export const BACKTEST_DAYS = 14;
/** Dias com venda que o modelo precisa enxergar para prever numa rodada do teste. */
export const MIN_TRAIN = 7;
/** Dias com venda no total para tentar prever (treino mínimo + teste com algumas rodadas). */
export const MIN_DAYS = 14;
/** Rodadas mínimas no teste para publicar um placar. */
export const MIN_ROUNDS = 5;
/** Último dia com venda há mais que isto (em dias, contando de ontem) → série velha demais para prever. */
export const MAX_GAP_DAYS = 2;
/** A partir de quantos dias com venda entra o ajuste por dia da semana. */
export const DOW_MIN_DAYS = 21;
const ALPHAS = [0.2, 0.35, 0.5, 0.7];
const DAY_MS = 86_400_000;

// ---------- datas ----------

export function dayNumber(ymd: string): number {
  return Math.round(Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}
export function ymdOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
export function addDays(ymd: string, n: number): string {
  return ymdOf(dayNumber(ymd) + n);
}
/** 0 = domingo … 6 = sábado (dia UTC). */
export function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7; // 1970-01-01 foi quinta
}

// ---------- estatística ----------

/** Quantil com interpolação linear (q de 0 a 1). Lista vazia → null. */
export function quantile(values: number[], q: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
function med(values: number[]): number {
  return quantile(values, 0.5) ?? 0;
}
function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// ---------- série ----------

/** Ordena, tira dia inválido, repetido ou de hoje em diante (`today` = AAAA-MM-DD UTC). */
export function cleanSeries(points: DayPoint[], today: string): DayPoint[] {
  const byDate = new Map<string, DayPoint>();
  for (const p of points) {
    if (!p || typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(p.date)) continue;
    if (!(Number.isFinite(p.avg) && p.avg > 0)) continue;
    const date = p.date.slice(0, 10);
    if (date >= today) continue;
    byDate.set(date, { date, avg: p.avg, count: Number.isFinite(p.count) && p.count > 0 ? p.count : 0 });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

interface Obs {
  t: number; // número do dia
  y: number; // log do preço
}

function toObs(points: DayPoint[]): Obs[] {
  return points.map((p) => ({ t: dayNumber(p.date), y: Math.log(p.avg) }));
}

/**
 * Prende cada valor a mediana ± 4 desvios absolutos medianos, nunca mais apertado que ±50%: um dia com venda
 * absurda não arrasta a média, mas o padrão de fim de semana (que é real) não é aparado.
 */
function clip(obs: Obs[]): Obs[] {
  if (obs.length < 5) return obs;
  const m = med(obs.map((o) => o.y));
  const mad = med(obs.map((o) => Math.abs(o.y - m))) * 1.4826;
  if (!(mad > 0)) return obs;
  const bound = Math.max(4 * mad, Math.log(1.5));
  const lo = m - bound;
  const hi = m + bound;
  return obs.map((o) => ({ t: o.t, y: Math.min(hi, Math.max(lo, o.y)) }));
}

/**
 * Ajuste por dia da semana (em log): para cada dia, diferença para a mediana da vizinhança de ±3 dias; média por
 * dia da semana, encolhida por n/(n+2) e centrada em zero. Sem vizinhança suficiente, o dia fica sem ajuste.
 */
export function weekdayFactors(obs: Obs[]): number[] {
  const sums = new Array<number>(7).fill(0);
  const ns = new Array<number>(7).fill(0);
  for (const o of obs) {
    const near = obs.filter((x) => Math.abs(x.t - o.t) <= 3).map((x) => x.y);
    if (near.length < 4) continue;
    const w = weekday(o.t);
    sums[w] += o.y - med(near);
    ns[w] += 1;
  }
  const raw = sums.map((s, w) => (ns[w] ? (s / ns[w]) * (ns[w] / (ns[w] + 2)) : 0));
  const seen = raw.filter((_, w) => ns[w] > 0);
  const center = seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0;
  return raw.map((f, w) => (ns[w] ? f - center : 0));
}

/** Nível da MME sobre z e o erro de um passo à frente (soma, a partir do 3º ponto). */
function ema(z: number[], alpha: number): { level: number; err: number } {
  let level = z[0];
  let err = 0;
  for (let i = 1; i < z.length; i++) {
    if (i >= 2) err += Math.abs(z[i] - level);
    level = alpha * z[i] + (1 - alpha) * level;
  }
  return { level, err };
}

/**
 * Dá para estimar o ajuste por dia da semana? ≥ DOW_MIN_DAYS dias com venda e cada dia da semana visto ao menos
 * 2 vezes. Regra única: vale para escolher o modelo e para aplicar o ajuste, no teste e na previsão final.
 */
function weekdayReady(days: number[]): boolean {
  if (days.length < DOW_MIN_DAYS) return false;
  const ns = new Array<number>(7).fill(0);
  for (const d of days) ns[weekday(d)]++;
  return ns.every((n) => n >= 2);
}

function factorsFor(c: Obs[]): number[] {
  return weekdayReady(c.map((o) => o.t)) ? weekdayFactors(c) : new Array<number>(7).fill(0);
}

/** Previsão (em prata) para cada dia-alvo, só com as observações de treino. */
export function predict(model: ForecastModel | 'ingenuo', train: Obs[], targets: number[]): number[] {
  if (!train.length) return targets.map(() => NaN);
  if (model === 'ingenuo') return targets.map(() => Math.exp(train[train.length - 1].y));
  const c = clip(train);
  if (model === 'mediana') {
    const v = Math.exp(med(c.slice(-7).map((o) => o.y)));
    return targets.map(() => v);
  }
  const f = factorsFor(c);
  const z = c.map((o) => o.y - f[weekday(o.t)]);
  let best = { level: z[z.length - 1], err: Infinity };
  for (const a of ALPHAS) {
    const r = ema(z, a);
    if (r.err < best.err) best = r;
  }
  return targets.map((t) => Math.exp(best.level + f[weekday(t)]));
}

/** Alfa que a MME usaria com estas observações (só para o texto do método). */
function chosenAlpha(train: Obs[]): number {
  const c = clip(train);
  const f = factorsFor(c);
  const z = c.map((o) => o.y - f[weekday(o.t)]);
  let best = { a: ALPHAS[0], err: Infinity };
  for (const a of ALPHAS) {
    const r = ema(z, a);
    if (r.err < best.err) best = { a, err: r.err };
  }
  return best.a;
}

export function chooseModel(points: DayPoint[]): ForecastModel {
  return weekdayReady(points.map((p) => dayNumber(p.date))) ? 'mme_semana' : 'mediana';
}

export interface BacktestPair {
  origin: number;
  h: number;
  actual: number;
  model: number;
  naive: number;
}

/**
 * Walk-forward: origens = dias com venda entre os últimos BACKTEST_DAYS (antes do último), alvos 1..HORIZON.
 * Sem `model`, cada rodada escolhe o modelo com `chooseModel` só sobre o treino dela: o procedimento testado é o
 * mesmo da previsão publicada (escolher pela regra e prever), sem olhar os dias do teste.
 */
export function backtestPairs(points: DayPoint[], model?: ForecastModel): BacktestPair[] {
  const obs = toObs(points);
  if (!obs.length) return [];
  const last = obs[obs.length - 1].t;
  const byDay = new Map(points.map((p) => [dayNumber(p.date), p.avg]));
  const pairs: BacktestPair[] = [];
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i].t;
    if (o < last - BACKTEST_DAYS || o >= last) continue;
    const train = obs.slice(0, i + 1);
    if (train.length < MIN_TRAIN) continue;
    const targets: number[] = [];
    for (let h = 1; h <= HORIZON; h++) if (o + h <= last && byDay.has(o + h)) targets.push(o + h);
    if (!targets.length) continue;
    const pm = predict(model ?? chooseModel(points.slice(0, i + 1)), train, targets);
    const pn = predict('ingenuo', train, targets);
    targets.forEach((t, k) => pairs.push({ origin: o, h: t - o, actual: byDay.get(t)!, model: pm[k], naive: pn[k] }));
  }
  return pairs;
}

function mae(pairs: BacktestPair[], key: 'model' | 'naive'): number | null {
  const m = mean(pairs.map((p) => Math.abs(p.actual - p[key])));
  return m === null ? null : Math.round(m);
}

/** Razões real/previsto do teste para um horizonte (com amostra pequena, de todos os horizontes). */
function ratios(pairs: BacktestPair[], key: 'model' | 'naive', h: number): number[] {
  const all = pairs.filter((p) => p[key] > 0).map((p) => ({ h: p.h, r: p.actual / p[key] }));
  const mine = all.filter((x) => x.h === h);
  return (mine.length >= 6 ? mine : all).map((x) => x.r);
}

const MODEL_NAME: Record<ForecastModel, string> = {
  mme_semana: 'média móvel exponencial com ajuste por dia da semana',
  mediana: 'mediana dos últimos 7 dias com venda',
};

function fmtN(n: number): string {
  return Math.round(n).toLocaleString('pt-BR');
}
function fmtYmd(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

function empty(status: ForecastStatus, history: DayPoint[], method: string, rounds = 0): ForecastResult {
  return {
    status,
    model: null,
    published: null,
    history,
    forecast: [],
    backtest: { days: rounds, maeModel: null, maeNaive: null, beatsNaive: null },
    method,
  };
}

/**
 * Previsão completa de uma cidade. `points` = histórico diário (qualquer ordem); `now` em ms. Nunca lança: dado
 * insuficiente ou velho volta com `forecast: []` e o motivo em `method`.
 */
export function buildForecast(points: DayPoint[], now: number, place = 'esta cidade'): ForecastResult {
  const today = new Date(now).toISOString().slice(0, 10);
  const history = cleanSeries(points, today);
  if (history.length < MIN_DAYS) {
    return empty(
      'insuficiente',
      history,
      `Dados insuficientes: ${history.length === 0 ? 'nenhum dia' : history.length === 1 ? 'só 1 dia' : `só ${history.length} dias`} com venda registrada em ${place} no período (mínimo de ${MIN_DAYS}).`,
    );
  }
  const lastDate = history[history.length - 1].date;
  const gap = dayNumber(today) - 1 - dayNumber(lastDate);
  if (gap > MAX_GAP_DAYS) {
    return empty(
      'desatualizado',
      history,
      `Sem venda registrada em ${place} desde ${fmtYmd(lastDate)}: prever os próximos dias a partir daí seria chute.`,
    );
  }

  const model = chooseModel(history);
  const pairs = backtestPairs(history);
  const rounds = new Set(pairs.map((p) => p.origin)).size;
  if (rounds < MIN_ROUNDS) {
    return empty(
      'insuficiente',
      history,
      `Dados insuficientes: só ${rounds} ${rounds === 1 ? 'rodada' : 'rodadas'} de teste nos últimos ${BACKTEST_DAYS} dias em ${place} (mínimo de ${MIN_ROUNDS}).`,
      rounds,
    );
  }
  const maeModel = mae(pairs, 'model');
  const maeNaive = mae(pairs, 'naive');
  const beatsNaive = maeModel !== null && maeNaive !== null ? maeModel < maeNaive : null;
  const published: ForecastModel | 'ingenuo' = beatsNaive ? model : 'ingenuo';
  const key = beatsNaive ? 'model' : 'naive';

  // Alvos: hoje (dia em andamento), amanhã e depois, nunca um dia que já passou. Com o último dia com venda
  // anterior a ontem, o horizonte real passa de 3; a faixa usa a do horizonte 3 (teste só vai até lá).
  const obs = toObs(history);
  const lastDay = dayNumber(lastDate);
  const todayN = dayNumber(today);
  const targets = Array.from({ length: HORIZON }, (_, i) => todayN + i);
  const p50s = predict(published, obs, targets);
  const forecast: ForecastPoint[] = targets.map((t, i) => {
    const p50 = Math.round(p50s[i]);
    const rs = ratios(pairs, key, Math.min(HORIZON, t - lastDay));
    const q10 = quantile(rs, 0.1) ?? 1;
    const q90 = quantile(rs, 0.9) ?? 1;
    return {
      date: ymdOf(t),
      p10: Math.max(1, Math.round(Math.min(p50, p50 * q10))),
      p50,
      p90: Math.round(Math.max(p50, p50 * q90)),
    };
  });

  const modelText =
    model === 'mme_semana' ? `${MODEL_NAME.mme_semana} (peso ${chosenAlpha(obs).toLocaleString('pt-BR')} para o dia mais recente)` : MODEL_NAME.mediana;
  const method = beatsNaive
    ? `Modelo: ${modelText}, sobre ${history.length} dias com venda em ${place}. No teste dos últimos ${BACKTEST_DAYS} dias (${rounds} rodadas, 1 a ${HORIZON} dias à frente) errou em média ${fmtN(maeModel!)} prata; repetir o último dia errou ${fmtN(maeNaive!)}.`
    : `Previsão ingênua (repete o último dia com venda). A ${MODEL_NAME[model]} não errou menos que ela no teste dos últimos ${BACKTEST_DAYS} dias (${rounds} rodadas): ${fmtN(maeModel!)} contra ${fmtN(maeNaive!)} prata de erro médio.`;

  const lag = gap > 0 ? ` Último dia com venda: ${fmtYmd(lastDate)}.` : '';
  return { status: 'ok', model, published, history, forecast, backtest: { days: rounds, maeModel, maeNaive, beatsNaive }, method: method + lag };
}

/** Cidade com mais unidades vendidas nos últimos `days` dias (até `now`), entre as candidatas. */
export function mostLiquidCity<C extends string>(series: { city: C; points: DayPoint[] }[], candidates: readonly C[], now: number, days = 14): C | null {
  const since = new Date(now - days * DAY_MS).toISOString().slice(0, 10);
  const ok = new Set<string>(candidates);
  let best: { city: C; vol: number } | null = null;
  for (const s of series) {
    if (!ok.has(s.city)) continue;
    const vol = s.points.filter((p) => p.date.slice(0, 10) >= since).reduce((a, p) => a + (p.count > 0 ? p.count : 0), 0);
    if (vol > 0 && (!best || vol > best.vol)) best = { city: s.city, vol };
  }
  return best?.city ?? null;
}
