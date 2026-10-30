// Módulo (c): dossiê, autópsia, cliente da gameinfo e família de arma. Fixtures reais da gameinfo de 29/10/2026
// (personagem de teste CalangoPeto e o matador da última morte dele), com LifetimeStatistics dos eventos cortado.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O tsconfig não carrega @types/node (o código roda em Workers); o fs entra só aqui, tipado à mão.
const NODE_FS = 'node:fs';
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as {
  existsSync(p: URL): boolean;
  readFileSync(p: URL, enc: 'utf8'): string;
};
import type { PriceRow } from '../shared/types';
import type { Env } from '../worker/env';

vi.mock('../worker/lib/aodp', () => ({ aodpPrices: vi.fn() }));

import { aodpPrices } from '../worker/lib/aodp';
import { weaponFamily, weaponLabelPt, weaponBase } from '../shared/weapons';
import { Budget, GameinfoError, _resetGameinfoMemory, gameinfoFetch } from '../worker/lib/gameinfo';
import {
  MSG_GAMEINFO_DOWN,
  MSG_NOT_FOUND,
  buildLessons,
  buildRebuy,
  computeDanger,
  fameRatio,
  fmtFame,
  fmtInt,
  gearValue,
  getAutopsy,
  getDossier,
  idsForOneCall,
  normalizeEvents,
  normalizePlayer,
  normalizeSearch,
  pickCheapest,
  routePlayer,
  statsOf,
  weaponsOf,
  type SlimEvent,
} from '../worker/api/player';

const load = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const ME = 'NwcyH-y1Q924YlQkAkn7nw';
const KILLER = 'qhOHzIODRKeJI7RYHVKqYQ';
const NOW = Date.parse('2026-10-30T00:00:00Z');
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const env = {} as Env;

const FIX: Record<string, string> = {
  [`/search?q=CalangoPeto`]: 'gameinfo-search.json',
  [`/players/${ME}`]: 'gameinfo-player.json',
  [`/players/${ME}/kills`]: 'gameinfo-kills.json',
  [`/players/${ME}/deaths`]: 'gameinfo-deaths.json',
  [`/players/${KILLER}`]: 'gameinfo-killer-player.json',
  [`/players/${KILLER}/kills`]: 'gameinfo-killer-kills.json',
  [`/players/${KILLER}/deaths`]: 'gameinfo-killer-deaths.json',
};

