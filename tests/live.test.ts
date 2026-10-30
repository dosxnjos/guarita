import { describe, expect, it } from 'vitest';
import type { CityQuote, GuildSummary, ItemResponse } from '../shared/types';
import {
  LIVE_MAX_ITEMS, buildLiveQuery, buildLiveUrl, isConfigMode, liveBonuses, liveGuildStats, livePrice, parseBlocks, parseCity, parseItems,
  parseLiveConfig, parseScale, utcDay,
} from '../src/lib/live/config';

describe('parseLiveConfig', () => {
  it('lê o exemplo completo do enunciado', () => {
    const c = parseLiveConfig('?blocos=relogio,precos,guilda&itens=T4_BAG,T5_BAG&guilda=Nome&tema=escuro&tamanho=1.2&cidade=Caerleon');
    expect(c).toEqual({ blocks: ['relogio', 'precos', 'guilda'], items: ['T4_BAG', 'T5_BAG'], guild: 'Nome', theme: 'escuro', scale: 1.2, city: 'Caerleon' });
  });

  it('aceita com ou sem "?" e URLSearchParams', () => {
    const a = parseLiveConfig('blocos=relogio');
    const b = parseLiveConfig(new URLSearchParams('blocos=relogio'));
    expect(a).toEqual(b);
    expect(a.blocks).toEqual(['relogio']);
  });

  it('padrões: tema escuro, tamanho 1, sem cidade, só relógio', () => {
    expect(parseLiveConfig('tema=xyz')).toEqual({ blocks: ['relogio'], items: [], guild: '', theme: 'escuro', scale: 1, city: null });
  });

  it('sem "blocos" mostra relógio e o que tiver dado', () => {
    expect(parseLiveConfig('itens=T4_BAG').blocks).toEqual(['relogio', 'precos']);
    expect(parseLiveConfig('guilda=Bagres').blocks).toEqual(['relogio', 'guilda']);
  });

  it('bloco pedido sem dado sai; sobrando nada, fica o relógio', () => {
    expect(parseLiveConfig('blocos=precos,guilda').blocks).toEqual(['relogio']);
    expect(parseLiveConfig('blocos=guilda,precos&itens=T4_BAG').blocks).toEqual(['precos']);
  });

  it('respeita a ordem, remove repetidos e aceita acento', () => {
    expect(parseBlocks('guilda, Relógio ,guilda,xpto,relogio')).toEqual(['guilda', 'relogio']);
  });

  it('tema claro', () => {
    expect(parseLiveConfig('tema=CLARO').theme).toBe('claro');
  });
});

describe('parseItems', () => {
  it('passa para maiúsculas, valida e tira repetidos', () => {
    expect(parseItems('t4_bag, T5_BAG@1,T5_BAG@1,bolsa,T9_BAG,T4_BAG@7,<script>')).toEqual(['T4_BAG', 'T5_BAG@1']);
  });
  it(`corta em ${LIVE_MAX_ITEMS} itens`, () => {
    const ids = Array.from({ length: 10 }, (_, i) => `T4_ITEM${i}`).join(',');
    expect(parseItems(ids)).toHaveLength(LIVE_MAX_ITEMS);
  });
  it('vazio ou ausente', () => {
    expect(parseItems(null)).toEqual([]);
    expect(parseItems(',,')).toEqual([]);
  });
});

describe('parseScale e parseCity', () => {
  it('prende o tamanho entre 0,6 e 3 e aceita vírgula', () => {
    expect(parseScale('1,5')).toBe(1.5);
    expect(parseScale('0.1')).toBe(0.6);
    expect(parseScale('9')).toBe(3);
    expect(parseScale('abc')).toBe(1);
    expect(parseScale('-2')).toBe(1);
    expect(parseScale(null)).toBe(1);
  });
  it('cidade sem diferença de maiúsculas, com espaço, hífen ou sublinhado; Black Market não vale', () => {
    expect(parseCity('caerleon')).toBe('Caerleon');
    expect(parseCity('fort-sterling')).toBe('Fort Sterling');
    expect(parseCity('Fort_Sterling')).toBe('Fort Sterling');
    expect(parseCity('Black Market')).toBeNull();
    expect(parseCity('Londres')).toBeNull();
    expect(parseCity('')).toBeNull();
  });
});

