import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildItem, fillBook, getBookFill, getItem, parseCity, parseQuality, priceRange, routeMarket, REAL_CITIES } from '../worker/api/market';
import { normalizeBook, normalizeHistory, normalizePrices } from '../worker/lib/aodp';
import { flipProfit } from '../shared/market';
import type { Env } from '../worker/env';
import { aodpFixtureRoute, fixture, jsonRes, mockCaches, mockFetch } from './helpers/net';

const NOW = Date.parse('2026-10-30T02:30:00Z');
const rows = normalizePrices(fixture('prices.json'));
const history = normalizeHistory(fixture('history.json'));
const book = normalizeBook(fixture('orderbook.json'));
const env = {} as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('buildItem com dado real (T4_BAG)', () => {
  const item = buildItem('T4_BAG', 1, rows, history, book, NOW);

  it('traz as 8 cidades com idade, selo e veredito', () => {
    expect(item.cities).toHaveLength(8);
    const bw = item.cities.find((c) => c.city === 'Bridgewatch')!;
    expect(bw.sellMin).toBe(3774);
    expect(bw.ageMin).toBe(30);
    expect(bw.confidence.score).toBeGreaterThan(0);
    expect(['barato', 'normal', 'caro']).toContain(bw.verdict);
  });

  it('faixa exclui o Black Market', () => {
    const r = priceRange(history, REAL_CITIES, NOW);
    expect(item.p25).toBe(r.p25);
    expect(item.p75).toBe(r.p75);
    expect(item.p25!).toBeLessThanOrEqual(item.p75!);
    expect(item.median7d).not.toBeNull();
  });

  it('flips só com lucro, ordenados, contra a buy order do BM do endpoint de preços', () => {
    expect(item.flips.length).toBeGreaterThan(0);
    for (const f of item.flips) {
      expect(f.sellAt).toBe(3950);
      expect(f.profitPremium).toBe(flipProfit(f.buyAt, 3950, true));
      expect(f.profitPremium).toBeGreaterThan(0);
      expect(f.roi).toBeCloseTo(f.profitPremium / f.buyAt, 3);
    }
    const sorted = [...item.flips].sort((a, b) => b.profitPremium - a.profitPremium);
    expect(item.flips).toEqual(sorted);
    expect(item.flips[0].from).toBe('Bridgewatch'); // 3774 é a venda mais barata
    expect(item.flips.find((f) => f.from === 'Caerleon')).toBeUndefined(); // 7680 dá prejuízo
    // idade do flip = a mais velha entre a venda da cidade e a compra do BM (23:30 → 180 min)
    expect(item.flips[0].ageMin).toBe(180);
  });

  it('livro cortado e ordenado', () => {
    for (const b of item.book) expect(b.sell.length).toBeLessThanOrEqual(30);
  });

  it('item sem preço nenhum: tudo sem dado, sem flips', () => {
    const empty = buildItem('T4_BAG', 1, [], [], [], NOW);
    expect(empty.cities.every((c) => c.verdict === 'sem dado' && c.confidence.label === 'sem dado')).toBe(true);
    expect(empty.flips).toEqual([]);
    expect([empty.median7d, empty.p25, empty.p75]).toEqual([null, null, null]);
  });
});

describe('fillBook', () => {
  const sell = [{ price: 110, amount: 2 }, { price: 100, amount: 3 }, { price: 120, amount: 10 }];
  it('comprar 4: consome a venda mais barata primeiro', () => {
    expect(fillBook(sell, 'sell', 4)).toEqual({ avgPrice: 103, filled: 4, levels: [{ price: 100, amount: 3 }, { price: 110, amount: 1 }] });
  });
  it('vender 4: consome a compra mais cara primeiro', () => {
    expect(fillBook(sell, 'buy', 4).levels[0]).toEqual({ price: 120, amount: 4 });
  });
  it('livro curto: filled menor que n', () => {
    const r = fillBook(sell, 'sell', 100);
    expect(r.filled).toBe(15);
  });
  it('livro vazio', () => {
    expect(fillBook([], 'sell', 5)).toEqual({ avgPrice: null, filled: 0, levels: [] });
  });
});

describe('parâmetros', () => {
  it('cidade em vários formatos', () => {
    expect(parseCity('fort-sterling')).toBe('Fort Sterling');
    expect(parseCity('Black Market')).toBe('Black Market');
    expect(parseCity('blackmarket')).toBe('Black Market');
    expect(parseCity('Londres')).toBeNull();
  });
  it('qualidade', () => {
    expect(parseQuality(null)).toBe(1);
    expect(parseQuality('5')).toBe(5);
    expect(parseQuality('6')).toBeNull();
    expect(parseQuality('1.5')).toBeNull();
  });
});

