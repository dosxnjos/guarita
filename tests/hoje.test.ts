// Módulo (c) da Fase 3: "O que fazer hoje". Lógica pura (planos, conta, selo, validação) e a rota com fetch falso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { City, PriceRow } from '../shared/types';
import { chunkPriceUrls } from '../worker/lib/aodp';
import { ALL_CITIES } from '../shared/market';
import {
  CAP_SEM_VOLUME, avgDaily, buildHoje, combinedConfidence, dailyRefining, parseHojeParams, planFlip, planRefino, planTransporte,
  refinoCalc, routeHojeImpl, rrr, selectHistoryIds, type HojeParams, type HojeSnapshot,
} from '../worker/api/hoje';
import { FLIP_ITEMS, NOMES, RECEITAS, basketIds, routeRisk, travelMin } from '../shared/hoje';
import { contaDe, parseHojeQuery, parsePrata, hojeQuery, trilhaLabel, confidenceOf, MINUTOS_OPCOES, anuncioHoje } from '../src/lib/hoje/view';
import type { HojeResponse as HojeResponseX } from '../shared/types';
import { COMMANDS, HOJE_MINUTOS } from '../worker/discord/commands';
import { MCP_TOOLS } from '../worker/mcp/catalog';
import { hojeParams, UserError } from '../worker/discord/interactions';
import { renderHoje } from '../worker/discord/render';
import { callTool, summarizeHoje } from '../worker/mcp/tools';
import { jsonRes, mockCaches, mockFetch } from './helpers/net';

const NOW = Date.parse('2026-10-30T15:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

function row(id: string, city: City, sellMin: number | null, buyMax: number | null = null, ageMin = 5): PriceRow {
  return {
    id, city, quality: 1,
    sellMin, sellMinAt: sellMin == null ? null : ago(ageMin),
    buyMax, buyMaxAt: buyMax == null ? null : ago(ageMin),
  };
}

function snap(rows: PriceRow[], extra: Partial<HojeSnapshot> = {}): HojeSnapshot {
  return { at: ago(3), stale: false, rows, volume: {}, daily: [], festOk: true, ...extra };
}

const P: HojeParams = { prata: 1_000_000, minutos: 60, premium: true };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cesta', () => {
  it('tem 60 itens de flip e receitas T4–T6 sem bloco de pedra encantado', () => {
    expect(FLIP_ITEMS).toHaveLength(60);
    expect(RECEITAS).toHaveLength(4 * 6 + 3);
    expect(RECEITAS.some((r) => r.ref.id.startsWith('T4_STONEBLOCK_LEVEL'))).toBe(false);
    for (const id of basketIds()) expect(NOMES[id], id).toBeTruthy();
  });
  it('receitas seguem o dump: T5.1 usa 3 brutos .1 e o refinado T4.1; T4.1 usa o T3 comum', () => {
    const t51 = RECEITAS.find((r) => r.ref.id === 'T5_METALBAR_LEVEL1@1')!;
    expect(t51.raw.id).toBe('T5_ORE_LEVEL1@1');
    expect(t51.lower.id).toBe('T4_METALBAR_LEVEL1@1');
    expect(t51.rawPorCraft).toBe(3);
    expect(t51.cidade).toBe('Thetford');
    const t41 = RECEITAS.find((r) => r.ref.id === 'T4_PLANKS_LEVEL1@1')!;
    expect(t41.lower.id).toBe('T3_PLANKS');
    expect(t41.ref.nome).toBe('Tábuas de Pinho Incomuns (T4.1)');
    expect(NOMES['T4_BAG@1']).toBe('Bolsa do Adepto (T4.1)');
  });
  it('a cesta inteira cabe em no máximo 2 URLs de /prices (orçamento de subrequests)', () => {
    expect(chunkPriceUrls(basketIds(), ALL_CITIES, [1]).length).toBeLessThanOrEqual(2);
  });
  it('deslocamento e risco de rota', () => {
    expect(travelMin('Caerleon', 'Black Market')).toBe(0);
    expect(travelMin('Martlock', 'Black Market')).toBe(10);
    expect(travelMin('Martlock', 'Lymhurst')).toBe(20);
    expect(routeRisk('Martlock', 'Black Market')).toBe('vermelha');
    expect(routeRisk('Martlock', 'Lymhurst')).toBe('segura');
    expect(routeRisk('Brecilien', 'Lymhurst')).toBe('brumas');
  });
});