/** fetch falso: serve as fixtures pelo caminho; `fail` decide status por caminho. */
function stubFetch(fail: (path: string) => number | 'abort' | null = () => null) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/api/gameinfo', '') + url.search;
    calls.push(path);
    const f = fail(path);
    if (f === 'abort') throw new DOMException('aborted', 'AbortError');
    if (f) return new Response('<!DOCTYPE html>erro', { status: f });
    const file = FIX[path];
    if (!file) return new Response('not found', { status: 404 });
    return new Response(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

/** Preço fixo por item em Caerleon (qualidade 1..5, visto há 1 h), para valorar equipamento. */
function fakePrices(ids: string[], _c: unknown, qualities: number[]): PriceRow[] {
  const at = new Date(Date.now() - 3600_000).toISOString();
  return ids.flatMap((id) =>
    qualities.map((q) => ({ id, city: 'Caerleon' as const, quality: q as 1, sellMin: 1000 * q, sellMinAt: at, buyMax: null, buyMaxAt: null })),
  );
}

beforeEach(() => {
  _resetGameinfoMemory();
  vi.unstubAllGlobals();
  vi.mocked(aodpPrices).mockReset();
  vi.mocked(aodpPrices).mockImplementation(async (ids, c, q) => fakePrices(ids, c, q));
});

// ---------- família de arma ----------

describe('weapons', () => {
  it('mapeia ids reais com tier e encantamento', () => {
    expect(weaponBase('T6_2H_CLAYMORE@2')).toBe('2H_CLAYMORE');
    expect(weaponLabelPt('T6_MAIN_SWORD@2')).toBe('Espada');
    expect(weaponLabelPt('T4_2H_LONGBOW')).toBe('Arco');
    expect(weaponLabelPt('T5_MAIN_1HCROSSBOW@1')).toBe('Besta');
    expect(weaponLabelPt('T8_2H_CLAWPAIR@3')).toBe('Adaga');
    expect(weaponLabelPt('T4_2H_GLAIVE')).toBe('Lança');
    expect(weaponLabelPt('T4_2H_SCYTHE_HELL')).toBe('Machado');
    expect(weaponLabelPt('T5_MAIN_MACE@1')).toBe('Maça');
    expect(weaponLabelPt('T4_2H_RAM_KEEPER')).toBe('Martelo');
    expect(weaponLabelPt('T4_2H_TWINSCYTHE_HELL')).toBe('Bastão');
    expect(weaponLabelPt('T4_2H_FIRE_RINGPAIR_AVALON')).toBe('Cajado de fogo');
    expect(weaponLabelPt('T4_2H_ICEGAUNTLETS_HELL')).toBe('Cajado de gelo');
    expect(weaponLabelPt('T4_2H_ENIGMATICORB_MORGANA')).toBe('Cajado arcano');
    expect(weaponLabelPt('T4_2H_DIVINESTAFF')).toBe('Cajado sagrado');
    expect(weaponLabelPt('T4_2H_WILDSTAFF')).toBe('Cajado da natureza');
    expect(weaponLabelPt('T4_2H_SKULLORB_HELL')).toBe('Cajado amaldiçoado');
    expect(weaponLabelPt('T4_2H_KNUCKLES_SET3')).toBe('Manoplas');
    expect(weaponLabelPt('T4_2H_SHAPESHIFTER_SET1')).toBe('Metamorfo');
    expect(weaponLabelPt('T5_2H_TOOL_SICKLE')).toBe('Ferramenta de coleta');
    expect(weaponLabelPt('T4_BAG')).toBe('Outra');
    expect(weaponLabelPt(null)).toBe('Outra');
  });

  it('arma nova fora da tabela cai na regra por pedaço do nome', () => {
    expect(weaponFamily('T4_2H_FROSTSTAFF_NOVO')).toBe('froststaff');
    expect(weaponFamily('T4_MAIN_SWORD_NOVA')).toBe('sword');
  });

  it('toda arma do items.json tem família (pula se data-cache ausente)', () => {
    const p = new URL('../data-cache/items.json', import.meta.url);
    if (!existsSync(p)) return;
    const items = JSON.parse(readFileSync(p, 'utf8')) as { UniqueName?: string }[];
    const sem = new Set<string>();
    for (const it of items) {
      const u = it.UniqueName ?? '';
      if (!/^T\d+_(MAIN|2H)_/.test(u) || u.includes('TOOL_')) continue;
      if (weaponFamily(u) === 'other') sem.add(weaponBase(u));
    }
    expect([...sem]).toEqual([]);
  });

  it('famílias das armas reais nos eventos da fixture', () => {
    const kills = normalizeEvents(load('gameinfo-kills.json'));
    const fams = weaponsOf(ME, kills, []);
    expect(fams.length).toBeGreaterThan(0);
    expect(fams.every((w) => w.type !== 'other')).toBe(true);
    expect(fams.reduce((s, w) => s + w.count, 0)).toBe(kills.length);
  });
});

// ---------- normalização ----------

describe('normalização da gameinfo', () => {
  it('busca: mapeia e põe nome exato primeiro', () => {
    const hits = normalizeSearch(load('gameinfo-search.json'), 'calangopeto');
    expect(hits[0]).toEqual({ id: ME, name: 'CalangoPeto', guild: 'B A G R E', alliance: '', killFame: 2421977, deathFame: 3331676 });
    const raw = { players: [{ Id: 'a1', Name: 'CalangoPetoX' }, { Id: 'b2', Name: 'CalangoPeto' }, { Name: 'semId' }] };
    expect(normalizeSearch(raw, 'CalangoPeto').map((h) => h.id)).toEqual(['b2', 'a1']);
    expect(normalizeSearch({}, 'x')).toEqual([]);
  });

  it('jogador: PvE e coleta achatados com as chaves que o front rotula', () => {
    const p = normalizePlayer(load('gameinfo-player.json'));
    expect(p.pve.Total).toBe(53344786);
    expect(p.pve.Avalon).toBe(34942818);
    expect(p.gathering).toMatchObject({ All: 193743, Fiber: 107326, Hide: 27717, Fishing: 1960, Crafting: 375 });
  });

  it('eventos: ordem, equipamento, quantidade e tamanho real do grupo', () => {
    const deaths = normalizeEvents(load('gameinfo-deaths.json'));
    expect(deaths).toHaveLength(10);
    const d = deaths[0];
    expect(d.id).toBe(1328925237);
    expect(d.time).toBe('2026-01-09T04:26:16.407Z');
    expect(d.victim.name).toBe('CalangoPeto');
    expect(d.killer.name).toBe('Femures');
    expect(d.killer.ip).toBe(1008);
    expect(d.victim.gear.find((g) => g.slot === 'MainHand')).toEqual({ slot: 'MainHand', id: 'T5_2H_DUALSWORD@1', quality: 1, count: 1 });
    expect(d.victim.gear.find((g) => g.slot === 'Food')).toEqual({ slot: 'Food', id: 'T7_MEAL_PIE', quality: 1, count: 2 });
    // numberOfParticipants corta em 4; groupMemberCount 6/7 aparece no grupo
    const kills = normalizeEvents(load('gameinfo-kills.json'));
    const k0 = kills.find((e) => e.id === 1324702087) as SlimEvent;
    expect(k0.dealers).toBe(4);
    expect(k0.group).toBe(6);
    expect(() => normalizeEvents('<html>')).toThrow(GameinfoError);
  });
});

// ---------- estatística e perigo ----------

describe('estatística e perigo', () => {
  const kills = normalizeEvents(load('gameinfo-kills.json'));
  const deaths = normalizeEvents(load('gameinfo-deaths.json'));
  const kKills = normalizeEvents(load('gameinfo-killer-kills.json'));
  const kDeaths = normalizeEvents(load('gameinfo-killer-deaths.json'));

  it('separador de milhar pt-BR', () => {
    expect(fmtInt(1350)).toBe('1.350');
    expect(fmtFame(2421977)).toBe('2,4 mi');
    expect(fmtFame(52000)).toBe('52 mil');
  });

  it('razão sem Infinity', () => {
    expect(fameRatio(10, 0)).toBe(99);
    expect(fameRatio(0, 0)).toBe(0);
    expect(fameRatio(2421977, 3331676)).toBe(0.73);
  });

  it('solo, grupo médio e IP médio do personagem de teste', () => {
    const s = statsOf(ME, kills, deaths);
    // kills solo de verdade: 1 causou dano e grupo 1 (o "3/1" não conta)
    expect(s.soloRate).toBe(0.2);
    expect(s.avgGroup).toBeGreaterThan(2);
    expect(s.avgIp).toBeGreaterThan(800);
    expect(statsOf(ME, [], [])).toEqual({ soloRate: null, avgGroup: null, avgIp: null });
  });

  it('personagem parado há meses fica tranquilo e diz por quê', () => {
    const s = statsOf(ME, kills, deaths);
    const d = computeDanger({ killFame: 2421977, deathFame: 3331676, kills, deaths, ...s }, NOW);
    expect(d.label).toBe('tranquilo');
    expect(d.reasons.some((r) => r.startsWith('última kill há'))).toBe(true);
  });

  it('matador ativo, IP alto e fama alta fica perigoso', () => {
    const s = statsOf(KILLER, kKills, kDeaths);
    const d = computeDanger({ killFame: 207923518, deathFame: 332752230, kills: kKills, deaths: kDeaths, ...s }, NOW);
    expect(d.label).toBe('perigoso');
    expect(d.reasons).toContain('10 kills recentes (últimos 7 dias)');
    expect(d.reasons.some((r) => /^IP médio \d\.\d{3}$/.test(r))).toBe(true);
    expect(d.reasons.some((r) => r.includes('fama de abate muito alta'))).toBe(true);
  });

  it('ganker solo e grupo grande viram motivo', () => {
    const base = kKills[0];
    const solo = Array.from({ length: 6 }, (_, i) => ({ ...base, id: i, dealers: 1, group: 1, time: new Date(NOW - i * 3600_000).toISOString() }));
    const d = computeDanger({ killFame: 20e6, deathFame: 2e6, kills: solo, deaths: [], soloRate: 1, avgGroup: 1, avgIp: 1350 }, NOW);
    expect(d.reasons).toContain('mata sozinho com IP alto (100% das kills)');
    expect(d.reasons).toContain('mata 10× mais do que morre');
    const g = computeDanger({ killFame: 1e5, deathFame: 1e5, kills: solo, deaths: [], soloRate: 0, avgGroup: 6.2, avgIp: 1000 }, NOW);
    expect(g.reasons).toContain('anda em grupo de 6');
  });

  it('sem nada no killboard → sem dado', () => {
    expect(computeDanger({ killFame: 0, deathFame: 0, kills: [], deaths: [], soloRate: null, avgGroup: null, avgIp: null }).label).toBe('sem dado');
  });
});

// ---------- preço e recompra ----------

describe('preço do equipamento', () => {
  const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
  const row = (id: string, city: PriceRow['city'], quality: number, sellMin: number | null, minAgo: number): PriceRow =>
    ({ id, city, quality: quality as 1, sellMin, sellMinAt: sellMin ? at(minAgo) : null, buyMax: null, buyMaxAt: null });

  it('prefere preço recente; aceita velho se só houver ele; respeita qualidade mínima', () => {
    const rows = [row('X', 'Caerleon', 1, 500, 10 * 24 * 60), row('X', 'Martlock', 1, 900, 60), row('X', 'Lymhurst', 3, 700, 30)];
    expect(pickCheapest(rows, 'X', 1, NOW)).toMatchObject({ city: 'Lymhurst', price: 700 });
    expect(pickCheapest(rows, 'X', 4, NOW)).toBeNull();
    expect(pickCheapest([row('Y', 'Caerleon', 1, 500, 10 * 24 * 60)], 'Y', 1, NOW)).toMatchObject({ price: 500 });
    expect(pickCheapest([row('Z', 'Caerleon', 1, null, 0)], 'Z', 1, NOW)).toBeNull();
  });

  it('valor do set multiplica comida/poção pela quantidade; sem preço → null', () => {
    const gear = [{ slot: 'MainHand', id: 'A', quality: 1, count: 1 }, { slot: 'Food', id: 'F', quality: 1, count: 3 }];
    expect(gearValue(gear, [row('A', 'Caerleon', 1, 1000, 5), row('F', 'Caerleon', 1, 100, 5)], NOW)).toBe(1300);
    expect(gearValue(gear, [], NOW)).toBeNull();
  });

  it('recompra por espaço, cidade mais barata, idade e total', () => {
    const gear = [{ slot: 'Head', id: 'H', quality: 2, count: 1 }, { slot: 'Potion', id: 'P', quality: 1, count: 2 }, { slot: 'Cape', id: 'C', quality: 1, count: 1 }];
    const rows = [row('H', 'Caerleon', 1, 100, 5), row('H', 'Thetford', 2, 300, 120), row('P', 'Bridgewatch', 1, 50, 5)];
    const { rebuy, rebuyTotal } = buildRebuy(gear, rows, NOW);
    expect(rebuy[0]).toEqual({ id: 'H', slot: 'Head', quality: 2, cheapestCity: 'Thetford', price: 300, ageMin: 120, count: 1 });
    expect(rebuy[1]).toMatchObject({ price: 100, count: 2 });
    expect(rebuy[2]).toMatchObject({ cheapestCity: null, price: null, ageMin: null });
    expect(rebuyTotal).toBe(400);
  });

  it('lote de ids cabe numa URL só', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `T8_2H_DOUBLEBLADEDSTAFF_CRYSTAL@${i % 4}_${i}`);
    const cut = idsForOneCall(ids);
    expect(cut.length).toBeLessThan(400);
    expect(cut.join(',').length).toBeLessThanOrEqual(3400);
    expect(idsForOneCall(['A', 'A', 'B'])).toEqual(['A', 'B']);
  });
});

