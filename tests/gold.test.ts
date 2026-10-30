import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanGold, getGold, goldVerdict, median, parseGoldDays, percentile, routeGoldHealthImpl, summarizeGoldWindow,
} from '../worker/api/goldHealth';
import { getGold as getGoldFromInsights } from '../worker/api/insights';
import { routeGoldHealth } from '../worker/api/routesF2';
import { normalizeGold } from '../worker/lib/aodp';
import type { Env } from '../worker/env';
import { aodpFixtureRoute, fixture, jsonRes, mockCaches, mockFetch } from './helpers/net';
import { fmtBrl, fmtHours, parseDecimalBr, premiumCalc } from '../src/lib/gold/premium';
import { cheaperThanShare, coveredDays, dayBr, goldDaily, goldVerdictText, thin } from '../src/lib/gold/view';

const env = {} as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** n pontos horários terminando em 2026-10-30T00:00Z, mais recente primeiro (como o AODP). */
function series(prices: number[]): { price: number; at: string }[] {
  const end = Date.parse('2026-10-30T00:00:00Z');
  return prices.map((price, i) => ({ price, at: new Date(end - i * 3600_000).toISOString() }));
}

describe('ouro: estatística', () => {
  it('mediana e percentil interpolado', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.9)).toBe(7);
    expect(percentile([0, 10], 0.25)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4);
    expect(percentile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
  });

  it('limpa outlier fora de [mediana/3, mediana×3] e ordena do mais antigo ao mais recente', () => {
    // mediana dos 8 = 8950 → fica o que está em [2983,3; 26850]
    const pts = series([9000, 8900, 1, 9100, 30_000_000, 8800, 3000, 26000]);
    const clean = cleanGold(pts);
    expect(clean.map((p) => p.price)).toEqual([26000, 3000, 8800, 9100, 8900, 9000]);
    expect(cleanGold(series([9000, 8900, 9000, 27001])).map((p) => p.price)).not.toContain(27001);
    expect(clean[0].at < clean[clean.length - 1].at).toBe(true);
    expect(cleanGold([])).toEqual([]);
  });

  it('veredito por quartil, com mínimo de 24 pontos', () => {
    expect(goldVerdict(90, 100, 200, 24)).toBe('barato');
    expect(goldVerdict(210, 100, 200, 24)).toBe('caro');
    expect(goldVerdict(100, 100, 200, 24)).toBe('normal');
    expect(goldVerdict(90, 100, 200, 23)).toBe('sem dado');
    expect(goldVerdict(null, 100, 200, 100)).toBe('sem dado');
  });

  it('resumo: atual é o ponto limpo mais recente, mesmo se o último cru for absurdo', () => {
    const prices = Array.from({ length: 48 }, (_, i) => 9000 + i); // mais recente = 9000 (o menor)
    prices.unshift(1); // ponto mais novo absurdo
    const r = summarizeGoldWindow(series(prices), 'X');
    expect(r.current).toBe(9000);
    expect(r.points).toHaveLength(48);
    expect(r.verdict).toBe('barato');
    expect(r.p10! <= r.p50! && r.p50! <= r.p90!).toBe(true);
    expect(r.fetchedAt).toBe('X');
  });

  it('resumo vazio', () => {
    expect(summarizeGoldWindow([], 'X')).toEqual({ points: [], current: null, p10: null, p50: null, p90: null, verdict: 'sem dado', fetchedAt: 'X' });
  });

  it('resumo da fixture real (30 dias)', () => {
    const raw = normalizeGold(fixture('gold.json'));
    const r = summarizeGoldWindow(raw, 'X');
    expect(r.points.length).toBeGreaterThan(700);
    expect(r.current).toBe(8930);
    expect(r.p10! < r.p90!).toBe(true);
    expect(['barato', 'normal', 'caro']).toContain(r.verdict);
  });

  it('days: só 7, 30 ou 90; vazio vira 30', () => {
    expect(parseGoldDays(null)).toBe(30);
    expect(parseGoldDays('')).toBe(30);
    expect(parseGoldDays('7')).toBe(7);
    expect(parseGoldDays('90')).toBe(90);
    expect(parseGoldDays('15')).toBeNull();
    expect(parseGoldDays('abc')).toBeNull();
  });
});

