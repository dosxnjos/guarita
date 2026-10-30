import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CityHistory, PriceRow } from '../../shared/types';
import type { Fetched, GuaritaApi } from '../src/lib/api';
import { defaultConfig, type GuaritaConfig, type RegraLocal } from '../src/lib/config';
import {
  avaliarRegra,
  cooldownOk,
  criarMotorAlertas,
  medianaCidade,
  montarLotes,
  PRIMEIRA_CHECAGEM_MS,
  vozDisparo,
} from '../src/lib/engine/alerts';
import type { Aviso } from '../src/lib/notify';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const minAtras = (m: number) => new Date(NOW - m * 60000).toISOString();

const regra = (p: Partial<RegraLocal> = {}): RegraLocal => ({
  id: 'r1',
  itemId: 'T4_BAG',
  itemName: 'Bolsa do Adepto',
  quality: 1,
  cities: ['Lymhurst', 'Martlock'],
  side: 'sell',
  condition: { kind: 'below', price: 4000 },
  cooldownMin: 60,
  createdAt: minAtras(600),
  ativa: true,
  voz: true,
  ...p,
});

const row = (p: Partial<PriceRow> = {}): PriceRow => ({
  id: 'T4_BAG',
  city: 'Lymhurst',
  quality: 1,
  sellMin: 3500,
  sellMinAt: minAtras(4),
  buyMax: 3000,
  buyMaxAt: minAtras(4),
  ...p,
});

describe('avaliarRegra', () => {
  it('dispara abaixo do alvo, com mensagem exata e voz por extenso', () => {
    const d = avaliarRegra(regra(), [row()], NOW)!;
    expect(d).toMatchObject({ regraId: 'r1', city: 'Lymhurst', price: 3500, ageMin: 4 });
    expect(d.mensagem).toBe('Bolsa do Adepto a 3.500 em Lymhurst (visto há 4 min). Abaixo do seu alvo de 4.000.');
    expect(d.voz).toBe('Bolsa do Adepto a três mil e quinhentos em Lymhurst');
  });

  it('não dispara no alvo exato nem acima', () => {
    expect(avaliarRegra(regra(), [row({ sellMin: 4000 })], NOW)).toBeNull();
    expect(avaliarRegra(regra(), [row({ sellMin: 4100 })], NOW)).toBeNull();
  });

  it('escolhe a cidade mais barata para "abaixo" e a mais cara para "acima"', () => {
    const rows = [row({ city: 'Lymhurst', sellMin: 3500 }), row({ city: 'Martlock', sellMin: 3200 })];
    expect(avaliarRegra(regra(), rows, NOW)?.city).toBe('Martlock');
    const acima = regra({ condition: { kind: 'above', price: 3000 } });
    expect(avaliarRegra(acima, rows, NOW)?.city).toBe('Lymhurst');
  });

  it('ignora outra cidade, outra qualidade, outro item e lado errado', () => {
    expect(avaliarRegra(regra(), [row({ city: 'Thetford' })], NOW)).toBeNull();
    expect(avaliarRegra(regra(), [row({ quality: 2 })], NOW)).toBeNull();
    expect(avaliarRegra(regra(), [row({ id: 'T5_BAG' })], NOW)).toBeNull();
    const compra = regra({ side: 'buy', condition: { kind: 'above', price: 2900 } });
    const d = avaliarRegra(compra, [row()], NOW)!;
    expect(d.price).toBe(3000);
    expect(d.voz).toBe('Pedido de compra de Bolsa do Adepto a três mil em Lymhurst');
  });

  it('preço velho (mais de 6 h), sem data ou zerado não dispara', () => {
    expect(avaliarRegra(regra(), [row({ sellMinAt: minAtras(6 * 60 + 1) })], NOW)).toBeNull();
    expect(avaliarRegra(regra(), [row({ sellMinAt: null })], NOW)).toBeNull();
    expect(avaliarRegra(regra(), [row({ sellMin: null })], NOW)).toBeNull();
  });

  it('regra desligada não dispara', () => expect(avaliarRegra(regra({ ativa: false }), [row()], NOW)).toBeNull());

  it('cooldown: não dispara antes do intervalo; depois, só com observação nova', () => {
    const r = regra({ lastFiredAt: minAtras(30) });
    expect(cooldownOk(r, NOW)).toBe(false);
    expect(avaliarRegra(r, [row()], NOW)).toBeNull();
    const r2 = regra({ lastFiredAt: minAtras(61) });
    expect(cooldownOk(r2, NOW)).toBe(true);
    // Mesma observação de antes do último disparo: não avisa de novo.
    expect(avaliarRegra(r2, [row({ sellMinAt: minAtras(90) })], NOW)).toBeNull();
    expect(avaliarRegra(r2, [row({ sellMinAt: minAtras(10) })], NOW)).not.toBeNull();
  });

  it('abaixo da mediana usa a mediana da própria cidade', () => {
    const r = regra({ condition: { kind: 'belowMedianPct', pct: 20 } });
    const rows = [row({ city: 'Lymhurst', sellMin: 3500 }), row({ city: 'Martlock', sellMin: 3500 })];
    // Lymhurst: 3500 <= 5000*0,8 → dispara; Martlock: 3500 > 4000*0,8 → não.
    const d = avaliarRegra(r, rows, NOW, { Lymhurst: 5000, Martlock: 4000 })!;
    expect(d.city).toBe('Lymhurst');
    expect(d.median).toBe(5000);
    expect(d.mensagem).toContain('30% abaixo da mediana de 7 dias da cidade (5.000)');
    expect(avaliarRegra(r, rows, NOW, null)).toBeNull();
    expect(avaliarRegra(r, rows, NOW, 5000)?.city).toBe('Lymhurst');
  });

  it('qualidade acima de Normal entra no nome', () => {
    const r = regra({ quality: 4 });
    const d = avaliarRegra(r, [row({ quality: 4 })], NOW)!;
    expect(d.mensagem.startsWith('Bolsa do Adepto (Excelente) a 3.500')).toBe(true);
    expect(vozDisparo(r, d)).toBe('Bolsa do Adepto, excelente, a três mil e quinhentos em Lymhurst');
  });
});