describe('guilda', () => {
  it('nome com espaços internos fica; curto ou longo demais é descartado', () => {
    expect(parseLiveConfig('guilda=%20B%20A%20G%20R%20E%20').guild).toBe('B A G R E');
    expect(parseLiveConfig('guilda=ab').guild).toBe('');
    expect(parseLiveConfig(`guilda=${'x'.repeat(65)}`).guild).toBe('');
  });
});

describe('isConfigMode', () => {
  it('sem parâmetro ou com ?config abre a configuração', () => {
    expect(isConfigMode('')).toBe(true);
    expect(isConfigMode('?')).toBe(true);
    expect(isConfigMode('?config')).toBe(true);
    expect(isConfigMode('?config&itens=T4_BAG')).toBe(true);
    expect(isConfigMode('?blocos=relogio')).toBe(false);
  });
});

describe('buildLiveQuery', () => {
  it('ida e volta preservam a configuração', () => {
    const c = parseLiveConfig('blocos=guilda,precos,relogio&itens=T4_BAG,T6_2H_BOW@2&guilda=Os Bagres&tema=claro&tamanho=1.4&cidade=Martlock');
    const q = buildLiveQuery(c);
    expect(parseLiveConfig(q)).toEqual(c);
    expect(isConfigMode(q)).toBe(false);
  });
  it('omite o padrão e mantém vírgulas legíveis', () => {
    const q = buildLiveQuery({ blocks: ['relogio', 'precos'], items: ['T4_BAG', 'T5_BAG'], guild: '', theme: 'escuro', scale: 1, city: null });
    expect(q).toBe('blocos=relogio,precos&itens=T4_BAG,T5_BAG');
    const q2 = buildLiveQuery({ blocks: ['precos'], items: ['T6_2H_BOW@1'], guild: '', theme: 'escuro', scale: 1, city: null });
    expect(q2).toBe('blocos=precos&itens=T6_2H_BOW@1');
  });
  it('não escreve dado de bloco desligado nem bloco sem dado', () => {
    const q = buildLiveQuery({ blocks: ['relogio', 'guilda', 'precos'], items: [], guild: 'Bagres', theme: 'escuro', scale: 1, city: 'Caerleon' });
    expect(q).toBe('blocos=relogio,guilda&guilda=Bagres');
  });
  it('URL completa a partir da origem', () => {
    const cfg = parseLiveConfig('blocos=relogio');
    expect(buildLiveUrl(cfg, 'https://guarita.pages.dev/')).toBe('https://guarita.pages.dev/live?blocos=relogio');
  });
});

const quote = (city: CityQuote['city'], sellMin: number | null, label: CityQuote['confidence']['label'], ageMin: number | null): CityQuote => ({
  city, sellMin, sellMinAt: null, buyMax: null, buyMaxAt: null, ageMin, confidence: { score: 50, label, reasons: [] }, verdict: 'normal',
});
const item = (cities: CityQuote[]): ItemResponse => ({
  id: 'T4_BAG', quality: 1, fetchedAt: '', cities, history: [], median7d: null, p25: null, p75: null, book: [], flips: [],
});

describe('livePrice', () => {
  const it4 = item([
    quote('Martlock', 900, 'baixa', 600),
    quote('Caerleon', 1200, 'alta', 10),
    quote('Lymhurst', 1100, 'média', 30),
    quote('Black Market', 500, 'alta', 5),
  ]);
  it('sem cidade: a mais barata confiável (fora o Black Market)', () => {
    expect(livePrice(it4, null)).toEqual({ price: 1100, city: 'Lymhurst', ageMin: 30, reliable: true });
  });
  it('com cidade: o preço dela', () => {
    expect(livePrice(it4, 'Martlock')).toEqual({ price: 900, city: 'Martlock', ageMin: 600, reliable: false });
  });
  it('sem dado', () => {
    expect(livePrice(it4, 'Thetford').price).toBeNull();
    expect(livePrice(null, null).price).toBeNull();
    expect(livePrice(item([quote('Caerleon', null, 'sem dado', null)]), null).price).toBeNull();
  });
});

