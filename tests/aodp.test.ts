import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AodpError, MAX_URL, aodpBook, aodpGold, aodpHistory, aodpPrices, chunkPriceUrls, normalizeBook, normalizeFestivities,
  normalizeGold, normalizeHistory, normalizePrices,
} from '../worker/lib/aodp';
import { cachedJson } from '../worker/lib/cache';
import { ALL_CITIES, AODP_BASE } from '../shared/market';
import { aodpFixtureRoute, fixture, jsonRes, mockCaches, mockFetch } from './helpers/net';

const NOW = Date.parse('2026-10-30T02:30:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('normalização', () => {
  it('preços: datas em UTC com Z, cidade e qualidade tipadas', () => {
    const rows = normalizePrices(fixture('prices.json'));
    expect(rows).toHaveLength(16);
    const bm = rows.find((r) => r.id === 'T4_BAG' && r.city === 'Black Market')!;
    expect(bm).toEqual({
      id: 'T4_BAG', city: 'Black Market', quality: 1,
      sellMin: 5449, sellMinAt: '2026-10-29T04:10:00Z', buyMax: 3950, buyMaxAt: '2026-10-29T23:30:00Z',
    });
  });

  it('preço 0 vira null e leva a data junto', () => {
    const [r] = normalizePrices([{ item_id: 'X', city: 'Caerleon', quality: 1, sell_price_min: 0, sell_price_min_date: '2026-10-29T04:10:00', buy_price_max: 10, buy_price_max_date: '0001-01-01T00:00:00' }]);
    expect(r.sellMin).toBeNull();
    expect(r.sellMinAt).toBeNull();
    expect(r.buyMax).toBe(10);
    expect(r.buyMaxAt).toBeNull();
  });

  it('cidade desconhecida (portal) é descartada', () => {
    expect(normalizePrices([{ item_id: 'X', city: 'Bridgewatch Portal', quality: 1, sell_price_min: 5 }])).toEqual([]);
  });

  it('histórico agrupa por cidade em ordem de data', () => {
    const h = normalizeHistory(fixture('history.json'));
    expect(h).toHaveLength(8);
    const lym = h.find((x) => x.city === 'Lymhurst')!;
    expect(lym.points.at(-1)).toEqual({ date: '2026-10-29', avg: 3171, count: 856 });
    for (const x of h) expect([...x.points].sort((a, b) => a.date.localeCompare(b.date))).toEqual(x.points);
  });

  it('livro: venda crescente, compra decrescente, mesmo preço somado', () => {
    const b = normalizeBook(fixture('orderbook.json'));
    for (const c of b) {
      for (let i = 1; i < c.sell.length; i++) expect(c.sell[i].price).toBeGreaterThan(c.sell[i - 1].price);
      for (let i = 1; i < c.buy.length; i++) expect(c.buy[i].price).toBeLessThan(c.buy[i - 1].price);
    }
    const merged = normalizeBook([{ city: 'Caerleon', sell: [{ price: 10, amount: 1, updated_at: '2026-10-29T01:00:00' }, { price: 10, amount: 2, updated_at: '2026-10-29T02:00:00' }, { price: 0, amount: 5 }], buy: [] }]);
    expect(merged[0].sell).toEqual([{ price: 10, amount: 3, updatedAt: '2026-10-29T02:00:00Z' }]);
  });

  it('ouro: mais recente primeiro (fixture veio com 719 pontos)', () => {
    const g = normalizeGold(fixture('gold.json'));
    expect(g.length).toBeGreaterThan(700);
    expect(g[0]).toEqual({ price: 8930, at: '2026-10-30T01:00:00Z' });
    expect(g[0].at > g[1].at).toBe(true);
  });

  it('festividades: ticks .NET viram ISO (Halloween começa em 23/10 10:00 UTC)', () => {
    const f = normalizeFestivities(fixture('festivities.json'));
    expect(f).toHaveLength(4);
    expect(f[0]).toMatchObject({ kind: 0, name: 'HALLOWEEN2026', start: '2026-10-23T10:00:00.000Z' });
  });

  it('formato inesperado vira AodpError', () => {
    expect(() => normalizePrices({ error: 'x' })).toThrow(AodpError);
    expect(() => normalizeFestivities([])).toThrow(AodpError);
  });
});