describe('taxa de retorno e bônus do dia', () => {
  it('RRR = 1 − 1/(1 + bônus) bate com os valores conhecidos', () => {
    expect(rrr(0.18)).toBeCloseTo(0.1525, 3);
    expect(rrr(0.58)).toBeCloseTo(0.367, 3);
    expect(rrr(1.17)).toBeCloseTo(0.539, 3);
  });
  it('só bônus de refino ativos agora; o RARE vence o COMMON', () => {
    const d = dailyRefining(
      [
        { name: 'COMMON_ORE', start: ago(60), end: ago(-600) },
        { name: 'RARE_ORE', start: ago(60), end: ago(-600) },
        { name: 'COMMON_WOOD', start: ago(-60), end: ago(-600) }, // ainda não começou
        { name: 'COMMON_CROSSBOW', start: ago(60), end: ago(-600) }, // produção de item, não refino
        { name: 'COMMON_HIDE', start: ago(600), end: ago(1) }, // já acabou
      ],
      NOW,
    );
    expect(d).toEqual({ ore: { valor: 0.2, fim: ago(-600) } });
  });
});

describe('flip para o Black Market', () => {
  const rows = [
    row('T4_BAG', 'Martlock', 10_000),
    row('T4_BAG', 'Caerleon', 11_000),
    row('T4_BAG', 'Black Market', null, 14_000),
  ];
  it('conta aberta: compra, venda, imposto e lucro fecham', () => {
    const [op] = planFlip(snap(rows), P, NOW);
    expect(op.trilha).toBe('flip');
    expect(op.conta!.venda - op.conta!.taxas - op.conta!.compra).toBe(op.lucro);
    expect(op.itens[0].cidadeVenda).toBe('Black Market');
    expect(op.itens[0].idadeCompraMin).toBe(5);
    expect(op.itens[0].idadeVendaMin).toBe(5);
  });
  it('sem histórico limita a quantidade e avisa', () => {
    const [op] = planFlip(snap(rows), P, NOW);
    expect(op.itens[0].qtd).toBe(CAP_SEM_VOLUME.flip);
    expect(op.riscos.join(' ')).toMatch(/limitada a 5/);
  });
  it('capital limita a quantidade; volume do Black Market também', () => {
    const vol = { T4_BAG: { 'Black Market': 300, Martlock: 50 } as Partial<Record<City, number>> };
    const pouco = planFlip(snap(rows, { volume: vol }), { ...P, prata: 25_000, minutos: 30 }, NOW);
    // 30 min: Martlock (ciclo 30) ou Caerleon (ciclo 10, 3 viagens); 2 por viagem
    expect(pouco[0].itens[0].qtd).toBeGreaterThanOrEqual(2);
    expect(pouco[0].capital).toBeLessThanOrEqual(25_000);
    const muito = planFlip(snap(rows, { volume: { T4_BAG: { 'Black Market': 7, Caerleon: 100, Martlock: 100 } } }), P, NOW);
    expect(muito[0].itens[0].qtd).toBe(7);
    expect(muito[0].riscos.join(' ')).toMatch(/comprou por dia/);
  });
  it('histórico buscado sem venda no Black Market = 0, não "desconhecido" (igual ao transporte)', () => {
    const [op] = planFlip(snap(rows, { volume: { T4_BAG: { Caerleon: 100, Martlock: 100 } } }), P, NOW);
    expect(op.itens[0].qtd).toBe(1);
    expect(op.motivos).not.toContain('volume do Black Market desconhecido');
    expect(op.riscos.join(' ')).not.toMatch(/Sem histórico de vendas no Black Market/);
  });
  it('volume médio: só os 7 dias completos antes de hoje (o dia em andamento fica fora)', () => {
    const pts = (datas: string[]) => datas.map((date) => ({ date: `${date}T00:00:00`, avg: 100, count: 70 }));
    // 23/10 a 29/10 = 7 dias completos; 30/10 é hoje (em andamento); 22/10 já passou da janela.
    const v = avgDaily([{ city: 'Martlock', points: pts(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) }], NOW);
    expect(v.Martlock).toBe(70);
  });
  it('origem que quase não vende limita a compra (livro raso) e baixa o selo', () => {
    const only = [row('T4_BAG', 'Caerleon', 10_000), row('T4_BAG', 'Black Market', null, 14_000)];
    const [op] = planFlip(snap(only, { volume: { T4_BAG: { 'Black Market': 500 } } }), P, NOW);
    expect(op.itens[0].qtd).toBe(5);
    expect(op.riscos.join(' ')).toMatch(/Caerleon vendeu quase nada/);
    expect(op.motivos).toContain('pouco volume');
    expect(op.confianca).toBeLessThan(100);
  });
  it('rota por zona vermelha baixa a confiança e escreve o risco', () => {
    const only = [row('T4_BAG', 'Martlock', 10_000), row('T4_BAG', 'Black Market', null, 14_000)];
    const [op] = planFlip(snap(only, { volume: { T4_BAG: { 'Black Market': 100, Martlock: 100 } } }), P, NOW);
    expect(op.riscos[0]).toMatch(/zona vermelha/);
    expect(op.confianca).toBe(80);
    expect(op.passos[1]).toMatch(/cerca de 10 min/);
  });
  it('tempo curto demais para ir e voltar exclui a cidade', () => {
    const only = [row('T4_BAG', 'Martlock', 10_000), row('T4_BAG', 'Black Market', null, 14_000)];
    expect(planFlip(snap(only), { ...P, minutos: 20 }, NOW)).toEqual([]);
  });
  it('Premium muda o imposto e o lucro', () => {
    const com = planFlip(snap(rows), P, NOW)[0];
    const sem = planFlip(snap(rows), { ...P, premium: false }, NOW)[0];
    expect(com.lucro).toBeGreaterThan(sem.lucro);
    expect(sem.passos.join(' ')).toMatch(/8% sem Premium/);
  });
  it('preço velho derruba a confiança e pede para conferir', () => {
    const old = [row('T4_BAG', 'Caerleon', 10_000, null, 180), row('T4_BAG', 'Black Market', null, 14_000)];
    const [op] = planFlip(snap(old, { volume: { T4_BAG: { 'Black Market': 100, Caerleon: 100 } } }), P, NOW);
    expect(op.confianca).toBeLessThan(70);
    expect(op.riscos.join(' ')).toMatch(/confirme no jogo/);
  });
  it('sem lucro, sem opção; no máximo 3 itens', () => {
    expect(planFlip(snap([row('T4_BAG', 'Caerleon', 14_000), row('T4_BAG', 'Black Market', null, 14_000)]), P, NOW)).toEqual([]);
    const many = FLIP_ITEMS.slice(0, 6).flatMap((it) => [row(it.id, 'Caerleon', 1_000), row(it.id, 'Black Market', null, 2_000)]);
    expect(planFlip(snap(many), P, NOW)).toHaveLength(3);
  });
});