describe('liveGuildStats', () => {
  const now = Date.parse('2026-10-30T02:00:00Z'); // 29/10 23:00 em Brasília, mas dia 30 no servidor
  const g = {
    name: 'Bagres', id: null, alliance: null, members: null, killFame: null, deathFame: null,
    days: [
      { date: '2026-10-22', kills: 100, deaths: 100 },
      { date: '2026-10-24', kills: 3, deaths: 1 },
      { date: '2026-10-29', kills: 5, deaths: 2 },
      { date: '2026-10-30', kills: 4, deaths: 6 },
    ],
    topKillers: [{ name: 'A', id: '1', kills: 2 }, { name: 'B', id: '2', kills: 9 }, { name: 'C', id: '3', kills: 5 }, { name: 'D', id: '4', kills: 1 }],
    weapons: [], hoursBrt: [], coverageSince: '2026-10-20', fetchedAt: '',
  } satisfies GuildSummary;
  it('usa o dia do servidor (UTC) e janela de 7 dias', () => {
    const s = liveGuildStats(g, now);
    expect(utcDay(now)).toBe('2026-10-30');
    expect(s).toMatchObject({ today: '2026-10-30', todayKills: 4, todayDeaths: 6, weekKills: 12, weekDeaths: 9 });
  });
  it('três que mais mataram, em ordem', () => {
    expect(liveGuildStats(g, now).top.map((t) => t.name)).toEqual(['B', 'C', 'A']);
  });
  it('guilda sem dias', () => {
    expect(liveGuildStats({ ...g, days: [], topKillers: [] }, now)).toMatchObject({ todayKills: 0, weekKills: 0, top: [] });
  });
});

describe('liveBonuses', () => {
  const now = Date.parse('2026-10-30T06:00:00Z');
  const f = (kind: number, labelPt: string, start: string, end: string) => ({ kind, category: '', name: labelPt, labelPt, start, end });
  const list = [
    f(0, 'Halloween 2026', '2026-10-23T10:00:00Z', '2026-11-12T10:00:00Z'),
    f(1, 'Pontos de facção em dobro', '2026-10-28T10:00:00Z', '2026-10-31T10:00:00Z'),
    f(2, 'Bônus de produção: bestas comuns', '2026-10-29T10:00:00Z', '2026-10-30T10:00:00Z'),
    f(2, 'Bônus de produção: armaduras de couro comuns', '2026-10-29T10:00:00Z', '2026-10-30T10:00:00Z'),
    f(2, 'Bônus de produção: bestas comuns', '2026-10-29T10:00:00Z', '2026-10-30T10:00:00Z'),
    f(2, 'Bônus de produção: machados', '2026-10-30T10:00:00Z', '2026-10-31T10:00:00Z'), // ainda não começou
    f(1, 'Bônus de fama', '2026-10-20T10:00:00Z', '2026-10-21T10:00:00Z'), // já acabou
  ];
  it('agrupa as ativas por tipo, sem repetir e sem o prefixo de produção', () => {
    expect(liveBonuses(list, now)).toEqual({
      production: ['bestas comuns', 'armaduras de couro comuns'],
      productionMsLeft: 4 * 3600_000,
      activities: ['Pontos de facção em dobro'],
      seasonal: ['Halloween 2026'],
    });
  });
  it('lista vazia', () => {
    expect(liveBonuses([], now)).toEqual({ production: [], productionMsLeft: null, activities: [], seasonal: [] });
  });
  it('em espanhol: rótulos pelo Kind/nome, nunca o português da API', () => {
    const g = (kind: number, category: string, name: string, labelPt: string) =>
      ({ kind, category, name, labelPt, start: '2026-10-29T10:00:00Z', end: '2026-10-30T10:00:00Z' });
    const es = liveBonuses([
      g(0, '', 'HALLOWEEN2026', 'Halloween 2026'),
      g(1, 'ACTIVITIES', 'FACTIONPOINTS', 'Pontos de facção em dobro'),
      g(2, 'GENERAL', 'COMMON_CROSSBOW', 'Bônus de produção: bestas comuns'),
      g(2, 'GENERAL', 'RARE_BOW', 'Bônus de produção: arcos raras'),
    ], now, 'es');
    expect(es).toEqual({
      production: ['ballestas comunes', 'arcos raros'],
      productionMsLeft: 4 * 3600_000,
      activities: ['Puntos de facción dobles'],
      seasonal: ['Halloween 2026'],
    });
  });
});