// ---------- lições ----------

describe('lições da autópsia', () => {
  const deaths = normalizeEvents(load('gameinfo-deaths.json'));

  it('morte real: 3 a 5 frases, grupo de 2, sem poção e coletando', () => {
    const l = buildLessons({ death: deaths[0], killerDanger: null, killerBasic: false, setValue: 300_000 });
    expect(l.length).toBeGreaterThanOrEqual(3);
    expect(l.length).toBeLessThanOrEqual(5);
    expect(l).toContain('Foram 2 contra você: quando vir mais de um inimigo chegando junto, saia cedo.');
    expect(l.some((s) => s.startsWith('Sem poção no set'))).toBe(true);
    expect(l.some((s) => s.startsWith('Você morreu coletando'))).toBe(true);
  });

  it('IP bem maior, grupo grande, ganker conhecido e set caro', () => {
    const d = deaths[0];
    const ev: SlimEvent = { ...d, group: 6, killer: { ...d.killer, ip: 1350 }, victim: { ...d.victim, ip: 1100, gear: [] } };
    const l = buildLessons({ death: ev, killerDanger: { score: 80, label: 'perigoso', reasons: [] }, killerBasic: false, setValue: 2_345_000 });
    expect(l[0]).toBe('Ele estava com IP bem maior (1.350 contra 1.100); evite trocar com builds desse nível.');
    expect(l[1]).toBe('Foi um grupo de 6: em zona vermelha ou preta, ande com escolta ou evite o horário de pico.');
    expect(l[2]).toBe('Esse jogador mata com frequência: evite a área dele.');
    expect(l).toContain('Você estava sem montaria: sem ela, fugir fica quase impossível.');
    expect(l).toHaveLength(5);
  });

  it('completa até 3 com frases gerais', () => {
    const d = deaths[0];
    const full = ['Mount', 'Potion', 'Food'].map((slot) => ({ slot, id: 'T4_X', quality: 1, count: 1 }));
    const ev: SlimEvent = { ...d, group: 1, dealers: 1, killer: { ...d.killer, ip: 1000, gear: [] }, victim: { ...d.victim, ip: 1000, gear: full } };
    const l = buildLessons({ death: ev, killerDanger: { score: 10, label: 'tranquilo', reasons: [] }, killerBasic: false, setValue: null });
    expect(l).toHaveLength(3);
    expect(l[0]).toBe('Confira o dossiê do matador antes de voltar para a mesma área.');
  });
});

