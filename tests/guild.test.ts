// Módulo (a) da Fase 2: página da guilda. Normalizadores com respostas reais da gameinfo (30/10/2026, guilda de
// teste "B A G R E"), montagem do resumo e getGuild com KillLog e gameinfo falsos.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../worker/env';
import {
  buildGuildSummary,
  foldWeapons,
  getGuild,
  handleLossesGuild,
  hours24,
  isEmptyGuild,
  normalizeGuildInfo,
  normalizeGuildSearch,
  pickGuild,
  type CoreGuildSummary,
} from '../worker/api/insightsA';
import { guildHref, guildQuery, guildTotals, hourBands, hoursAria, lastDays, peakHours } from '../src/lib/insights/format';
import { fixture, jsonRes, mockFetch } from './helpers/net';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

// Busca aproximada real: "bagre" devolve várias guildas parecidas.
const FUZZY = {
  guilds: [
    { Id: '7T7xuU7zRTKdzPzr1BQfrg', Name: 'Bagre', AllianceId: '', AllianceName: '', KillFame: null, DeathFame: 4426385 },
    { Id: 'lGc1Av2OS0qNVq481VWKHQ', Name: 'BAGRECITOS', AllianceId: '', AllianceName: '', KillFame: null, DeathFame: 49728 },
    { Id: 'XN2QLd0yQ9SeLn-zHThQAg', Name: 'Bagres', AllianceId: '', AllianceName: '', KillFame: null, DeathFame: 869017 },
  ],
  players: [],
};

function coreSummary(guild: string, patch: Partial<CoreGuildSummary> = {}): CoreGuildSummary {
  return {
    guild,
    days: [
      { day: '2026-10-29', kills: 3, deaths: 1 },
      { day: '2026-10-30', kills: 5, deaths: 4 },
    ],
    totals: { kills: 8, deaths: 5 },
    detail: {
      windowDays: 7,
      kills: 8,
      deaths: 5,
      topKillers: [{ id: 'NwcyH-y1Q924YlQkAkn7nw', name: 'CalangoPeto', kills: 6 }, { id: 'x2', name: 'Outro', kills: 2 }],
      weapons: [
        { type: 'T6_2H_CLAYMORE@2', count: 4 },
        { type: 'T5_MAIN_SWORD', count: 2 },
        { type: 'T7_2H_HOLYSTAFF', count: 3 },
        { type: 'T4_OFF_SHIELD', count: 9 },
      ],
      hoursBrt: Array.from({ length: 24 }, (_, i) => (i === 21 ? 5 : i === 9 ? 3 : 0)),
      coverageSince: '2026-10-30',
    },
    ...patch,
  };
}

function env(core: (path: string) => Response): Env & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    CORE: {
      async fetch(req: Request) {
        const u = new URL(req.url);
        calls.push(decodeURIComponent(u.pathname) + u.search);
        return core(decodeURIComponent(u.pathname));
      },
    },
  } as unknown as Env & { calls: string[] };
}

afterEach(() => vi.unstubAllGlobals());

describe('normalizadores da gameinfo', () => {
  it('busca: guilds[] enxuto; aliança vazia vira null', () => {
    const hits = normalizeGuildSearch(fixture('gameinfo-guild-search.json'));
    expect(hits).toEqual([{ id: 'M8buKnpDS2yL7Eh2A2CTsw', name: 'B A G R E', alliance: null, deathFame: 108797350 }]);
    expect(normalizeGuildSearch(null)).toEqual([]);
    expect(normalizeGuildSearch({ guilds: 'x' })).toEqual([]);
  });

  it('/guilds/{id}: killFame minúsculo, MemberCount, AllianceName null com tag vazia', () => {
    expect(normalizeGuildInfo(fixture('gameinfo-guild.json'))).toEqual({
      id: 'M8buKnpDS2yL7Eh2A2CTsw',
      name: 'B A G R E',
      alliance: null,
      members: 10,
      killFame: 111486318,
      deathFame: 108797350,
    });
    expect(normalizeGuildInfo({ Id: 'a', Name: 'X', AllianceName: null, AllianceTag: 'TAG' }).alliance).toBe('TAG');
    expect(() => normalizeGuildInfo({})).toThrow();
  });

  it('pickGuild só aceita o nome igual (sem diferença de maiúsculas), nunca o primeiro resultado', () => {
    const hits = normalizeGuildSearch(FUZZY);
    expect(pickGuild(hits, 'bagre')?.id).toBe('7T7xuU7zRTKdzPzr1BQfrg');
    expect(pickGuild(hits, 'BAGRES')?.name).toBe('Bagres');
    expect(pickGuild(hits, 'bagr')).toBeNull();
    expect(pickGuild(hits, 'Bagreros')).toBeNull();
  });
});

