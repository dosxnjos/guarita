import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterFestivities, getClock, normalizeStatus, parseStatusText, routeClock, summarizeGold } from '../worker/api/clock';
import { festivityLabel, festivityLabelEs, festivityLabelPt, readableName } from '../shared/festivities';
import { normalizeFestivities, normalizeGold } from '../worker/lib/aodp';
import type { Env } from '../worker/env';
import { aodpFixtureRoute, fixture, mockCaches, mockFetch } from './helpers/net';

// a fixture foi capturada em 30/10/2026 02:09 UTC
const NOW = Date.parse('2026-10-30T02:30:00Z');
const env = {} as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('rótulos das festividades', () => {
  it('os quatro tipos da fixture real', () => {
    const labels = normalizeFestivities(fixture('festivities.json')).map((f) => festivityLabelPt(f.kind, f.category, f.name));
    expect(labels).toEqual(['Halloween 2026', 'Pontos de facção em dobro', 'Bônus de produção: bestas comuns', 'Bônus de produção: armaduras de couro comuns']);
  });
  it('desconhecidos viram rótulo legível', () => {
    expect(festivityLabelPt(1, 'ACTIVITIES', 'MISTS_WISPS')).toBe('Bônus de atividade: mists wisps');
    expect(festivityLabelPt(2, 'GENERAL', 'COMMON_SPACESHIP')).toBe('Bônus: common spaceship');
    expect(festivityLabelPt(2, 'GENERAL', 'PLATE_HELMET')).toBe('Bônus de produção: elmos de placa');
    expect(festivityLabelPt(0, '', 'LUNARNEWYEAR2027')).toBe('Ano Novo Lunar 2027');
    expect(festivityLabelPt(0, '', 'SOMETHING_NEW')).toBe('Something new');
    expect(readableName('COMMON_LEATHER_ARMOR')).toBe('Common leather armor');
  });
  it('espanhol: os quatro tipos da fixture e os desconhecidos, sem português', () => {
    const labels = normalizeFestivities(fixture('festivities.json')).map((f) => festivityLabelEs(f.kind, f.category, f.name));
    expect(labels).toEqual(['Halloween 2026', 'Puntos de facción dobles', 'Bonificación de producción: ballestas comunes', 'Bonificación de producción: chaquetas de cuero comunes']);
    expect(festivityLabelEs(1, 'ACTIVITIES', 'MISTS_WISPS')).toBe('Bonificación de actividad: mists wisps');
    expect(festivityLabelEs(2, 'GENERAL', 'COMMON_SPACESHIP')).toBe('Bonificación: common spaceship');
    expect(festivityLabelEs(2, 'GENERAL', 'PLATE_HELMET')).toBe('Bonificación de producción: cascos de placas');
    expect(festivityLabelEs(2, 'GENERAL', 'RARE_SWORD')).toBe('Bonificación de producción: espadas raras');
    expect(festivityLabelEs(2, 'GENERAL', 'AVALONIAN_HAMMER')).toBe('Bonificación de producción: martillos avalonianos');
    expect(festivityLabelEs(0, '', 'LUNARNEWYEAR2027')).toBe('Año Nuevo Lunar 2027');
    expect(festivityLabelEs(2, 'GENERAL', 'SHAPESHIFTER')).toBe('Bonificación de producción: bastones cambiaformas');
    expect(festivityLabelEs(2, 'GENERAL', 'KNUCKLES')).toBe('Bonificación de producción: guantes');
    const f = { kind: 2, category: 'GENERAL', name: 'COMMON_CROSSBOW', labelPt: 'Bônus de produção: bestas comuns' };
    expect(festivityLabel(f, 'pt')).toBe('Bônus de produção: bestas comuns');
    expect(festivityLabel(f, 'es')).toBe('Bonificación de producción: ballestas comunes');
  });
});