describe('medianaCidade', () => {
  const dia = (d: number) => new Date(NOW - d * 86400000).toISOString().slice(0, 10);
  it('ponderada pela quantidade, com mínimo de 3 dias nos últimos 7', () => {
    const h: CityHistory[] = [
      { city: 'Lymhurst', days: [{ date: dia(1), avg: 100, count: 1 }, { date: dia(2), avg: 200, count: 10 }, { date: dia(3), avg: 300, count: 1 }] },
      { city: 'Martlock', days: [{ date: dia(1), avg: 100, count: 1 }, { date: dia(2), avg: 200, count: 1 }] },
      { city: 'Thetford', days: [{ date: dia(1), avg: 100, count: 1 }, { date: dia(2), avg: 100, count: 1 }, { date: dia(20), avg: 900, count: 99 }] },
    ];
    expect(medianaCidade(h, NOW)).toEqual({ Lymhurst: 200, Martlock: null, Thetford: null });
  });
});

describe('montarLotes', () => {
  it('um lote com ids únicos, cidades e qualidades das regras ativas', () => {
    const l = montarLotes([
      regra(),
      regra({ id: 'r2', itemId: 't4_bag', quality: 3, cities: ['Caerleon'] }),
      regra({ id: 'r3', itemId: 'T5_BAG', ativa: false }),
    ]);
    expect(l).toHaveLength(1);
    expect(l[0].ids).toEqual(['T4_BAG']);
    expect(l[0].cities.sort()).toEqual(['Caerleon', 'Lymhurst', 'Martlock']);
    expect(l[0].qualities).toEqual([1, 3]);
  });
  it('quebra em lotes de 300 ids', () => {
    const rs = Array.from({ length: 301 }, (_, i) => regra({ id: `r${i}`, itemId: `T4_ITEM_${i}` }));
    expect(montarLotes(rs).map((x) => x.ids.length)).toEqual([300, 1]);
  });
});

// ---------- motor (fake timers, API falsa) ----------

function apiFalsa(rows: () => PriceRow[]) {
  const prices = vi.fn(async () => ({ data: { fetchedAt: new Date().toISOString(), rows: rows() }, at: Date.now(), fromCache: false }) as Fetched<never>);
  const item = vi.fn();
  return { api: { prices, item } as unknown as GuaritaApi, prices, item };
}