// ---------- cliente da gameinfo ----------

describe('gameinfoFetch', () => {
  it('nova tentativa em 502 e devolve o JSON', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? new Response('x', { status: 502 }) : Response.json([1]))));
    const b = new Budget(6);
    expect(await gameinfoFetch('/x', { budget: b })).toEqual([1]);
    expect(b.used).toBe(2);
  });

  it('timeout de verdade (AbortController) duas vezes → erro timeout', async () => {
    const fn = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fn);
    await expect(gameinfoFetch('/x', { timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('404 não tenta de novo; HTML com 200 vira upstream; orçamento esgotado não chama a rede', async () => {
    const fn = vi.fn(async () => new Response('nf', { status: 404 }));
    vi.stubGlobal('fetch', fn);
    await expect(gameinfoFetch('/x')).rejects.toMatchObject({ kind: 'not_found' });
    expect(fn).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html>', { status: 200 })));
    await expect(gameinfoFetch('/x', { retry: false })).rejects.toMatchObject({ kind: 'upstream' });
    const none = vi.fn();
    vi.stubGlobal('fetch', none);
    await expect(gameinfoFetch('/x', { budget: new Budget(0) })).rejects.toMatchObject({ kind: 'budget' });
    expect(none).not.toHaveBeenCalled();
  });
});

// ---------- dossiê, autópsia e rotas ----------

describe('dossiê e autópsia com fixtures', () => {
  it('dossiê: 3 idas à gameinfo + 1 ao AODP (≤ 6), valores e contrato', async () => {
    const calls = stubFetch();
    const d = await getDossier(env, ctx, ME);
    expect(calls).toHaveLength(3);
    expect(aodpPrices).toHaveBeenCalledTimes(1);
    const [ids, cities, q] = vi.mocked(aodpPrices).mock.calls[0];
    expect(cities).toEqual(['Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Caerleon']);
    expect(q).toEqual([1]);
    expect(ids).toContain('T5_2H_DUALSWORD@1');
    expect(new Set(ids).size).toBe(ids.length);
    expect(d).toMatchObject({ id: ME, name: 'CalangoPeto', guild: 'B A G R E', killFame: 2421977, ratio: 0.73 });
    expect(d.recentKills).toHaveLength(10);
    expect(d.recentDeaths).toHaveLength(10);
    expect(d.recentDeaths[0].estValue).toBeGreaterThan(0);
    expect(d.recentKills[0].participants).toBe(6);
    expect(d.weapons.length).toBeGreaterThan(0);
    expect(['tranquilo', 'atenção', 'perigoso']).toContain(d.danger.label);
    expect(Number.isFinite(Date.parse(d.fetchedAt))).toBe(true);
    // segunda chamada no mesmo isolate: memória, sem rede
    await getDossier(env, ctx, ME);
    expect(calls).toHaveLength(3);
  });

  it('dossiê: três novas tentativas na gameinfo ainda deixam 1 subrequest para o AODP', async () => {
    const seen = new Map<string, number>();
    // primeira tentativa de cada rota dá 502, a segunda funciona
    stubFetch((p) => {
      const n = (seen.get(p) ?? 0) + 1;
      seen.set(p, n);
      return n === 1 ? 502 : null;
    });
    const d = await getDossier(env, ctx, ME);
    expect(aodpPrices).toHaveBeenCalledTimes(1);
    expect(d.recentDeaths[0].estValue).toBeGreaterThan(0);
  });

  it('dossiê aguenta AODP fora (estValue null) e kills fora (motivo)', async () => {
    stubFetch((p) => (p.endsWith('/kills') ? 502 : null));
    vi.mocked(aodpPrices).mockRejectedValue(new Error('429'));
    const d = await getDossier(env, ctx, ME);
    expect(d.recentKills).toEqual([]);
    expect(d.recentDeaths.every((e) => e.estValue === null)).toBe(true);
    expect(d.danger.reasons).toContain('parte do histórico não carregou agora');
  });

  it('autópsia: última morte, dossiê do matador, lições, recompra numa chamada só', async () => {
    const calls = stubFetch();
    const a = await getAutopsy(env, ctx, ME);
    expect(a.death?.id).toBe(1328925237);
    expect(a.killerDossier?.name).toBe('Femures');
    expect(a.killerDossier?.recentKills).toHaveLength(10);
    expect(a.lessons.length).toBeGreaterThanOrEqual(3);
    expect(a.lessons.length).toBeLessThanOrEqual(5);
    const gear = a.death?.victim.gear ?? [];
    expect(a.rebuy.map((r) => r.slot)).toEqual(gear.map((g) => g.slot));
    // fakePrices: preço = 1000 × qualidade; a mais barata aceitável é a própria qualidade da peça
    const head = a.rebuy.find((r) => r.slot === 'Head');
    expect(head).toMatchObject({ quality: 2, price: 2000, cheapestCity: 'Caerleon' });
    expect(a.rebuyTotal).toBe(a.rebuy.reduce((s, r) => s + (r.price ?? 0), 0));
    // "Valor estimado" da morte usa a régua do dossiê (qualidade 1 = 1000 por peça × quantidade), não a recompra
    expect(a.death?.estValue).toBe(a.rebuy.reduce((s, r) => s + 1000 * (r.count ?? 1), 0));
    expect(a.death?.estValue).toBeLessThan(a.rebuyTotal!);
    expect(calls).toHaveLength(4); // mortes da vítima + 3 do matador
    expect(aodpPrices).toHaveBeenCalledTimes(2); // recompra + dossiê do matador
  });

  it('autópsia com o matador fora do ar devolve o básico e avisa', async () => {
    stubFetch((p) => (p.includes(KILLER) ? 502 : null));
    const a = await getAutopsy(env, ctx, ME);
    expect(a.killerDossier).toMatchObject({ name: 'Femures', danger: { label: 'sem dado' } });
    expect(a.lessons).toContain('Não deu para carregar o histórico do matador agora; abra o dossiê dele daqui a pouco.');
  });

  it('gameinfo cai depois de um acerto: devolve a reserva da Cache API com a data antiga', async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal('caches', {
      default: {
        async match(k: string) { return store.get(String(k))?.clone(); },
        async put(k: string, r: Response) { store.set(String(k), r.clone()); },
      },
    });
    stubFetch();
    const first = await getDossier(env, ctx, ME);
    expect(store.size).toBe(3);
    // envelhece as entradas além do TTL e derruba a fonte
    for (const [k, r] of store) {
      const h = new Headers(r.headers);
      h.set('x-guarita-at', new Date(Date.now() - 3600_000).toISOString());
      store.set(k, new Response(await r.text(), { headers: h }));
    }
    _resetGameinfoMemory();
    stubFetch(() => 502);
    const second = await getDossier(env, ctx, ME);
    expect(second.recentKills).toHaveLength(first.recentKills.length);
    expect(Date.parse(second.fetchedAt)).toBeLessThan(Date.now() - 3000_000);
  });

  it('autópsia de quem nunca morreu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    expect(await getAutopsy(env, ctx, 'semMortes123')).toEqual({ death: null, killerDossier: null, lessons: [], rebuy: [], rebuyTotal: null });
  });
});