describe('rotas e funções com AODP falso', () => {
  it('getItem usa 3 subrequests', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const item = await getItem(env, ctx, 'T4_BAG', 1);
    expect(calls).toHaveLength(3);
    expect(item.history.length).toBeGreaterThan(0);
  });

  it('id em minúsculas é normalizado (o AODP devolve item_id em maiúsculas)', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const item = await getItem(env, ctx, 't4_bag', 1);
    expect(item.id).toBe('T4_BAG');
    expect(calls[0].url).toContain('/prices/T4_BAG?');
    expect(item.cities.find((c) => c.city === 'Bridgewatch')!.sellMin).toBe(3774);
  });

  it('AODP fora com reserva no cache: fetchedAt é a hora da busca original, não agora', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockCaches();
    mockFetch(aodpFixtureRoute);
    const fresh = await getItem(env, ctx, 'T4_BAG', 1);
    expect(fresh.fetchedAt).toBe(new Date(NOW).toISOString());
    vi.setSystemTime(NOW + 3 * 3600_000);
    mockFetch(() => new Response('x', { status: 429 }));
    const old = await getItem(env, ctx, 'T4_BAG', 1);
    expect(old.cities.find((c) => c.city === 'Lymhurst')!.sellMin).toBe(3947);
    expect(old.fetchedAt).toBe(new Date(NOW).toISOString());
    vi.useRealTimers();
  });

  it('getItem com histórico e livro fora do ar ainda responde', async () => {
    mockCaches();
    mockFetch((url) => (url.includes('/prices/') ? aodpFixtureRoute(url) : new Response('x', { status: 502 })));
    const item = await getItem(env, ctx, 'T4_BAG', 1);
    expect(item.history).toEqual([]);
    expect(item.book).toEqual([]);
    expect(item.cities.find((c) => c.city === 'Lymhurst')!.sellMin).toBe(3947);
  });

  it('getBookFill reaproveita o livro de todas as cidades', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const r = await getBookFill(env, ctx, 'T4_BAG', 'Caerleon', 'sell', 5, 1);
    expect(calls[0].url).toContain('Black%20Market');
    expect(r.filled).toBe(5);
    expect(r.avgPrice).toBeGreaterThan(0);
  });

  const call = (path: string, method = 'GET') => {
    const req = new Request('https://guarita.pages.dev' + path, { method });
    return routeMarket(req, new URL(req.url), env, ctx);
  };

  it('rota alheia devolve null', async () => {
    expect(await call('/api/clock')).toBeNull();
  });

  it('parâmetros inválidos → 400 em PT-BR, sem cache', async () => {
    mockFetch(aodpFixtureRoute);
    for (const p of ['/api/prices', '/api/prices?ids=T4_BAG&q=9', '/api/prices?ids=T4_BAG&cities=Londres', '/api/item/T4%3BBAG', '/api/item/T4_BAG?q=0', '/api/book/T4_BAG', '/api/book/T4_BAG?city=Caerleon&n=0', '/api/book/T4_BAG?city=Caerleon&side=x']) {
      const res = (await call(p))!;
      expect(res.status, p).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(typeof ((await res.json()) as { error: string }).error).toBe('string');
    }
  });

  it('método errado → 405', async () => {
    expect((await call('/api/item/T4_BAG', 'POST'))!.status).toBe(405);
  });

  it('sucesso com Cache-Control público de 60 s', async () => {
    mockCaches();
    mockFetch(aodpFixtureRoute);
    const res = (await call('/api/prices?ids=T4_BAG,T5_BAG&cities=caerleon,black-market&q=1'))!;
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    const body = (await res.json()) as { rows: unknown[] };
    expect(body.rows.length).toBeGreaterThan(0);
    expect((await call('/api/item/T4_BAG@1'))!.status).toBe(200);
  });

  it('AODP fora do ar → 502 com mensagem clara', async () => {
    mockCaches();
    mockFetch(() => jsonRes({}, 429, { 'RateLimit-Reset': '12' }));
    const res = (await call('/api/item/T4_BAG'))!;
    expect(res.status).toBe(502);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect(await res.json()).toEqual({ error: 'O AODP limitou as requisições; tente de novo em 12 s.' });
  });
});