describe('ouro: getGold e rota', () => {
  // a fixture gold.json termina em 30/10/2026 01:00 UTC; o relógio fica parado logo depois
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-30T02:30:00Z'));
  });

  it('pede days×24 pontos ao AODP com gzip e devolve o contrato', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const r = await getGold(env, ctx, 30);
    expect(calls).toHaveLength(1);
    // days×24 + 1 dia de folga, desde o dia UTC anterior à janela (date= libera mais de 720 pontos)
    expect(calls[0].url).toMatch(/\/gold\.json\?count=744&date=\d{4}-\d{2}-\d{2}$/);
    expect(calls[0].headers['accept-encoding']).toBe('gzip');
    expect(r.current).toBe(8930);
    expect(Date.parse(r.fetchedAt)).not.toBeNaN();
    // segunda chamada vem do cache
    await getGold(env, ctx, 30);
    expect(calls).toHaveLength(1);
    // insights.ts reexporta a mesma função
    expect(getGoldFromInsights).toBe(getGold);
  });

  it('90 dias = 2160 pontos (+24 de folga) com date= do dia anterior à janela', async () => {
    const calls = mockFetch(aodpFixtureRoute);
    await getGold(env, ctx, 90);
    const day = new Date(Date.now() - 91 * 86_400_000).toISOString().slice(0, 10);
    expect(calls[0].url).toContain(`count=2184&date=${day}`);
  });

  it('corta pontos mais velhos que a janela', async () => {
    mockFetch(aodpFixtureRoute);
    const r = await getGold(env, ctx, 7);
    const since = Date.parse('2026-10-23T02:30:00Z');
    expect(r.points.length).toBeGreaterThan(150);
    expect(r.points.every((p) => Date.parse(p.at) >= since)).toBe(true);
  });

  it('rota: 200, 400 em days inválido, 405 em POST, null fora dela', async () => {
    mockFetch(aodpFixtureRoute);
    const get = (u: string, method = 'GET') => routeGoldHealth(new Request(u, { method }), new URL(u), env, ctx);
    const ok = await get('https://x/api/gold?days=7');
    expect(ok!.status).toBe(200);
    expect(ok!.headers.get('cache-control')).toContain('max-age=300');
    const body = (await ok!.json()) as { points: unknown[]; verdict: string };
    expect(body.points.length).toBeGreaterThan(0);
    expect((await get('https://x/api/gold?days=15'))!.status).toBe(400);
    expect((await get('https://x/api/gold', 'POST'))!.status).toBe(405);
    expect(await get('https://x/api/clock')).toBeNull();
  });

  it('rota: AODP fora vira 502 com mensagem', async () => {
    mockFetch(() => jsonRes({ error: 'x' }, 503));
    const u = 'https://x/api/gold?days=30';
    const res = await routeGoldHealthImpl(new Request(u), new URL(u), env, ctx);
    expect(res!.status).toBe(502);
    expect(((await res!.json()) as { error: string }).error).toMatch(/AODP/);
  });
});