describe('routePlayer', () => {
  const call = (path: string, method = 'GET') => {
    const url = new URL('https://guarita.pages.dev' + path);
    return routePlayer(new Request(url, { method }), url, env, ctx);
  };

  it('ignora rota de outro módulo', async () => {
    expect(await call('/api/prices?ids=X')).toBeNull();
    expect(await call('/api/players')).toBeNull();
  });

  it('busca: q curto 400, ok 200 com cache público', async () => {
    stubFetch();
    const r400 = await call('/api/player/search?q=ab');
    expect(r400?.status).toBe(400);
    expect(r400?.headers.get('Cache-Control')).toBe('no-store');
    const ok = await call('/api/player/search?q=CalangoPeto');
    expect(ok?.status).toBe(200);
    expect(ok?.headers.get('Cache-Control')).toBe('public, max-age=120');
    expect(((await ok?.json()) as { players: unknown[] }).players).toHaveLength(1);
  });

  it('id inválido 400, inexistente 404 em PT-BR, método errado 405', async () => {
    stubFetch();
    expect((await call('/api/player/a%20b'))?.status).toBe(400);
    const nf = await call('/api/player/naoExiste123');
    expect(nf?.status).toBe(404);
    expect(await nf?.json()).toEqual({ error: MSG_NOT_FOUND });
    expect((await call('/api/player/' + ME, 'POST'))?.status).toBe(405);
    expect((await call('/api/player/' + ME + '/outra'))?.status).toBe(404);
  });

  it('gameinfo fora → 502, lenta → 504, com a mensagem combinada', async () => {
    stubFetch(() => 502);
    const r502 = await call('/api/player/' + ME);
    expect(r502?.status).toBe(502);
    expect(await r502?.json()).toEqual({ error: MSG_GAMEINFO_DOWN });
    _resetGameinfoMemory();
    stubFetch(() => 'abort');
    const r504 = await call('/api/player/' + ME + '/autopsy');
    expect(r504?.status).toBe(504);
    expect(await r504?.json()).toEqual({ error: MSG_GAMEINFO_DOWN });
  });

  it('dossiê e autópsia 200', async () => {
    stubFetch();
    const d = await call('/api/player/' + ME);
    expect(d?.status).toBe(200);
    const a = await call('/api/player/' + ME + '/autopsy/');
    expect(a?.status).toBe(200);
    expect(((await a?.json()) as { death: { id: number } }).death.id).toBe(1328925237);
  });
});
