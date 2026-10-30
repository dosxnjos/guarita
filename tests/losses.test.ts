// Módulo (a) da Fase 2: perdas PvP. Lógica pura + getLosses com KillLog falso (binding CORE), fatias de nome
// reais de public/data/names e o AODP falso (fixture real de T4_BAG).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceRow } from '../shared/types';
import type { Env } from '../worker/env';
import {
  LABEL_MAX,
  buildLossItems,
  cheapestById,
  clampParam,
  getLosses,
  handleLossesGuild,
  labelFromShardText,
  labelsFor,
} from '../worker/api/insightsA';
import { coverageText, lossTotals, periodLabel, sortLosses } from '../src/lib/insights/format';
import { aodpFixtureRoute, mockFetch } from './helpers/net';
import { readPublic } from './helpers/public';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function row(p: Partial<PriceRow>): PriceRow {
  return { id: 'T4_BAG', city: 'Martlock', quality: 1, sellMin: null, sellMinAt: null, buyMax: null, buyMaxAt: null, ...p };
}

/** ASSETS falso servindo public/ do disco; conta as idas. */
function assets() {
  const seen: string[] = [];
  const fetcher = {
    async fetch(req: Request) {
      const path = new URL(req.url).pathname;
      seen.push(path);
      const text = readPublic(path);
      return text === null ? new Response('não achado', { status: 404 }) : new Response(text, { status: 200 });
    },
  };
  return { fetcher, seen };
}

