import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKTEST_DAYS, HORIZON, MIN_DAYS, addDays, backtestPairs, buildForecast, chooseModel, cleanSeries, dayNumber,
  mostLiquidCity, quantile, weekday, type DayPoint,
} from '../shared/forecast';
import { forecastFromHistory, getForecast, handleForecast } from '../worker/api/forecast';
import { routeForecast } from '../worker/api/routesF3';
import { normalizeHistory } from '../worker/lib/aodp';
import type { Env } from '../worker/env';
import type { ForecastResponse } from '../shared/types';
import { aodpFixtureRoute, fixture, jsonRes, mockCaches, mockFetch } from './helpers/net';
import {
  anuncioPrevisao, dayLabel, errorGain, forecastGeometry, forecastKind, parsePrevisaoQuery, previsaoHref, relativeError, scoreText,
} from '../src/lib/forecast/view';

const env = {} as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const NOW = Date.parse('2026-10-30T12:00:00Z');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Série diária terminando ontem (29/10), um valor por dia, mais antigo primeiro. */
function series(values: (number | null)[], end = '2026-10-29', count = 100): DayPoint[] {
  const out: DayPoint[] = [];
  values.forEach((v, i) => {
    if (v !== null) out.push({ date: addDays(end, i - values.length + 1), avg: v, count });
  });
  return out;
}