describe('criarMotorAlertas', () => {
  afterEach(() => vi.useRealTimers());

  it('checa logo ao abrir e depois a cada intervalo; avisa e grava o disparo; parar encerra', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let cfg: GuaritaConfig = { ...defaultConfig(), regras: [regra()], intervaloRegrasMin: 3 };
    const { api, prices } = apiFalsa(() => [row({ sellMinAt: new Date(Date.now() - 60000).toISOString() })]);
    const avisos: Aviso[] = [];
    const marcar = vi.fn(async (id: string, quando: string) => {
      cfg = { ...cfg, regras: cfg.regras.map((r) => (r.id === id ? { ...r, lastFiredAt: quando } : r)) };
    });
    const m = criarMotorAlertas({ api, getConfig: () => cfg, avisar: async (a) => void avisos.push(a), marcarDisparo: marcar });
    m.iniciar();
    expect(prices).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PRIMEIRA_CHECAGEM_MS);
    expect(prices).toHaveBeenCalledTimes(1);
    expect(prices.mock.calls[0]).toEqual([{ ids: ['T4_BAG'], cities: ['Lymhurst', 'Martlock'], qualities: [1] }]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ titulo: 'Preço no alvo', voz: 'Bolsa do Adepto a três mil e quinhentos em Lymhurst' });
    expect(marcar).toHaveBeenCalledTimes(1);

    // 3 min depois checa de novo, mas o cooldown (60 min) segura o aviso.
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(prices).toHaveBeenCalledTimes(2);
    expect(avisos).toHaveLength(1);

    m.parar();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(prices).toHaveBeenCalledTimes(2);
    expect(m.rodando()).toBe(false);
  });

  it('sem regras ativas não chama a API; regra com voz desligada avisa sem falar', async () => {
    let cfg: GuaritaConfig = { ...defaultConfig(), regras: [regra({ ativa: false })] };
    const { api, prices } = apiFalsa(() => [row()]);
    const avisos: Aviso[] = [];
    const m = criarMotorAlertas({ api, getConfig: () => cfg, avisar: async (a) => void avisos.push(a), marcarDisparo: async () => {}, now: () => NOW });
    expect(await m.checarAgora()).toEqual([]);
    expect(prices).not.toHaveBeenCalled();
    cfg = { ...cfg, regras: [regra({ voz: false })] };
    expect(await m.checarAgora()).toHaveLength(1);
    expect(avisos[0].voz).toBe(false);
  });

  it('erro da API não derruba o motor e fica no estado', async () => {
    const api = { prices: vi.fn(async () => Promise.reject(new Error('Sem conexão com a Guarita.'))) } as unknown as GuaritaApi;
    const onErro = vi.fn();
    const m = criarMotorAlertas({ api, getConfig: () => ({ ...defaultConfig(), regras: [regra()] }), avisar: async () => {}, marcarDisparo: async () => {}, onErro, now: () => NOW });
    expect(await m.checarAgora()).toEqual([]);
    expect(onErro).toHaveBeenCalled();
    expect(m.estado().erro).toBe('Sem conexão com a Guarita.');
  });

  it('busca a mediana uma vez por hora por item (não a cada ciclo)', async () => {
    let t = NOW;
    const dia = (d: number) => new Date(NOW - d * 86400000).toISOString().slice(0, 10);
    const hist: CityHistory[] = [{ city: 'Lymhurst', days: [1, 2, 3].map((d) => ({ date: dia(d), avg: 5000, count: 5 })) }];
    const item = vi.fn(async () => ({ data: { history: hist }, at: t, fromCache: false }));
    const prices = vi.fn(async () => ({ data: { fetchedAt: '', rows: [row({ sellMinAt: new Date(t - 60000).toISOString() })] }, at: t, fromCache: false }));
    const api = { item, prices } as unknown as GuaritaApi;
    const cfg = { ...defaultConfig(), regras: [regra({ condition: { kind: 'belowMedianPct', pct: 20 }, cooldownMin: 5 })] };
    const m = criarMotorAlertas({ api, getConfig: () => cfg, avisar: async () => {}, marcarDisparo: async () => {}, now: () => t });
    expect(await m.checarAgora()).toHaveLength(1);
    t += 3 * 60_000;
    await m.checarAgora();
    expect(item).toHaveBeenCalledTimes(1);
    t += 61 * 60_000;
    await m.checarAgora();
    expect(item).toHaveBeenCalledTimes(2);
  });
});