describe('refino', () => {
  // T4 barra de aço em Thetford: 2 minérios (300) + 1 barra T3 (200) = 800; barra T4 a 1000
  const rows = [row('T4_ORE', 'Thetford', 300), row('T3_METALBAR', 'Thetford', 200), row('T4_METALBAR', 'Thetford', 1_000)];
  it('conta com retorno médio de 36,7% sem foco e passo com foco', () => {
    const c = refinoCalc(800, 1_000, rrr(0.58), 80_000, 10_000, 0.065)!;
    expect(c.crafts).toBe(100);
    expect(c.produz).toBe(158); // 100 / (1 − 0,367) = 100 × 1,58
    expect(c.venda - c.taxas - c.compra).toBe(c.lucro);
    const ops = planRefino(snap(rows, { volume: { T4_METALBAR: { Thetford: 5_000 } } }), { ...P, prata: 80_000 }, NOW);
    expect(ops).toHaveLength(1);
    expect(ops[0].trilha).toBe('refino');
    expect(ops[0].itens.map((i) => i.qtd)).toEqual([200, 100, 158]);
    expect(ops[0].passos.join(' ')).toMatch(/Com foco, o retorno sobe para 53,9%/);
    expect(ops[0].passos.join(' ')).toMatch(/especialização/);
    expect(ops[0].conta!.compra).toBe(80_000);
  });
  it('bônus do dia aumenta o retorno e o lucro e aparece no título', () => {
    const sem = planRefino(snap(rows), P, NOW)[0];
    const com = planRefino(snap(rows, { daily: [{ name: 'COMMON_ORE', start: ago(60), end: ago(-600) }] }), P, NOW)[0];
    expect(com.titulo).toMatch(/bônus do dia/);
    expect(com.passos[0]).toMatch(/bônus de refino de minério/);
    expect(com.lucro / com.capital).toBeGreaterThan(sem.lucro / sem.capital);
  });
  it('volume diário limita o que se produz', () => {
    const [op] = planRefino(snap(rows, { volume: { T4_METALBAR: { Thetford: 40 } } }), P, NOW);
    expect(op.itens[2].qtd).toBe(40);
    expect(op.riscos.join(' ')).toMatch(/vendeu por dia/);
  });
  it('o tempo informado limita quantos itens dá para refinar', () => {
    const [op] = planRefino(snap(rows, { volume: { T4_METALBAR: { Thetford: 5_000 } } }), { ...P, minutos: 30 }, NOW);
    // (30 − 20) min / 0,04167 min por barra T4 = 239
    expect(op.itens[2].qtd).toBe(239);
    expect(op.minutos).toBeLessThanOrEqual(30);
    expect(op.riscos.join(' ')).toMatch(/dá para refinar em 10 min/);
  });
  it('falta de preço ou prejuízo: sem opção', () => {
    expect(planRefino(snap(rows.slice(0, 2)), P, NOW)).toEqual([]);
    expect(planRefino(snap([...rows.slice(0, 2), row('T4_METALBAR', 'Thetford', 500)]), P, NOW)).toEqual([]);
  });
});