describe('montagem do resumo', () => {
  it('foldWeapons soma por família, ícone da arma mais usada, "Outra" no fim', () => {
    const w = foldWeapons(coreSummary('X').detail!.weapons);
    expect(w[0]).toEqual({ type: 'T6_2H_CLAYMORE@2', labelPt: 'Espada', count: 6 });
    expect(w[1]).toEqual({ type: 'T7_2H_HOLYSTAFF', labelPt: 'Cajado sagrado', count: 3 });
    expect(w[w.length - 1].labelPt).toBe('Outra');
  });

  it('hours24 sempre devolve 24 inteiros não negativos', () => {
    expect(hours24(undefined)).toHaveLength(24);
    expect(hours24([1, -2, 'x', 2.6]).slice(0, 4)).toEqual([1, 0, 0, 3]);
  });

  it('buildGuildSummary junta gameinfo e KillLog no formato do contrato', () => {
    const info = normalizeGuildInfo(fixture('gameinfo-guild.json'));
    const s = buildGuildSummary('b a g r e', coreSummary('B A G R E'), info, '2026-10-30T12:00:00.000Z');
    expect(s.name).toBe('B A G R E');
    expect(s.id).toBe('M8buKnpDS2yL7Eh2A2CTsw');
    expect(s.members).toBe(10);
    expect(s.days).toEqual([
      { date: '2026-10-29', kills: 3, deaths: 1 },
      { date: '2026-10-30', kills: 5, deaths: 4 },
    ]);
    expect(s.topKillers[0]).toEqual({ name: 'CalangoPeto', id: 'NwcyH-y1Q924YlQkAkn7nw', kills: 6 });
    expect(s.hoursBrt[21]).toBe(5);
    expect(s.coverageSince).toBe('2026-10-30');
  });

  it('sem gameinfo: campos da gameinfo null, nome do KillLog', () => {
    const s = buildGuildSummary('alfa', coreSummary('Alfa'), null, 'x');
    expect(s).toMatchObject({ name: 'Alfa', id: null, members: null, killFame: null, alliance: null });
    expect(isEmptyGuild(null)).toBe(true);
    expect(isEmptyGuild(coreSummary('A', { days: [], detail: undefined }))).toBe(true);
    expect(isEmptyGuild(coreSummary('A'))).toBe(false);
  });
});