describe('janela das festividades', () => {
  const raw = normalizeFestivities(fixture('festivities.json'));
  it('na hora da captura as quatro estão ativas', () => {
    expect(filterFestivities(raw, NOW)).toHaveLength(4);
  });
  it('acabadas saem; futuras só se começam em até 48 h', () => {
    const ev = [
      { kind: 1, category: 'ACTIVITIES', name: 'A', start: '2026-10-28T00:00:00Z', end: '2026-10-29T00:00:00Z' }, // acabou
      { kind: 1, category: 'ACTIVITIES', name: 'B', start: '2026-10-31T00:00:00Z', end: '2026-11-01T00:00:00Z' }, // em 21,5 h
      { kind: 1, category: 'ACTIVITIES', name: 'C', start: '2026-11-05T00:00:00Z', end: '2026-11-06T00:00:00Z' }, // longe
    ];
    expect(filterFestivities(ev, NOW).map((f) => f.name)).toEqual(['B']);
  });
});

describe('ouro', () => {
  it('resumo da fixture real', () => {
    const g = summarizeGold(normalizeGold(fixture('gold.json')));
    expect(g.price).toBe(8930);
    expect(g.at).toBe('2026-10-30T01:00:00Z');
    expect(g.p30).toBeGreaterThan(7000);
    expect(['subindo', 'caindo', 'estável']).toContain(g.trend);
  });
  it('tendência com faixa de 1%', () => {
    const mk = (recent: number, older: number) =>
      Array.from({ length: 168 }, (_, i) => ({ price: i < 24 ? recent : older, at: new Date(NOW - i * 3600_000).toISOString() }));
    expect(summarizeGold(mk(1100, 1000)).trend).toBe('subindo');
    expect(summarizeGold(mk(900, 1000)).trend).toBe('caindo');
    expect(summarizeGold(mk(1005, 1000)).trend).toBe('estável');
  });
  it('vazio e pouco dado', () => {
    expect(summarizeGold([])).toEqual({ price: null, at: null, p30: null, trend: 'sem dado' });
    expect(summarizeGold([{ price: 9000, at: '2026-10-30T00:00:00Z' }]).trend).toBe('sem dado');
  });
});

describe('status do servidor', () => {
  it('normaliza', () => {
    expect(normalizeStatus(parseStatusText('﻿{ "status" : "online", "message" : "Server is online." }')).status).toBe('online');
    expect(normalizeStatus({ status: 'offline', message: 'Server is offline.' }).status).toBe('offline');
    expect(normalizeStatus({ status: 'offline', message: 'Server is currently under maintenance.' }).status).toBe('manutenção');
    expect(normalizeStatus({ status: 'starting' }).status).toBe('desconhecido');
    expect(normalizeStatus(null).status).toBe('desconhecido');
  });
});

describe('getClock', () => {
  it('junta tudo com dado real', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockCaches();
    mockFetch(aodpFixtureRoute);
    const c = await getClock(env, ctx);
    expect(c.server.status).toBe('online');
    expect(c.festivities).toHaveLength(4);
    expect(c.gold.price).toBe(8930);
    expect(c.premiumSilver).toBe(3750 * 8930);
    expect(c.season.approx).toBe(true);
  });

  it('fontes fora do ar: responde mesmo assim', async () => {
    mockCaches();
    mockFetch(() => new Response('erro', { status: 502 }));
    const c = await getClock(env, ctx);
    expect(c.server.status).toBe('desconhecido');
    expect(c.festivities).toEqual([]);
    expect(c.gold.trend).toBe('sem dado');
    expect(c.premiumSilver).toBeNull();
  });

  it('rota com Cache-Control de 120 s', async () => {
    mockCaches();
    mockFetch(aodpFixtureRoute);
    const req = new Request('https://guarita.pages.dev/api/clock');
    const res = (await routeClock(req, new URL(req.url), env, ctx))!;
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120');
    const other = new Request('https://guarita.pages.dev/api/prices');
    expect(await routeClock(other, new URL(other.url), env, ctx)).toBeNull();
  });
});