describe('transporte', () => {
  it('spread líquido com taxa de anúncio e imposto; volume do destino limita', () => {
    const rows = [row('T5_PLANKS', 'Fort Sterling', 1_000), row('T5_PLANKS', 'Martlock', 1_300)];
    const [op] = planTransporte(snap(rows, { volume: { T5_PLANKS: { Martlock: 120, 'Fort Sterling': 5_000 } } }), P, NOW);
    expect(op.trilha).toBe('transporte');
    expect(op.itens[0].qtd).toBe(120);
    expect(op.conta!.taxas).toBe(Math.round(120 * 1_300 * 0.065));
    expect(op.lucro).toBe(120 * 1_300 - op.conta!.taxas - 120 * 1_000);
    expect(op.riscos[0]).toMatch(/zonas azuis e amarelas/);
  });
  it('taxas comem o spread pequeno', () => {
    const rows = [row('T5_PLANKS', 'Fort Sterling', 1_000), row('T5_PLANKS', 'Martlock', 1_050)];
    expect(planTransporte(snap(rows), P, NOW)).toEqual([]);
  });
  it('Caerleon e Brecilien escrevem o risco da rota', () => {
    const red = planTransporte(snap([row('T5_PLANKS', 'Caerleon', 1_000), row('T5_PLANKS', 'Martlock', 1_500)]), P, NOW)[0];
    expect(red.riscos[0]).toMatch(/zona vermelha/);
    const mist = planTransporte(snap([row('T5_PLANKS', 'Brecilien', 1_000), row('T5_PLANKS', 'Martlock', 1_500)]), P, NOW)[0];
    expect(mist.riscos[0]).toMatch(/Brumas/);
    expect(mist.confianca).toBeLessThan(red.confianca);
  });
});