describe('getGuild', () => {
  const gameinfoOk = (url: string) => {
    if (url.includes('/search?')) return jsonRes(fixture('gameinfo-guild-search.json'));
    if (url.includes('/guilds/M8buKnpDS2yL7Eh2A2CTsw')) return jsonRes(fixture('gameinfo-guild.json'));
    return new Response('?', { status: 404 });
  };

  it('nome digitado em minúsculas: usa o nome canônico no KillLog', async () => {
    mockFetch(gameinfoOk);
    const e = env((p) => (p.includes('/guild/B A G R E/') ? Response.json(coreSummary('B A G R E')) : Response.json({ guild: 'x', days: [] })));
    const s = await getGuild(e, ctx, 'b a g r e');
    expect(s.name).toBe('B A G R E');
    expect(s.members).toBe(10);
    expect(s.killFame).toBe(111486318);
    expect(s.days).toHaveLength(2);
    expect(e.calls.some((c) => c.includes('/guild/B A G R E/summary?detail=1'))).toBe(true);
  });

  it('gameinfo fora: devolve o histórico da Guarita mesmo assim', async () => {
    mockFetch(() => new Response('erro', { status: 502 }));
    const e = env(() => Response.json(coreSummary('B A G R E')));
    const s = await getGuild(e, ctx, 'B A G R E');
    expect(s.id).toBeNull();
    expect(s.topKillers).toHaveLength(2);
  });

  it('KillLog fora com a gameinfo de pé: 502 (não finge "sem kills na amostra")', async () => {
    mockFetch(gameinfoOk);
    const e = env(() => new Response('erro', { status: 500 }));
    const u = new URL('https://x/api/guild/B%20A%20G%20R%20E');
    const r = await handleLossesGuild(new Request(u), u, e, ctx);
    expect(r!.status).toBe(502);
    expect(((await r!.json()) as { error: string }).error).toMatch(/histórico do killboard/);
  });

  it('gameinfo fora e KillLog vazio: erro da gameinfo (502), não 404', async () => {
    mockFetch(() => new Response('erro', { status: 503 }));
    const e = env(() => Response.json({ guild: 'Nada', days: [] }));
    const u = new URL('https://x/api/guild/Nada');
    const r = await handleLossesGuild(new Request(u), u, e, ctx);
    expect(r!.status).toBe(502);
  });

  it('rota: guilda que não existe em lugar nenhum → 404 com mensagem', async () => {
    mockFetch(() => jsonRes({ guilds: [], players: [] }));
    const e = env(() => Response.json({ guild: 'Nada', days: [], detail: { kills: 0, deaths: 0, topKillers: [], weapons: [], hoursBrt: [] } }));
    const u = new URL('https://x/api/guild/Nada%20Aqui');
    const r = await handleLossesGuild(new Request(u), u, e, ctx);
    expect(r!.status).toBe(404);
    expect(((await r!.json()) as { error: string }).error).toMatch(/não encontrada/);
  });

  it('rota: nome inválido → 400; busca curta → 400; busca devolve guilds', async () => {
    const e = env(() => Response.json({}));
    const long = new URL('https://x/api/guild/' + 'a'.repeat(70));
    expect((await handleLossesGuild(new Request(long), long, e, ctx))!.status).toBe(400);
    const short = new URL('https://x/api/guilds?q=ab');
    expect((await handleLossesGuild(new Request(short), short, e, ctx))!.status).toBe(400);
    mockFetch(gameinfoOk);
    const q = new URL('https://x/api/guilds?q=B%20A%20G%20R%20E');
    const r = await handleLossesGuild(new Request(q), q, e, ctx);
    expect(r!.status).toBe(200);
    expect(((await r!.json()) as { guilds: { name: string }[] }).guilds[0].name).toBe('B A G R E');
  });
});

describe('telas da guilda', () => {
  it('pico, faixas e descrição das horas', () => {
    const h = Array.from({ length: 24 }, (_, i) => (i === 21 ? 5 : i === 9 ? 3 : 0));
    expect(peakHours(h)).toEqual([21]);
    expect(peakHours(Array(24).fill(0))).toEqual([]);
    expect(hourBands(h).map((b) => b.total)).toEqual([0, 3, 0, 5]);
    expect(hoursAria(h)).toBe('Kills por hora em Brasília: 8 no total; pico às 21h.');
    expect(hoursAria(Array(24).fill(0))).toBe('Sem kills registradas por hora.');
  });

  it('últimos dias em ordem, totais e razão', () => {
    const days = [
      { date: '2026-10-30', kills: 5, deaths: 4 },
      { date: '2026-10-28', kills: 1, deaths: 0 },
      { date: '2026-10-29', kills: 3, deaths: 1 },
    ];
    const v = lastDays(days, 2);
    expect(v.rows.map((d) => d.date)).toEqual(['2026-10-29', '2026-10-30']);
    expect(v.max).toBe(5);
    expect(guildTotals(days)).toEqual({ kills: 9, deaths: 5, ratio: 9 / 5 });
    expect(guildTotals([]).ratio).toBeNull();
  });

  it('endereço e validação do nome', () => {
    expect(guildHref(' B A G R E ')).toBe('/guilda/B%20A%20G%20R%20E');
    expect(guildQuery('  ab ')).toEqual({ q: 'ab', ok: false });
    expect(guildQuery('B A G R E')).toEqual({ q: 'B A G R E', ok: true });
  });
});