function env(core: (path: string) => Response | Promise<Response>): Env & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ASSETS: assets().fetcher,
    CORE: {
      async fetch(req: Request) {
        const u = new URL(req.url);
        calls.push(u.pathname + u.search);
        return core(u.pathname + u.search);
      },
    },
  } as unknown as Env & { calls: string[] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('clampParam', () => {
  it('prende na faixa e usa o padrão para vazio/inválido', () => {
    expect(clampParam('7', 1, 1, 7)).toBe(7);
    expect(clampParam('30', 1, 1, 7)).toBe(7);
    expect(clampParam('0', 1, 1, 7)).toBe(1);
    expect(clampParam('abc', 1, 1, 7)).toBe(1);
    expect(clampParam(null, 50, 1, 50)).toBe(50);
    expect(clampParam('2.9', 1, 1, 7)).toBe(2);
  });
});

describe('cheapestById', () => {
  it('menor venda entre as cidades, ignora null, 0 e Black Market; idade em minutos', () => {
    const m = cheapestById(
      [
        row({ city: 'Martlock', sellMin: 5000, sellMinAt: '2026-10-30T11:00:00Z' }),
        row({ city: 'Caerleon', sellMin: 4200, sellMinAt: '2026-10-30T11:30:00Z' }),
        row({ city: 'Black Market', sellMin: 100, sellMinAt: '2026-10-30T11:59:00Z' }),
        row({ city: 'Lymhurst', sellMin: 0 }),
        row({ id: 'T5_BAG', city: 'Lymhurst', sellMin: null }),
      ],
      NOW,
    );
    expect(m.get('T4_BAG')).toEqual({ price: 4200, ageMin: 30 });
    expect(m.has('T5_BAG')).toBe(false);
  });
});

describe('labelFromShardText', () => {
  it('recorta o rótulo pelo id exato no texto da fatia real', () => {
    const t4 = readPublic('/data/names/t4.json')!;
    expect(labelFromShardText(t4, 'T4_BAG')).toBe('Bolsa do Adepto (T4)');
    expect(labelFromShardText(t4, 'T4_BAG@1')).toBe('Bolsa do Adepto (T4.1)');
    expect(labelFromShardText(t4, 'T4_NAO_EXISTE')).toBeNull();
  });
  it('desfaz escape de JSON e não casa prefixo', () => {
    const txt = '{"T4_X@1":"Errado","T4_X":"Capa \\"Rara\\" (T4)"}';
    expect(labelFromShardText(txt, 'T4_X')).toBe('Capa "Rara" (T4)');
    expect(labelFromShardText('{"T4_X":12}', 'T4_X')).toBeNull();
  });
});

describe('labelsFor', () => {
  it('uma ida ao ASSETS por tier e teto de ids', async () => {
    const a = assets();
    const e = { ASSETS: a.fetcher } as unknown as Env;
    const ids = ['T4_BAG', 'T4_BAG@1', 'T8_MAIN_SWORD', 'T6_2H_CLAYMORE@2'];
    const m = await labelsFor(e, ids);
    expect(m.get('T4_BAG')).toBe('Bolsa do Adepto (T4)');
    expect(m.size).toBe(4);
    const many = Array.from({ length: LABEL_MAX + 20 }, (_, i) => `T4_FAKE_${i}`);
    const m2 = await labelsFor(e, many);
    expect(m2.size).toBe(0);
  });
});

describe('buildLossItems', () => {
  it('value = count × price; sem preço fica null; sem nome usa o id', () => {
    const items = buildLossItems(
      [{ type: 't4_bag', count: 10 }, { type: 'T5_CAPE', count: 3 }],
      new Map([['T4_BAG', { price: 4200, ageMin: 5 }]]),
      new Map([['T4_BAG', 'Bolsa do Adepto (T4)']]),
    );
    expect(items[0]).toEqual({ id: 'T4_BAG', name: 'Bolsa do Adepto (T4)', count: 10, price: 4200, value: 42000, ageMin: 5 });
    expect(items[1]).toEqual({ id: 'T5_CAPE', name: 'T5_CAPE', count: 3, price: null, value: null, ageMin: null });
  });
});

describe('getLosses', () => {
  const coreOk = (path: string) => {
    if (path.startsWith('/internal/killlog/losses')) {
      return Response.json({
        days: 7,
        deaths: 1234,
        since: '2026-10-30',
        items: [
          { type: 'T4_BAG', count: 300, share: 0.24 },
          { type: 'T8_MAIN_SWORD', count: 12, share: 0.01 },
          { type: '#mortes', count: 1234 }, // lixo que não pode vazar
          { type: 'UNIQUE_HIDEOUT', count: 0 }, // contagem zero sai
        ],
      });
    }
    return new Response('?', { status: 404 });
  };

  it('junta KillLog, preço do AODP (um lote) e nome', async () => {
    const calls = mockFetch(aodpFixtureRoute);
    const e = env(coreOk);
    const r = await getLosses(e, ctx, 7, 50);
    expect(e.calls).toEqual(['/internal/killlog/losses?days=7&limit=50']);
    expect(calls.filter((c) => c.url.includes('/prices/'))).toHaveLength(1);
    const priceUrl = calls.find((c) => c.url.includes('/prices/'))!.url;
    expect(priceUrl).toContain('Caerleon');
    expect(priceUrl).not.toContain('Black%20Market');
    expect(priceUrl).toContain('qualities=1');
    expect(r.days).toBe(7);
    expect(r.since).toBe('2026-10-30');
    expect(r.sampleKills).toBe(1234);
    expect(r.items).toHaveLength(2);
    const bag = r.items[0];
    expect(bag.name).toBe('Bolsa do Adepto (T4)');
    expect(bag.price).toBeGreaterThan(0);
    expect(bag.value).toBe(Math.round(bag.price! * 300));
    expect(r.items[1].price).toBeNull(); // fixture só tem T4_BAG
  });

  it('AODP fora: devolve a lista sem preço em vez de falhar', async () => {
    mockFetch(() => new Response('caiu', { status: 503 }));
    const r = await getLosses(env(coreOk), ctx, 1);
    expect(r.items.map((i) => i.price)).toEqual([null, null]);
    expect(r.items[0].count).toBe(300);
  });

  it('days e limit vão presos para o KillLog', async () => {
    mockFetch(aodpFixtureRoute);
    const e = env(coreOk);
    await getLosses(e, ctx, 99, 999);
    expect(e.calls[0]).toBe('/internal/killlog/losses?days=7&limit=50');
  });
});

describe('rota /api/losses', () => {
  it('200 com cache curto; core fora vira 502 com mensagem', async () => {
    mockFetch(aodpFixtureRoute);
    const ok = env(() => Response.json({ deaths: 0, since: null, items: [] }));
    const u = new URL('https://x/api/losses?days=1');
    const r = await handleLossesGuild(new Request(u), u, ok, ctx);
    expect(r!.status).toBe(200);
    expect(r!.headers.get('Cache-Control')).toContain('max-age=300');
    const body = (await r!.json()) as { items: unknown[]; days: number };
    expect(body.items).toEqual([]);
    expect(body.days).toBe(1);

    const down = env(() => new Response('erro', { status: 500 }));
    const u2 = new URL('https://x/api/losses?days=7&limit=5');
    const r2 = await handleLossesGuild(new Request(u2), u2, down, ctx);
    expect(r2!.status).toBe(502);
    expect(((await r2!.json()) as { error: string }).error).toMatch(/histórico do killboard/);
  });

  it('rota de outro módulo devolve null', async () => {
    const u = new URL('https://x/api/gold');
    expect(await handleLossesGuild(new Request(u), u, env(() => new Response()), ctx)).toBeNull();
  });
});

describe('telas: ordenação, totais e cobertura', () => {
  const items = [
    { id: 'A', name: 'A', count: 5, price: 100, value: 500, ageMin: 1 },
    { id: 'B', name: 'B', count: 9, price: null, value: null, ageMin: null },
    { id: 'C', name: 'C', count: 2, price: 1000, value: 2000, ageMin: 1 },
  ];
  it('ordena por contagem ou por valor (sem preço no fim)', () => {
    expect(sortLosses(items, 'count').map((i) => i.id)).toEqual(['B', 'A', 'C']);
    expect(sortLosses(items, 'value').map((i) => i.id)).toEqual(['C', 'A', 'B']);
  });
  it('soma o valor perdido só dos itens com preço', () => {
    expect(lossTotals(items)).toEqual({ value: 2500, priced: 2, unpriced: 1 });
  });
  it('texto de cobertura em pt-BR', () => {
    expect(coverageText('2026-10-30', 1234)).toBe('Coletando desde 30/10/2026; amostra de 1.234 mortes.');
    expect(coverageText(null, 1)).toBe('Coleta recém-iniciada; amostra de 1 morte.');
    expect(coverageText('2026-10-30')).toBe('Coletando desde 30/10/2026.');
    expect(periodLabel(1)).toBe('hoje');
    expect(periodLabel(7)).toBe('últimos 7 dias');
  });
});