describe('calculadora do Premium', () => {
  it('lê número em pt-BR', () => {
    expect(parseDecimalBr('19,90')).toBe(19.9);
    expect(parseDecimalBr('1.234,5')).toBe(1234.5);
    expect(parseDecimalBr('1.000')).toBe(1000);
    expect(parseDecimalBr('1.500.000')).toBe(1500000);
    expect(parseDecimalBr('R$ 29,90')).toBe(29.9);
    expect(parseDecimalBr('12.5')).toBe(12.5);
    expect(parseDecimalBr(' 3750 ')).toBe(3750);
    expect(parseDecimalBr('')).toBeNull();
    expect(parseDecimalBr('abc')).toBeNull();
    expect(parseDecimalBr('1,2,3')).toBeNull();
    expect(parseDecimalBr('1.2.3')).toBeNull();
    expect(parseDecimalBr(null)).toBeNull();
  });

  it('custo em prata, em reais e horas', () => {
    const r = premiumCalc({ goldPrice: 9000, packBrl: 50, packGold: 2000, silverPerHour: 1_500_000 });
    expect(r.premiumGold).toBe(3750);
    expect(r.silver).toBe(33_750_000);
    expect(r.brlPerGold).toBe(0.025);
    expect(r.brl).toBe(93.75);
    expect(r.hours).toBe(22.5);
    expect(r.silverPerBrl).toBe(360_000);
    expect(r.taxSaving).toBeNull();
    expect(r.taxPays).toBeNull();
  });

  it('sem cotação ou campos vazios não inventa número', () => {
    const r = premiumCalc({ goldPrice: null, packBrl: null, packGold: 1000, silverPerHour: 100 });
    expect(r.silver).toBeNull();
    expect(r.brl).toBeNull();
    expect(r.hours).toBeNull();
    expect(premiumCalc({ goldPrice: 9000, packBrl: 10, packGold: 0, silverPerHour: 0 }).brl).toBeNull();
  });

  it('economia de imposto: vendas × 4 pontos percentuais', () => {
    const r = premiumCalc({ goldPrice: 9000, packBrl: null, packGold: null, silverPerHour: null, monthlySales: 1_000_000_000 });
    expect(r.taxSaving).toBe(40_000_000);
    expect(r.taxPays).toBe(true);
    expect(premiumCalc({ goldPrice: 9000, packBrl: null, packGold: null, silverPerHour: null, monthlySales: 10_000_000 }).taxPays).toBe(false);
  });

  it('formata reais e horas', () => {
    expect(fmtBrl(93.75).replace(/\s/g, ' ')).toBe('R$ 93,75');
    expect(fmtBrl(0.025, true).replace(/\s/g, ' ')).toBe('R$ 0,025');
    expect(fmtBrl(null)).toBe('—');
    expect(fmtHours(0.5)).toBe('30 min');
    expect(fmtHours(3 + 1 / 3)).toBe('3 h 20 min');
    expect(fmtHours(22.5)).toBe('23 h');
    expect(fmtHours(52)).toBe('2 dias e 4 h');
    expect(fmtHours(null)).toBe('—');
  });
});

describe('tela do ouro', () => {
  it('fração das horas mais baratas que o atual', () => {
    const pts = series([1, 2, 3, 4]).reverse();
    expect(cheaperThanShare(pts, 3)).toBe(0.5);
    expect(cheaperThanShare([], 3)).toBeNull();
    expect(cheaperThanShare(pts, null)).toBeNull();
  });

  it('dia de Brasília e resumo diário', () => {
    expect(dayBr('2026-10-30T02:00:00Z')).toBe('2026-10-29'); // 23h em Brasília
    const pts = [
      { price: 10, at: '2026-10-29T12:00:00Z' },
      { price: 30, at: '2026-10-29T18:00:00Z' },
      { price: 20, at: '2026-10-30T02:00:00Z' }, // ainda dia 29 em Brasília
      { price: 50, at: '2026-10-30T12:00:00Z' },
    ];
    expect(goldDaily(pts)).toEqual([
      { date: '2026-10-30', min: 50, max: 50, avg: 50, last: 50 },
      { date: '2026-10-29', min: 10, max: 30, avg: 20, last: 20 },
    ]);
  });

  it('afina a série mantendo as pontas', () => {
    const a = Array.from({ length: 2160 }, (_, i) => i);
    const t = thin(a, 400);
    expect(t).toHaveLength(400);
    expect(t[0]).toBe(0);
    expect(t[399]).toBe(2159);
    expect(thin([1, 2], 400)).toEqual([1, 2]);
  });

  it('dias cobertos de fato pela série', () => {
    const pts = series(Array.from({ length: 720 }, () => 9000)).reverse();
    expect(coveredDays(pts)).toBe(30);
    expect(coveredDays(pts.slice(0, 1))).toBe(0);
    expect(coveredDays([])).toBe(0);
  });

  it('texto do veredito cita a janela', () => {
    expect(goldVerdictText('barato', 7)).toContain('7 dias');
    expect(goldVerdictText('sem dado', 30)).toMatch(/Sem dado/);
  });
});