describe('lotes de URL', () => {
  it('300 ids viram lotes com URL completa <= 4000 caracteres', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `T${(i % 8) + 1}_2H_INFERNOSTAFF_MORGANA@${i % 4}_${i}`);
    const paths = chunkPriceUrls(ids, ALL_CITIES, [1, 2, 3]);
    expect(paths.length).toBeGreaterThan(1);
    for (const p of paths) expect((AODP_BASE + p).length).toBeLessThanOrEqual(MAX_URL);
    const back = paths.flatMap((p) => p.slice('/prices/'.length, p.indexOf('?')).split(','));
    expect(back).toEqual(ids); // nenhum id perdido nem duplicado, @ preservado
  });

  it('poucos ids cabem numa URL só', () => {
    expect(chunkPriceUrls(['T4_BAG', 'T5_BAG'], ['Caerleon'], [1])).toEqual(['/prices/T4_BAG,T5_BAG?locations=Caerleon&qualities=1']);
  });
});

describe('chamadas', () => {
  it('manda gzip e User-Agent, e usa o cache na segunda vez', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const rows = await aodpPrices(['T4_BAG', 'T5_BAG'], ALL_CITIES, [1]);
    expect(rows).toHaveLength(16);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers['accept-encoding']).toBe('gzip');
    expect(calls[0].headers['user-agent']).toBe('guarita (github.com/dosxnjos/guarita)');
    expect(calls[0].url).toContain('locations=Bridgewatch,Fort%20Sterling');
    await aodpPrices(['T4_BAG', 'T5_BAG'], ALL_CITIES, [1]);
    expect(calls).toHaveLength(1);
  });

  it('cache vencido é rebuscado', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    await aodpGold(720);
    vi.setSystemTime(NOW + 601_000);
    await aodpGold(720);
    expect(calls).toHaveLength(2);
  });

  it('ouro com sinceDay manda date= (sem ele o AODP corta em 720 pontos); dia mal formado é ignorado', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    await aodpGold(2184, undefined, '2026-07-31');
    expect(calls[0].url).toContain('/gold.json?count=2184&date=2026-07-31');
    await aodpGold(24, undefined, '2026-07-31T10:00:00Z');
    expect(calls[1].url).toMatch(/\/gold\.json\?count=24$/);
  });

  it('429 sem cache vira erro claro com o RateLimit-Reset', async () => {
    mockCaches();
    mockFetch(() => jsonRes({}, 429, { 'RateLimit-Reset': '37' }));
    const err = await aodpPrices(['T4_BAG'], ALL_CITIES, [1]).catch((e) => e);
    expect(err).toBeInstanceOf(AodpError);
    expect(err.status).toBe(429);
    expect(err.retryAfterS).toBe(37);
    expect(err.message).toBe('O AODP limitou as requisições; tente de novo em 37 s.');
  });

  it('429 com cache velho devolve o último valor bom', async () => {
    mockCaches();
    mockFetch(aodpFixtureRoute);
    const first = await aodpPrices(['T4_BAG', 'T5_BAG'], ALL_CITIES, [1]);
    vi.setSystemTime(NOW + 3600_000);
    const calls = mockFetch(() => jsonRes({}, 429, { 'RateLimit-Reset': '20' }));
    const again = await aodpPrices(['T4_BAG', 'T5_BAG'], ALL_CITIES, [1]);
    expect(calls).toHaveLength(1);
    expect(again).toEqual(first);
  });

  it('sem Cache API (ambiente de teste) só chama a fonte', async () => {
    vi.stubGlobal('caches', undefined);
    let n = 0;
    expect(await cachedJson('k', 60, undefined, async () => ++n)).toBe(1);
    expect(await cachedJson('k', 60, undefined, async () => ++n)).toBe(2);
  });

  it('histórico corta pelos últimos N dias e pede todas as cidades num pedido', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const h = await aodpHistory('T4_BAG', ALL_CITIES, 1, 7);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('time-scale=24');
    for (const c of h) for (const p of c.points) expect(p.date >= '2026-10-23').toBe(true);
    expect(h.find((c) => c.city === 'Thetford')).toBeUndefined(); // último dia de Thetford é 20/10
  });

  it('livro de todas as cidades num pedido', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const b = await aodpBook('T4_BAG', ALL_CITIES, 1);
    expect(calls).toHaveLength(1);
    expect(b.map((x) => x.city).sort()).toEqual([...ALL_CITIES].sort());
  });

  it('erro 5xx e timeout viram AodpError', async () => {
    mockCaches();
    mockFetch(() => new Response('bad', { status: 503 }));
    await expect(aodpGold(10)).rejects.toMatchObject({ status: 503 });
    mockFetch(() => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); });
    await expect(aodpGold(11)).rejects.toMatchObject({ message: 'O AODP demorou demais para responder.' });
  });
});
