import { afterEach, describe, expect, it, vi } from 'vitest';
import { basketFor, getDataHealth, HEALTH_BASKET, isRefined, summarizeHealth } from '../worker/api/goldHealth';
import { getDataHealth as fromInsights } from '../worker/api/insights';
import { routeGoldHealth } from '../worker/api/routesF2';
import { chunkPriceUrls } from '../worker/lib/aodp';
import { ALL_CITIES } from '../shared/market';
import type { City, DataHealthCity, PriceRow } from '../shared/types';
import type { Env } from '../worker/env';
import { jsonRes, mockCaches, mockFetch } from './helpers/net';
import { readPublic } from './helpers/public';
import { barPct, cityTone, joinPt, needsScan, sortHealth } from '../src/lib/gold/view';

const env = {} as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const NOW = Date.parse('2026-10-30T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function row(id: string, city: City, sellAgeMin: number | null, buyAgeMin: number | null = null): PriceRow {
  return {
    id, city, quality: 1,
    sellMin: sellAgeMin === null ? null : 100, sellMinAt: sellAgeMin === null ? null : ago(sellAgeMin),
    buyMax: buyAgeMin === null ? null : 90, buyMaxAt: buyAgeMin === null ? null : ago(buyAgeMin),
  };
}

describe('cesta', () => {
  it('cerca de 40 itens, sem repetição, cabendo numa só URL do /prices', () => {
    expect(HEALTH_BASKET.length).toBeGreaterThanOrEqual(38);
    expect(HEALTH_BASKET.length).toBeLessThanOrEqual(45);
    expect(new Set(HEALTH_BASKET).size).toBe(HEALTH_BASKET.length);
    expect(chunkPriceUrls([...HEALTH_BASKET], ALL_CITIES, [1])).toHaveLength(1);
  });

  it('todo id existe no índice de itens', () => {
    const text = readPublic('/data/items-index.json');
    expect(text).not.toBeNull();
    const ids = new Set((JSON.parse(text!) as { items: [string, ...unknown[]][] }).items.map((i) => i[0]));
    const missing = HEALTH_BASKET.filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('Black Market conta só equipamento', () => {
    expect(isRefined('T5_METALBAR')).toBe(true);
    expect(isRefined('T4_BAG')).toBe(false);
    const bm = basketFor('Black Market');
    expect(bm.some(isRefined)).toBe(false);
    expect(bm.length).toBe(HEALTH_BASKET.length - 15);
    expect(basketFor('Lymhurst')).toHaveLength(HEALTH_BASKET.length);
  });
});

describe('summarizeHealth', () => {
  const basket = ['T4_BAG', 'T4_CAPE', 'T4_PLANKS', 'T4_MAIN_SWORD'];

  it('idade mediana, frescos, velhos e sem preço por cidade', () => {
    const rows = [
      row('T4_BAG', 'Lymhurst', 10),
      row('T4_CAPE', 'Lymhurst', 59),
      row('T4_PLANKS', 'Lymhurst', 2000),
      // T4_MAIN_SWORD sem linha em Lymhurst → sem preço
      row('T4_BAG', 'Martlock', null, 5), // só compra: conta como sem preço numa cidade normal
      row('T4_BAG', 'Black Market', 5, 30), // BM usa a data da compra
      row('T4_CAPE', 'Black Market', 5, null), // BM sem compra → sem preço
      row('T4_PLANKS', 'Black Market', null, null), // recurso: fora da conta do BM
    ];
    const [lym, mart, bm] = summarizeHealth(rows, NOW, basket, ['Lymhurst', 'Martlock', 'Black Market']);
    expect(lym).toEqual({ city: 'Lymhurst', medianAgeMin: 59, fresh1h: 2, stale24h: 1, missing: 1 });
    expect(mart).toEqual({ city: 'Martlock', medianAgeMin: null, fresh1h: 0, stale24h: 0, missing: 4 });
    expect(bm).toEqual({ city: 'Black Market', medianAgeMin: 30, fresh1h: 1, stale24h: 0, missing: 2 });
  });

  it('casa id sem diferenciar maiúsculas e ignora qualidade diferente de 1', () => {
    const rows = [{ ...row('t4_bag', 'Thetford', 5) }, { ...row('T4_CAPE', 'Thetford', 5), quality: 2 as const }];
    const [t] = summarizeHealth(rows, NOW, ['T4_BAG', 'T4_CAPE'], ['Thetford']);
    expect(t.fresh1h).toBe(1);
    expect(t.missing).toBe(1);
  });

  it('padrão: 8 cidades', () => {
    expect(summarizeHealth([], NOW).map((c) => c.city)).toEqual(ALL_CITIES);
  });
});

describe('getDataHealth e rota', () => {
  it('um só pedido ao AODP para a cesta toda, 8 cidades, qualidade 1; cache das linhas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockCaches();
    const raw = [
      { item_id: 'T4_BAG', city: 'Lymhurst', quality: 1, sell_price_min: 4000, sell_price_min_date: '2026-10-30T11:30:00', buy_price_max: 0, buy_price_max_date: '0001-01-01T00:00:00' },
      { item_id: 'T4_BAG', city: 'Black Market', quality: 1, sell_price_min: 5000, sell_price_min_date: '2026-10-30T11:00:00', buy_price_max: 3900, buy_price_max_date: '2026-10-29T10:00:00' },
    ];
    const calls = mockFetch(() => jsonRes(raw));
    const r = await getDataHealth(env, ctx);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/prices/');
    expect(calls[0].url).toContain('qualities=1');
    expect(calls[0].headers['accept-encoding']).toBe('gzip');
    expect(r.basket).toBe(HEALTH_BASKET.length);
    expect(r.fetchedAt).toBe(new Date(NOW).toISOString());
    expect(r.cities).toHaveLength(8);
    const lym = r.cities.find((c) => c.city === 'Lymhurst')!;
    expect(lym).toMatchObject({ medianAgeMin: 30, fresh1h: 1, missing: HEALTH_BASKET.length - 1 });
    const bm = r.cities.find((c) => c.city === 'Black Market')!;
    expect(bm).toMatchObject({ medianAgeMin: 26 * 60, stale24h: 1 });
    // idades andam com o relógio, mesmo vindo do cache (TTL de 30 min)
    vi.setSystemTime(NOW + 20 * 60000);
    const r2 = await getDataHealth(env, ctx);
    expect(calls).toHaveLength(1);
    expect(r2.cities.find((c) => c.city === 'Lymhurst')!.medianAgeMin).toBe(50);
    expect(r2.fetchedAt).toBe(new Date(NOW).toISOString());
    // passou do TTL: busca de novo
    vi.setSystemTime(NOW + 31 * 60000);
    await getDataHealth(env, ctx);
    expect(calls).toHaveLength(2);
    expect(fromInsights).toBe(getDataHealth);
  });

  it('rota /api/data-health: 200, 405 e 502', async () => {
    mockFetch(() => jsonRes([]));
    const u = 'https://x/api/data-health';
    const ok = await routeGoldHealth(new Request(u), new URL(u), env, ctx);
    expect(ok!.status).toBe(200);
    expect(((await ok!.json()) as { cities: unknown[] }).cities).toHaveLength(8);
    expect((await routeGoldHealth(new Request(u, { method: 'DELETE' }), new URL(u), env, ctx))!.status).toBe(405);
    mockFetch(() => new Response('x', { status: 500 }));
    expect((await routeGoldHealth(new Request(u + '/'), new URL(u + '/'), env, ctx))!.status).toBe(502);
  });
});

describe('tela da saúde', () => {
  const c = (city: City, medianAgeMin: number | null, missing: number, stale24h = 0): DataHealthCity => ({ city, medianAgeMin, fresh1h: 0, stale24h, missing });

  it('nota por cidade', () => {
    expect(cityTone(c('Lymhurst', 30, 5), 40)).toBe('good');
    expect(cityTone(c('Lymhurst', 30, 15), 40)).toBe('warn');
    expect(cityTone(c('Lymhurst', 120, 0), 40)).toBe('warn');
    expect(cityTone(c('Lymhurst', 400, 0), 40)).toBe('bad');
    expect(cityTone(c('Lymhurst', 30, 25), 40)).toBe('bad');
    expect(cityTone(c('Lymhurst', null, 40), 40)).toBe('bad');
  });

  it('onde falta scan: só as que não estão boas, pior primeiro, até 3', () => {
    const list = [c('Lymhurst', 20, 0), c('Caerleon', 500, 30, 5), c('Thetford', 200, 2), c('Brecilien', null, 40), c('Martlock', 120, 10, 1)];
    expect(needsScan(list, 40)).toEqual(['Brecilien', 'Caerleon', 'Martlock']);
    expect(needsScan([c('Lymhurst', 20, 0)], 40)).toEqual([]);
  });

  it('ordem, barras e lista', () => {
    expect(sortHealth([c('Black Market', 1, 0), c('Lymhurst', 1, 0)]).map((x) => x.city)).toEqual(['Lymhurst', 'Black Market']);
    expect(barPct(10, 40)).toBe(25);
    expect(barPct(0, 40)).toBe(0);
    expect(barPct(5, 0)).toBe(0);
    expect(barPct(50, 40)).toBe(100);
    expect(joinPt(['A'])).toBe('A');
    expect(joinPt(['A', 'B', 'C'])).toBe('A, B e C');
  });
});