/** Gerador determinístico (LCG) para ruído reproduzível. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('previsão: utilitários', () => {
  it('datas e dia da semana em UTC', () => {
    expect(weekday(dayNumber('2026-10-30'))).toBe(5); // sexta
    expect(weekday(dayNumber('2026-11-01'))).toBe(0); // domingo
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('quantil interpolado', () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1);
  });

  it('limpa a série: tira hoje, dia futuro, repetido, preço inválido; ordena', () => {
    const r = cleanSeries(
      [
        { date: '2026-10-30', avg: 10, count: 1 },
        { date: '2026-10-31', avg: 10, count: 1 },
        { date: '2026-10-28', avg: 0, count: 5 },
        { date: '2026-10-29T00:00:00', avg: 12, count: 1 },
        { date: '2026-10-27', avg: 11, count: 2 },
        { date: '2026-10-27', avg: 13, count: 2 },
        { date: 'lixo', avg: 5, count: 1 },
      ],
      '2026-10-30',
    );
    expect(r).toEqual([
      { date: '2026-10-27', avg: 13, count: 2 },
      { date: '2026-10-29', avg: 12, count: 1 },
    ]);
  });

  it('escolhe a MME com dia da semana só com dados suficientes', () => {
    expect(chooseModel(series(Array(20).fill(100)))).toBe('mediana');
    expect(chooseModel(series(Array(21).fill(100)))).toBe('mme_semana');
    // 30 dias, mas faltando todas as segundas: sem dia da semana visto 2 vezes
    const noMondays = series(Array(30).fill(100)).filter((p) => weekday(dayNumber(p.date)) !== 1);
    expect(chooseModel(noMondays)).toBe('mediana');
  });

  it('cidade mais negociada nas últimas 2 semanas, entre as candidatas', () => {
    const s = [
      { city: 'Lymhurst', points: series(Array(14).fill(10), '2026-10-29', 50) },
      { city: 'Caerleon', points: series(Array(14).fill(10), '2026-10-29', 80) },
      { city: 'Black Market', points: series(Array(14).fill(10), '2026-10-29', 999) },
      { city: 'Martlock', points: series(Array(5).fill(10), '2026-10-01', 5000) }, // volume antigo não conta
    ];
    expect(mostLiquidCity(s, ['Lymhurst', 'Caerleon', 'Martlock'], NOW)).toBe('Caerleon');
    expect(mostLiquidCity(s, ['Martlock'], NOW)).toBeNull();
  });
});

describe('previsão: modelo e teste', () => {
  it('dado insuficiente: vazio explicado, sem placar', () => {
    const r = buildForecast(series(Array(MIN_DAYS - 1).fill(100)), NOW, 'Lymhurst');
    expect(r.status).toBe('insuficiente');
    expect(r.forecast).toEqual([]);
    expect(r.backtest).toEqual({ days: 0, maeModel: null, maeNaive: null, beatsNaive: null });
    expect(r.method).toMatch(/só 13 dias com venda registrada em Lymhurst/);
    expect(buildForecast([], NOW).method).toMatch(/nenhum dia/);
  });

  it('série velha (última venda há mais de 3 dias): não prevê', () => {
    const r = buildForecast(series(Array(25).fill(100), '2026-10-20'), NOW, 'Thetford');
    expect(r.status).toBe('desatualizado');
    expect(r.forecast).toEqual([]);
    expect(r.method).toMatch(/desde 20\/10/);
    expect(r.history).toHaveLength(25);
  });

  it('o dia de hoje (em andamento) não entra na conta', () => {
    const pts = [...series(Array(20).fill(100)), { date: '2026-10-30', avg: 99999, count: 1 }];
    const r = buildForecast(pts, NOW);
    expect(r.history.at(-1)!.date).toBe('2026-10-29');
    expect(r.forecast.map((f) => f.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('última venda anteontem: prevê hoje em diante (nunca dia passado) e avisa no método', () => {
    const r = buildForecast(series(Array(20).fill(100), '2026-10-27'), NOW);
    expect(r.status).toBe('ok');
    expect(r.forecast.map((f) => f.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(r.method).toMatch(/Último dia com venda: 27\/10\.$/);
    expect(buildForecast(series(Array(20).fill(100), '2026-10-26'), NOW).status).toBe('desatualizado');
  });

  it('preço constante: empate com o ingênuo → publica o ingênuo e diz isso', () => {
    const r = buildForecast(series(Array(30).fill(500)), NOW, 'Lymhurst');
    expect(r.status).toBe('ok');
    expect(r.backtest.maeModel).toBe(0);
    expect(r.backtest.maeNaive).toBe(0);
    expect(r.backtest.beatsNaive).toBe(false);
    expect(r.published).toBe('ingenuo');
    expect(r.forecast).toHaveLength(HORIZON);
    for (const f of r.forecast) expect(f).toMatchObject({ p10: 500, p50: 500, p90: 500 });
    expect(r.method).toMatch(/^Previsão ingênua/);
  });

  it('padrão semanal forte: a MME com dia da semana bate o ingênuo', () => {
    const rand = rng(7);
    const end = '2026-10-29';
    const vals = Array.from({ length: 30 }, (_, i) => {
      const wd = weekday(dayNumber(addDays(end, i - 29)));
      const base = wd === 0 || wd === 6 ? 1300 : 1000; // fim de semana mais caro
      return Math.round(base * (1 + (rand() - 0.5) * 0.04));
    });
    const r = buildForecast(series(vals, end), NOW, 'Martlock');
    expect(r.model).toBe('mme_semana');
    expect(r.backtest.beatsNaive).toBe(true);
    expect(r.published).toBe('mme_semana');
    expect(r.backtest.maeModel!).toBeLessThan(r.backtest.maeNaive!);
    expect(r.backtest.days).toBeGreaterThanOrEqual(10);
    expect(r.backtest.days).toBeLessThanOrEqual(BACKTEST_DAYS);
    // 30/10 sexta, 31/10 sábado, 01/11 domingo: o fim de semana sai mais caro
    const [fri, sat, sun] = r.forecast;
    expect(sat.p50).toBeGreaterThan(fri.p50 * 1.15);
    expect(sun.p50).toBeGreaterThan(fri.p50 * 1.15);
    for (const f of r.forecast) {
      expect(f.p10).toBeLessThanOrEqual(f.p50);
      expect(f.p90).toBeGreaterThanOrEqual(f.p50);
    }
    expect(r.method).toMatch(/^Modelo: média móvel exponencial com ajuste por dia da semana/);
  });

  it('quando o modelo perde, a previsão publicada é o último valor repetido', () => {
    // tendência firme de alta: repetir o último dia erra menos que a média, que fica para trás
    const vals = Array.from({ length: 30 }, (_, i) => 1000 + i * 40);
    const r = buildForecast(series(vals), NOW);
    expect(r.backtest.beatsNaive).toBe(false);
    expect(r.forecast.every((f) => f.p50 === vals[vals.length - 1])).toBe(true);
  });

  it('um dia com preço absurdo não arrasta a mediana', () => {
    const vals: number[] = Array(16).fill(1000);
    vals[vals.length - 2] = 50_000;
    const r = buildForecast(series(vals), NOW);
    expect(r.model).toBe('mediana');
    expect(r.backtest.maeModel!).toBeLessThan(r.backtest.maeNaive!);
    expect(r.forecast[0].p50).toBe(1000);
  });

  it('teste walk-forward sem olhar o futuro: mudar o último dia não muda nenhuma previsão do teste', () => {
    const rand = rng(3);
    const vals = Array.from({ length: 30 }, () => Math.round(1000 + rand() * 200));
    const a = backtestPairs(series(vals), 'mme_semana');
    const vals2 = [...vals];
    vals2[29] = 5000;
    const b = backtestPairs(series(vals2), 'mme_semana');
    expect(a.length).toBe(b.length);
    expect(a.map((p) => p.model)).toEqual(b.map((p) => p.model));
    expect(a.map((p) => p.naive)).toEqual(b.map((p) => p.naive));
    // origens só dentro dos últimos 14 dias e antes do último; alvo a 1..3 dias
    const last = dayNumber('2026-10-29');
    for (const p of a) {
      expect(p.origin).toBeGreaterThanOrEqual(last - BACKTEST_DAYS);
      expect(p.origin).toBeLessThan(last);
      expect(p.h).toBeGreaterThanOrEqual(1);
      expect(p.h).toBeLessThanOrEqual(HORIZON);
    }
  });

  it('o teste mede o procedimento publicado: cada rodada escolhe o modelo só com o treino dela', () => {
    const rand = rng(7);
    const vals = Array.from({ length: 24 }, (_, i) => Math.round(1000 + (i % 7 === 5 ? 150 : 0) + rand() * 80));
    const s = series(vals);
    expect(chooseModel(s)).toBe('mme_semana'); // com o histórico inteiro, a regra pede a MME
    const auto = backtestPairs(s);
    const med = backtestPairs(s, 'mediana');
    const mme = backtestPairs(s, 'mme_semana');
    expect(auto.length).toBe(med.length);
    const firstDay = dayNumber(s[0].date);
    auto.forEach((p, k) => {
      const trainDays = p.origin - firstDay + 1; // série sem buraco: dias de treino = posição da origem + 1
      const esperado = trainDays >= 21 ? mme[k] : med[k];
      expect(p.model).toBe(esperado.model);
    });
    // Rodadas com menos de 21 dias de treino usam a mediana, como a regra faria naquele dia.
    expect(auto.some((p) => p.origin - firstDay + 1 < 21)).toBe(true);
  });

  it('dia sem venda no meio: alvo sem dado fica fora do teste', () => {
    const vals: (number | null)[] = Array(30).fill(1000);
    vals[25] = null;
    const pairs = backtestPairs(series(vals), 'mediana');
    const hole = dayNumber(addDays('2026-10-29', 25 - 29));
    expect(pairs.some((p) => p.origin + p.h === hole)).toBe(false);
  });
});

describe('previsão: API', () => {
  it('fixture real (T4_BAG): cidade automática, histórico de 30 dias, previsão de 3 dias', () => {
    const hist = normalizeHistory(fixture('history.json'));
    const r = forecastFromHistory('T4_BAG', 1, null, hist, NOW, '2026-10-30T11:00:00.000Z');
    expect(r.city).toBe('Lymhurst');
    expect(r.history.length).toBeGreaterThanOrEqual(MIN_DAYS);
    expect(r.forecast.map((f) => f.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(r.backtest.maeModel).not.toBeNull();
    expect(typeof r.backtest.beatsNaive).toBe('boolean');
    expect(r.fetchedAt).toBe('2026-10-30T11:00:00.000Z');
    // Thetford parou em 20/10: vazio explicado
    const t = forecastFromHistory('T4_BAG', 1, 'Thetford', hist, NOW, 'x');
    expect(t.city).toBe('Thetford');
    expect(t.forecast).toEqual([]);
    expect(t.method).toMatch(/desde 20\/10/);
    // cidade sem histórico nenhum
    const none = forecastFromHistory('T4_BAG', 1, null, [], NOW, 'x');
    expect(none.city).toBe('Caerleon');
    expect(none.forecast).toEqual([]);
  });

  it('GET /api/forecast/:id: um pedido de histórico com gzip, mesma URL da página de item, cache curto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const res = await routeForecast(new Request('https://x/api/forecast/t4_bag?city=lymhurst'), new URL('https://x/api/forecast/t4_bag?city=lymhurst'), env, ctx);
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as ForecastResponse;
    expect(body.id).toBe('T4_BAG');
    expect(body.city).toBe('Lymhurst');
    expect(body.quality).toBe(1);
    expect(body.forecast).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers['accept-encoding']).toBe('gzip');
    expect(calls[0].url).toContain('/history/T4_BAG?time-scale=24&locations=');
    expect(calls[0].url).toContain('&qualities=1');
    expect(res!.headers.get('Cache-Control')).toBe('public, max-age=3600');
    // segunda chamada (outra cidade) usa o cache: nenhum fetch novo
    const res2 = await handleForecast(new Request('https://x/api/forecast/T4_BAG?city=&q=1'), new URL('https://x/api/forecast/T4_BAG?city=&q=1'), env, ctx);
    expect(res2!.status).toBe(200);
    expect(((await res2!.json()) as ForecastResponse).city).toBe('Lymhurst');
    expect(calls).toHaveLength(1);
  });

  it('parâmetros inválidos → 400; método errado → 405; outra rota → null', async () => {
    mockFetch(() => jsonRes([]));
    const call = (path: string, method = 'GET') => handleForecast(new Request('https://x' + path, { method }), new URL('https://x' + path), env, ctx);
    expect((await call('/api/forecast/T4_BAG?city=Atlantis'))!.status).toBe(400);
    expect((await call('/api/forecast/T4_BAG?q=9'))!.status).toBe(400);
    expect((await call('/api/forecast/%E0%A4%A'))!.status).toBe(400);
    expect((await call('/api/forecast/T4%20BAG'))!.status).toBe(400);
    expect((await call('/api/forecast/T4_BAG', 'POST'))!.status).toBe(405);
    expect(await call('/api/hoje')).toBeNull();
    expect(await call('/api/forecast')).toBeNull();
  });

  it('AODP fora e sem cache → 502 com mensagem', async () => {
    mockFetch(() => new Response('x', { status: 503 }));
    const res = await handleForecast(new Request('https://x/api/forecast/T5_BAG'), new URL('https://x/api/forecast/T5_BAG'), env, ctx);
    expect(res!.status).toBe(502);
    expect(((await res!.json()) as { error: string }).error).toMatch(/AODP/);
  });

  it('getForecast devolve a idade do cache', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockFetch(aodpFixtureRoute);
    const r = await getForecast(ctx, 'T4_BAG', 1, null);
    expect(r.ageS).toBe(0);
    expect(r.data.city).toBe('Lymhurst');
  });
});

describe('previsão: tela', () => {
  const base: ForecastResponse = {
    id: 'T4_BAG',
    quality: 1,
    city: 'Lymhurst',
    history: series(Array(20).fill(1000)).map((p) => ({ ...p })),
    forecast: [
      { date: '2026-10-30', p10: 900, p50: 1000, p90: 1100 },
      { date: '2026-10-31', p10: 880, p50: 1000, p90: 1150 },
      { date: '2026-11-01', p10: 860, p50: 1000, p90: 1200 },
    ],
    backtest: { days: 13, maeModel: 75, maeNaive: 100, beatsNaive: true },
    method: 'm',
    fetchedAt: '2026-10-30T11:00:00Z',
  };

  it('tipo, ganho e frases do placar', () => {
    expect(forecastKind(base)).toBe('model');
    expect(errorGain(base)).toBeCloseTo(0.25);
    expect(scoreText(base)).toMatch(/^No teste dos últimos 14 dias \(13 rodadas\), o modelo errou em média 75 prata e repetir o último dia errou 100\. São 25% menos erro\./);
    const naive = { ...base, backtest: { days: 13, maeModel: 120, maeNaive: 100, beatsNaive: false } };
    expect(forecastKind(naive)).toBe('naive');
    expect(scoreText(naive)).toMatch(/errou 20% a mais, então a página mostra a previsão ingênua/);
    const tie = { ...base, backtest: { days: 13, maeModel: 0, maeNaive: 0, beatsNaive: false } };
    expect(scoreText(tie)).toMatch(/repetir o último dia errou 0\.$/);
    const empty = { ...base, forecast: [], backtest: { days: 0, maeModel: null, maeNaive: null, beatsNaive: null } };
    expect(forecastKind(empty)).toBe('empty');
    expect(scoreText(empty)).toMatch(/Sem placar/);
    expect(relativeError(base)).toBeCloseTo(0.075);
    expect(relativeError(naive)).toBeCloseTo(0.1);
  });

  it('anúncio curto para leitor de tela (gráfico e tabela ficam fora de aria-live)', () => {
    expect(anuncioPrevisao({ loading: true, error: '', data: null })).toMatch(/Calculando/);
    expect(anuncioPrevisao({ loading: false, error: 'API fora', data: null })).toBe('Não deu para calcular a previsão: API fora');
    expect(anuncioPrevisao({ loading: false, error: '', data: base })).toBe('Previsão carregada para Lymhurst.');
    expect(anuncioPrevisao({ loading: false, error: 'x', data: base })).toMatch(/Mostrando a última previsão de Lymhurst/);
    expect(anuncioPrevisao({ loading: false, error: '', data: { ...base, forecast: [] } })).toBe('Sem previsão para este item em Lymhurst.');
    expect(anuncioPrevisao({ loading: false, error: '', data: null })).toBe('');
  });

  it('rótulo do dia, link e leitura da URL', () => {
    expect(dayLabel('2026-10-31')).toBe('31/10 (sáb)');
    expect(previsaoHref('T4_BAG', null, 1)).toBe('/previsao?item=T4_BAG');
    expect(previsaoHref('T4_BAG@1', 'Fort Sterling', 3)).toBe('/previsao?item=T4_BAG%401&city=Fort+Sterling&q=3');
    expect(parsePrevisaoQuery('?item=t4_bag%401&city=fort-sterling&q=3')).toEqual({ id: 'T4_BAG@1', city: 'Fort Sterling', q: 3 });
    expect(parsePrevisaoQuery('?item=<script>&q=9')).toEqual({ id: '', city: null, q: 1 });
    expect(parsePrevisaoQuery('', 'T5_BAG')).toEqual({ id: 'T5_BAG', city: null, q: 1 });
  });

  it('geometria: linha do histórico, faixa fechada a partir do último dia, divisória', () => {
    const g = forecastGeometry(base, 600, 240);
    expect(g.history.startsWith('M')).toBe(true);
    expect(g.band.endsWith('Z')).toBe(true);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const start = `M${r1(g.last![0])} ${r1(g.last![1])}`;
    expect(g.band.startsWith(start)).toBe(true);
    expect(g.forecast.startsWith(start)).toBe(true);
    expect(g.forecastDots).toHaveLength(3);
    expect(g.splitX).toBe(g.last![0]);
    expect(g.xTicks.at(-1)!.label).toBe('01/11');
    const holes = forecastGeometry({ ...base, history: base.history.filter((_, i) => i !== 10) }, 600, 240);
    expect(holes.history.match(/M/g)!.length).toBe(2); // dia sem venda quebra a linha
    const none = forecastGeometry({ ...base, history: [], forecast: [] }, 600, 240);
    expect(none.history).toBe('');
    expect(none.band).toBe('');
  });
});