describe('montagem, seleção e validação', () => {
  it('notas explicam trilha vazia e ordem é lucro × confiança', () => {
    const r = buildHoje(snap([]), P, NOW);
    expect(r.opcoes).toEqual([]);
    expect(r.notas!.length).toBeGreaterThanOrEqual(3);
    expect(r.fetchedAt).toBe(ago(3));
    const rows = [
      row('T4_BAG', 'Caerleon', 10_000), row('T4_BAG', 'Black Market', null, 14_000),
      row('T5_PLANKS', 'Fort Sterling', 1_000), row('T5_PLANKS', 'Martlock', 1_300),
    ];
    const full = buildHoje(snap(rows), P, NOW);
    const scores = full.opcoes.map((o) => o.lucro * o.confianca);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
  it('com menos de 20 minutos, a nota do refino fala do tempo, não da prata', () => {
    const r = buildHoje(snap([]), { ...P, minutos: 15 }, NOW);
    expect(r.notas!.join(' ')).toMatch(/menos de 20 minutos/);
    expect(r.notas!.join(' ')).not.toMatch(/Nenhum refino dá lucro/);
    expect(buildHoje(snap([]), P, NOW).notas!.join(' ')).toMatch(/Nenhum refino dá lucro/);
  });
  it('festividade indisponível vira nota', () => {
    expect(buildHoje(snap([], { festOk: false }), P, NOW).notas![0]).toMatch(/bônus do dia/);
  });
  it('selo combina o lado mais fraco', () => {
    const c = combinedConfidence([{ price: 100, ageMin: 5 }, { price: 100, ageMin: 200 }], 'nenhuma', false);
    expect(c.score).toBe(60);
    expect(c.motivos[0]).toBe('preço mais antigo visto há 3 h');
  });
  it('histórico para no máximo 9 itens', () => {
    const rows = basketIds().flatMap((id, k) => [row(id, 'Caerleon', 1_000 + k), row(id, 'Martlock', 3_000), row(id, 'Black Market', null, 5_000), row(id, 'Thetford', 100)]);
    const ids = selectHistoryIds(rows);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(9);
  });
  it('valida prata, minutos e Premium', () => {
    expect(parseHojeParams(new URLSearchParams('prata=5000000&minutos=120&premium=1'))).toEqual({ prata: 5_000_000, minutos: 120, premium: true });
    expect(parseHojeParams(new URLSearchParams('prata=1.000.000'))).toEqual({ prata: 1_000_000, minutos: 60, premium: false });
    expect(parseHojeParams(new URLSearchParams(''))).toHaveProperty('error');
    expect(parseHojeParams(new URLSearchParams('prata=10'))).toHaveProperty('error');
    expect(parseHojeParams(new URLSearchParams('prata=abc'))).toHaveProperty('error');
    expect(parseHojeParams(new URLSearchParams('prata=100000&minutos=5'))).toHaveProperty('error');
  });
});

describe('rota GET /api/hoje', () => {
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const env = {} as never;
  const req = (q: string) => new Request(`https://guarita.pages.dev/api/hoje${q}`);

  it('ignora outro caminho e recusa sem prata', async () => {
    expect(await routeHojeImpl(req(''), new URL('https://x/api/clock'), env, ctx)).toBeNull();
    const r = (await routeHojeImpl(req(''), new URL('https://x/api/hoje'), env, ctx))!;
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/prata/);
  });

  it('monta a resposta com fetch falso, cache de 5 min, e gasta poucas chamadas', async () => {
    mockCaches();
    const aodp = (min: number) => new Date(NOW - min * 60_000).toISOString().replace('Z', '');
    const calls = mockFetch((url) => {
      if (url.includes('/prices/')) {
        return jsonRes([
          { item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell_price_min: 10_000, sell_price_min_date: aodp(4), buy_price_max: 0, buy_price_max_date: '0001-01-01T00:00:00' },
          { item_id: 'T4_BAG', city: 'Black Market', quality: 1, sell_price_min: 0, sell_price_min_date: '0001-01-01T00:00:00', buy_price_max: 14_000, buy_price_max_date: aodp(4) },
        ]);
      }
      if (url.includes('/festivities')) return jsonRes({ Events: [] });
      if (url.includes('/history/')) {
        return jsonRes([
          // anteontem: o dia em andamento não entra na média (avgDaily)
          { location: 'Black Market', item_id: 'T4_BAG', quality: 1, data: [{ item_count: 70, avg_price: 14_000, timestamp: aodp(2 * 1440) }] },
          { location: 'Caerleon', item_id: 'T4_BAG', quality: 1, data: [{ item_count: 700, avg_price: 10_000, timestamp: aodp(2 * 1440) }] },
        ]);
      }
      return new Response('não', { status: 404 });
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      const r = (await routeHojeImpl(req('?prata=1000000&minutos=60&premium=1'), new URL('https://x/api/hoje?prata=1000000&minutos=60&premium=1'), env, ctx))!;
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('public, max-age=300');
      const body = (await r.json()) as HojeResponseX;
      expect(body.opcoes[0].trilha).toBe('flip');
      expect(body.opcoes[0].itens[0].qtd).toBe(10); // 70 vendidos em 7 dias = 10 por dia
      expect(calls.length).toBeLessThanOrEqual(2 + 1 + 9);
      const n = calls.length;
      await routeHojeImpl(req('?prata=5000000'), new URL('https://x/api/hoje?prata=5000000'), env, ctx);
      expect(calls.length).toBe(n); // retrato em cache: nenhuma chamada nova
    } finally {
      vi.useRealTimers();
    }
  });

  it('AODP fora e sem cache: 502 com mensagem', async () => {
    mockCaches();
    mockFetch(() => new Response('erro', { status: 503 }));
    const r = (await routeHojeImpl(req('?prata=1000000'), new URL('https://x/api/hoje?prata=1000000'), env, ctx))!;
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toMatch(/AODP/);
  });
});

describe('tela (src/lib/hoje/view)', () => {
  it('conta derivada quando a resposta não traz conta', () => {
    const op = {
      trilha: 'transporte' as const, titulo: '', passos: [], lucro: 100, capital: 1_000, minutos: 30, confianca: 80, riscos: [],
      itens: [{ id: 'X', nome: 'X', qtd: 10, compra: 100, venda: 125, cidadeCompra: null, cidadeVenda: null }],
    };
    expect(contaDe(op)).toEqual({ compra: 1_000, venda: 1_250, taxas: 150, lucro: 100 });
    expect(contaDe({ ...op, conta: { compra: 1, venda: 2, taxas: 3, lucro: 4 } })).toEqual({ compra: 1, venda: 2, taxas: 3, lucro: 4 });
  });
  it('consulta na URL vai e volta', () => {
    expect(parseHojeQuery('?prata=5000000&minutos=120&premium=1')).toEqual({ prata: 5_000_000, minutos: 120, premium: true });
    expect(parseHojeQuery('?prata=x&minutos=7')).toEqual({ prata: null, minutos: 60, premium: false });
    expect(hojeQuery({ prata: 1_000_000, minutos: 30, premium: false })).toBe('?prata=1000000&minutos=30&premium=0');
  });
  it('lê prata digitada de vários jeitos', () => {
    expect(parsePrata('1.500.000')).toBe(1_500_000);
    expect(parsePrata('1,5 mi')).toBe(1_500_000);
    expect(parsePrata('2kk')).toBe(2_000_000);
    expect(parsePrata('300k')).toBe(300_000);
    expect(parsePrata('750 mil')).toBe(750_000);
    expect(parsePrata('')).toBeNull();
    expect(parsePrata('abc')).toBeNull();
  });
  it('rótulos e selo', () => {
    expect(trilhaLabel('flip')).toBe('Flip para o Black Market');
    expect(confidenceOf(85, ['x']).label).toBe('alta');
    expect(confidenceOf(30, []).label).toBe('baixa');
  });
  it('anúncio curto para leitor de tela, no lugar de ler a página inteira', () => {
    expect(anuncioHoje({ loading: true, error: null, contagem: null })).toMatch(/Consultando/);
    expect(anuncioHoje({ loading: false, error: 'API fora', contagem: null })).toBe('Não deu para montar as opções: API fora');
    expect(anuncioHoje({ loading: false, error: null, contagem: { flip: 3, refino: 0, transporte: 1 } })).toBe(
      'Opções prontas: 3 de flip, nenhuma de refino e 1 de transporte.',
    );
    expect(anuncioHoje({ loading: false, error: null, contagem: null })).toBe('');
  });
});

describe('bot /hoje e MCP o_que_fazer', () => {
  const rows = [
    row('T4_BAG', 'Caerleon', 10_000), row('T4_BAG', 'Black Market', null, 14_000),
    row('T5_PLANKS', 'Fort Sterling', 1_000), row('T5_PLANKS', 'Martlock', 1_300),
    row('T4_ORE', 'Thetford', 300), row('T3_METALBAR', 'Thetford', 200), row('T4_METALBAR', 'Thetford', 1_000),
  ];
  const resp = buildHoje(snap(rows), P, NOW);

  it('comando registrado com prata obrigatória, minutos 30/60/120 e Premium booleano', () => {
    const cmd = COMMANDS.find((c) => c.name === 'hoje')!;
    expect(cmd.options!.map((o) => [o.name, o.type, !!o.required])).toEqual([['prata', 4, true], ['minutos', 4, false], ['premium', 5, false]]);
    expect(cmd.options![1].choices!.map((c) => c.value)).toEqual([30, 60, 120]);
  });
  it('lê as opções do comando e recusa prata fora da faixa', () => {
    expect(hojeParams([{ name: 'prata', type: 4, value: 2_000_000 }, { name: 'premium', type: 5, value: true }])).toEqual({ prata: 2_000_000, minutos: 60, premium: true });
    expect(hojeParams([{ name: 'prata', type: 4, value: 50_000 }, { name: 'minutos', type: 4, value: 120 }])).toEqual({ prata: 50_000, minutos: 120, premium: false });
    expect(() => hojeParams([{ name: 'prata', type: 4, value: 10 }])).toThrow(UserError);
  });
  it('embed dentro dos limites do Discord, com conta, selo e aviso de que não é promessa', () => {
    const m = renderHoje(resp, NOW);
    const e = m.embeds![0];
    expect(e.title).toBe('O que fazer hoje');
    expect(e.fields!.length).toBeGreaterThanOrEqual(3);
    expect(e.fields!.length).toBeLessThanOrEqual(6);
    for (const f of e.fields!) expect(f.value.length).toBeLessThanOrEqual(1024);
    expect(e.fields![0].value).toMatch(/lucro estimado/);
    expect(e.fields![0].name).toMatch(/confiança \d+\/100/);
    expect(e.description).toMatch(/não são promessa de lucro/);
    expect(m.components![0].components[0].url).toBe('https://guarita.pages.dev/hoje?prata=1000000&minutos=60&premium=1');
    const vazio = renderHoje(buildHoje(snap([]), P, NOW), NOW);
    expect(vazio.embeds![0].description).toMatch(/Nenhuma opção/);
  });
  it('resumo do MCP traz conta, passos, riscos e link', () => {
    const t = summarizeHoje(resp, NOW);
    const txt = t.content[0].text;
    expect(txt).toMatch(/Conta: compra/);
    expect(txt).toMatch(/Riscos:/);
    expect(txt).toMatch(/não promessa de lucro/);
    expect(t.structuredContent!.link).toBe('https://guarita.pages.dev/hoje?prata=1000000&minutos=60&premium=1');
    expect((t.structuredContent!.opcoes as unknown[]).length).toBe(resp.opcoes.length);
  });
  it('callTool valida os argumentos', async () => {
    const deps = { env: {} as never, ctx: { waitUntil: () => {} } as unknown as ExecutionContext };
    expect((await callTool('o_que_fazer', {}, deps)).isError).toBe(true);
    expect((await callTool('o_que_fazer', { prata: 10 }, deps)).isError).toBe(true);
    expect((await callTool('o_que_fazer', { prata: 1_000_000, premium: 'talvez' }, deps)).content[0].text).toMatch(/true ou false/);
    expect((await callTool('o_que_fazer', { prata: 1_000_000, minutos: 240 }, deps)).content[0].text).toMatch(/30, 60 ou 120/);
  });
  it('MCP, bot e site oferecem os mesmos minutos: o link do MCP reproduz a mesma consulta no site', () => {
    const tool = MCP_TOOLS.find((t) => t.name === 'o_que_fazer')!;
    const schemaMin = tool.inputSchema.properties.minutos.enum;
    expect(schemaMin).toEqual([...HOJE_MINUTOS]);
    expect([...MINUTOS_OPCOES]).toEqual([...HOJE_MINUTOS]);
    for (const minutos of HOJE_MINUTOS) {
      const r = { ...resp, prata: 2_500_000, minutos, premium: false };
      const link = summarizeHoje(r, NOW).structuredContent!.link as string;
      expect(parseHojeQuery(new URL(link).search)).toEqual({ prata: 2_500_000, minutos, premium: false });
    }
  });
});
