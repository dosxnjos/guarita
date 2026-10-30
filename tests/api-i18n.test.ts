// Rodada 3 (espanhol no que sobrou): textos que a API monta em espanhol com `?lang=es` e o português idêntico ao de
// antes. Cobre o dossiê (motivos do perigo), a autópsia (lições), o selo de confiança, as zonas do "arriscar", as
// festividades do relógio, os nomes nas perdas, os erros das rotas e o cliente do site (src/lib/api.ts).
// Regra de custo: o dado bruto em cache é o mesmo nas duas línguas, então pedir em espanhol depois do português não
// gasta subrequest nenhum (gameinfo, AODP, KillLog).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NODE_FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(p: URL, enc: 'utf8'): string };

import type { Env } from '../worker/env';
import type { PriceRow } from '../shared/types';

// Só o preço do equipamento do dossiê é falso (como em tests/player.test.ts); o resto do aodp.ts é o de verdade.
vi.mock('../worker/lib/aodp', async (orig) => ({ ...(await orig<typeof import('../worker/lib/aodp')>()), aodpPrices: vi.fn() }));

import { aodpPrices, AodpError } from '../worker/lib/aodp';
import { _resetGameinfoMemory } from '../worker/lib/gameinfo';
import { apiLang, fmtFameL, fmtIntL } from '../shared/lang';
import {
  basicDossier, buildLessons, computeDanger, getAutopsy, getDossier, routePlayer, type DangerInput, type SlimEvent, type SlimSide,
} from '../worker/api/player';
import { CONFIDENCE_REASONS_ES, ageLabel, confidence } from '../shared/confidence';
import { ageLabelEs } from '../worker/api/hoje';
import { ZONE_RULES, ZONE_TEXT_ES, zoneTextFor, zonesFor } from '../shared/zones';
import { ZONE_TEXT_ES as ZONE_TEXT_ES_FRONT, zoneText } from '../src/lib/novato/arriscar';
import { QUALITY_LABEL_ES, qualityLabelFor } from '../shared/quality';
import { QUALITY_LABEL_ES as QUALITY_LABEL_ES_FRONT } from '../src/lib/format';
import { filterFestivities } from '../worker/api/clock';
import { festivityLabelEs } from '../shared/festivities';
import { getItem, routeMarket } from '../worker/api/market';
import { buildRiskQuote, handleRisk } from '../worker/api/risk';
import { CoreError, GuildNotFound, getLosses, handleLossesGuild } from '../worker/api/insightsA';
import { aodpMessageEs, upstreamErrorL } from '../worker/api/langErrors';
import { upstreamError } from '../worker/lib/respond';
import { api } from '../src/lib/api';
import { aodpFixtureRoute, mockCaches, mockFetch } from './helpers/net';
import { readPublic } from './helpers/public';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const env = {} as Env;
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-30T12:00:00Z');

/** Palavras que só aparecem no português dos textos montados (nenhuma existe no espanhol equivalente). */
const PT_ONLY = /\b(você|kills?|abate|sozinho|histórico|não|montaria|poção|guilda|prata|dossiê|matador|deixe|tente)\b/i;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------- números ----------

describe('shared/lang', () => {
  it('só "es" vira espanhol; números no formato de cada língua', () => {
    expect(apiLang('es')).toBe('es');
    expect(apiLang(' ES ')).toBe('es');
    for (const v of [null, undefined, '', 'pt', 'es-419', 'en', 1]) expect(apiLang(v)).toBe('pt');
    expect(fmtIntL(1350)).toBe('1.350');
    expect(fmtIntL(1350, 'es')).toBe('1,350');
    expect(fmtFameL(2_421_977)).toBe('2,4 mi');
    expect(fmtFameL(2_421_977, 'es')).toBe('2.4 M');
    expect(fmtFameL(52_000, 'es')).toBe('52 mil');
    expect(fmtFameL(1_200_000_000, 'es')).toBe('1.2 mil M');
  });
});

// ---------- perigo e lições (puros) ----------

const side = (p: Partial<SlimSide> = {}): SlimSide => ({ id: 'A', name: 'A', guild: '', alliance: '', ip: 1200, gear: [], ...p });
function ev(daysAgo: number, p: Partial<SlimEvent> = {}): SlimEvent {
  return {
    id: Math.round(daysAgo * 1000), time: new Date(NOW - daysAgo * DAY).toISOString(),
    killer: side({ id: 'ME' }), victim: side({ id: 'V' }), dealers: 1, group: 1, fame: 1000, area: null, ...p,
  };
}

describe('computeDanger em espanhol', () => {
  const gank: DangerInput = {
    killFame: 60e6, deathFame: 10e6, kills: Array.from({ length: 8 }, (_, k) => ev(k * 0.5)), deaths: [],
    soloRate: 1, avgGroup: 1, avgIp: 1450, partial: true,
  };
  const zerg: DangerInput = { killFame: 12e6, deathFame: 7e6, kills: [ev(40), ev(41), ev(42)], deaths: [], soloRate: 0, avgGroup: 6, avgIp: 1300 };

  it('mesmo score e rótulo (código), motivos em espanhol com os termos do jogo', () => {
    const pt = computeDanger(gank, NOW);
    const es = computeDanger(gank, NOW, 'es');
    expect(es.score).toBe(pt.score);
    expect(es.label).toBe('perigoso');
    expect(es.reasons).toHaveLength(pt.reasons.length);
    expect(es.reasons).toEqual([
      'fama por asesinatos muy alta (60 M)',
      'mata 6× más de lo que muere',
      '8 asesinatos recientes (últimos 7 días)',
      'mata en solitario con IP alto (100% de los asesinatos)',
      'IP medio 1,450',
      'parte del historial no se pudo cargar ahora',
    ]);
    const z = computeDanger(zerg, NOW, 'es');
    expect(z.score).toBe(computeDanger(zerg, NOW).score);
    expect(z.reasons).toContain('fama por asesinatos alta (12 M)');
    expect(z.reasons).toContain('mata más de lo que muere (1.7×)');
    expect(z.reasons).toContain('anda en grupo de 6');
    expect(z.reasons).toContain('último asesinato hace 40 días');
    for (const r of [...es.reasons, ...z.reasons]) expect(r).not.toMatch(PT_ONLY);
  });

  it('português idêntico ao de antes (com e sem o argumento)', () => {
    expect(computeDanger(gank, NOW, 'pt')).toEqual(computeDanger(gank, NOW));
    expect(computeDanger(gank, NOW).reasons).toEqual([
      'fama de abate muito alta (60 mi)',
      'mata 6× mais do que morre',
      '8 kills recentes (últimos 7 dias)',
      'mata sozinho com IP alto (100% das kills)',
      'IP médio 1.450',
      'parte do histórico não carregou agora',
    ]);
  });

  it('sem dado, sem kill recente e frases de reserva', () => {
    expect(computeDanger({ killFame: 0, deathFame: 0, kills: [], deaths: [], soloRate: null, avgGroup: null, avgIp: null }, NOW, 'es').reasons)
      .toEqual(['ningún asesinato en el killboard']);
    const quiet = computeDanger({ killFame: 5e5, deathFame: 1e6, kills: [], deaths: [ev(1)], soloRate: null, avgGroup: null, avgIp: null }, NOW, 'es');
    expect(quiet.reasons).toEqual(['ningún asesinato reciente en el killboard']);
    expect(basicDossier(side({ name: 'X' }), 'es').danger.reasons).toEqual(['historial completo no disponible ahora; inténtalo de nuevo en unos instantes']);
    expect(basicDossier(side({ name: 'X' })).danger.reasons).toEqual(['histórico completo indisponível agora; tente de novo em instantes']);
  });
});

describe('buildLessons em espanhol', () => {
  const death = ev(0, {
    group: 6, dealers: 4,
    killer: side({ ip: 1400, gear: [{ slot: 'MainHand', id: 'T6_2H_FIRESTAFF', quality: 1, count: 1 }] }),
    victim: side({ ip: 1100, gear: [{ slot: 'Head', id: 'T4_HEAD_GATHERER_FIBER', quality: 1, count: 1 }] }),
  });
  const input = { death, killerDanger: { score: 80, label: 'perigoso' as const, reasons: [] }, killerBasic: false, setValue: 2_345_000 };

  it('mesma quantidade e ordem de regras, texto em espanhol com o glossário', () => {
    const pt = buildLessons(input);
    const es = buildLessons(input, 'es');
    expect(es).toHaveLength(pt.length);
    expect(es[0]).toBe('Quien te mató tenía un IP mucho mayor (1,400 contra 1,100); evita pelear contra builds de ese nivel.');
    expect(es[1]).toBe('Fue un grupo de 6: en zona roja o negra, ve con escolta o evita la hora pico.');
    expect(es[2]).toBe('Este jugador mata con frecuencia: evita su zona.');
    expect(es[3]).toBe('No llevabas montura: sin ella, huir es casi imposible.');
    for (const l of es) expect(l).not.toMatch(PT_ONLY);
    // Reservas e regras do fim da lista (corte em 5).
    const full = ['Mount', 'Potion', 'Food'].map((slot) => ({ slot, id: 'T4_X', quality: 1, count: 1 }));
    const calm = ev(0, { killer: side({ ip: 1000 }), victim: side({ ip: 1000, gear: full }) });
    const fb = buildLessons({ death: calm, killerDanger: null, killerBasic: false, setValue: null }, 'es');
    expect(fb).toEqual([
      'Revisa el dosier de quien te mató antes de volver a la misma zona.',
      'Guarda en el banco la plata que no puedes perder antes de salir a una zona de riesgo.',
      'Si dudas entre pelear y huir, huye pronto: huir cuesta menos que morir.',
    ]);
    const weapon = buildLessons({ death: ev(0, { killer: side({ ip: 1000, gear: [{ slot: 'MainHand', id: 'T6_2H_FIRESTAFF', quality: 1, count: 1 }] }), victim: side({ ip: 1000, gear: full }) }), killerDanger: null, killerBasic: true, setValue: null }, 'es');
    expect(weapon).toContain('No se pudo cargar ahora el historial de quien te mató; abre su dosier en un rato.');
    expect(weapon).toContain('Quien te mató usaba un arma de tipo bastón ígneo: conoce el alcance y las habilidades de esa arma para reconocer la build la próxima vez.');
  });

  it('português idêntico ao de antes', () => {
    expect(buildLessons(input, 'pt')).toEqual(buildLessons(input));
    expect(buildLessons(input)[0]).toBe('Ele estava com IP bem maior (1.400 contra 1.100); evite trocar com builds desse nível.');
  });
});

// ---------- dossiê e autópsia com a gameinfo falsa: espanhol sem subrequest a mais ----------

const ME = 'NwcyH-y1Q924YlQkAkn7nw';
const KILLER = 'qhOHzIODRKeJI7RYHVKqYQ';
const FIX: Record<string, string> = {
  [`/search?q=CalangoPeto`]: 'gameinfo-search.json',
  [`/players/${ME}`]: 'gameinfo-player.json',
  [`/players/${ME}/kills`]: 'gameinfo-kills.json',
  [`/players/${ME}/deaths`]: 'gameinfo-deaths.json',
  [`/players/${KILLER}`]: 'gameinfo-killer-player.json',
  [`/players/${KILLER}/kills`]: 'gameinfo-killer-kills.json',
  [`/players/${KILLER}/deaths`]: 'gameinfo-killer-deaths.json',
};
function stubGameinfo(): string[] {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/api/gameinfo', '') + url.search;
    calls.push(path);
    const file = FIX[path];
    return file ? new Response(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'), { status: 200 }) : new Response('nf', { status: 404 });
  }));
  return calls;
}
function fakePrices(ids: string[], _c: unknown, qualities: number[]): PriceRow[] {
  const at = new Date(Date.now() - 3600_000).toISOString();
  return ids.flatMap((id) => qualities.map((q) => ({ id, city: 'Caerleon' as const, quality: q as 1, sellMin: 1000 * q, sellMinAt: at, buyMax: null, buyMaxAt: null })));
}

describe('dossiê, autópsia e rota de jogador em espanhol', () => {
  beforeEach(() => {
    _resetGameinfoMemory();
    vi.mocked(aodpPrices).mockReset();
    vi.mocked(aodpPrices).mockImplementation(async (ids, c, q) => fakePrices(ids, c, q));
  });

  it('dossiê: mesmo dado, só os motivos mudam; o espanhol reaproveita o cache (0 idas novas à gameinfo)', async () => {
    const calls = stubGameinfo();
    const pt = await getDossier(env, ctx, ME);
    expect(calls).toHaveLength(3);
    const es = await getDossier(env, ctx, ME, 'es');
    expect(calls).toHaveLength(3);
    expect({ ...es, danger: { ...es.danger, reasons: [] } }).toEqual({ ...pt, danger: { ...pt.danger, reasons: [] } });
    expect(es.danger.reasons).toHaveLength(pt.danger.reasons.length);
    expect(es.danger.reasons).not.toEqual(pt.danger.reasons);
    for (const r of es.danger.reasons) expect(r).not.toMatch(PT_ONLY);
  });

  it('autópsia: lições e perigo do matador em espanhol; números e recompra iguais', async () => {
    stubGameinfo();
    const pt = await getAutopsy(env, ctx, ME);
    const es = await getAutopsy(env, ctx, ME, 'es');
    expect(es.rebuy).toEqual(pt.rebuy);
    expect(es.death).toEqual(pt.death);
    expect(es.lessons).toHaveLength(pt.lessons.length);
    for (const l of es.lessons) expect(l).not.toMatch(PT_ONLY);
    expect(es.killerDossier?.danger.score).toBe(pt.killerDossier?.danger.score);
    for (const r of es.killerDossier?.danger.reasons ?? []) expect(r).not.toMatch(PT_ONLY);
  });

  it('rota: ?lang=es nos motivos e nos erros; sem lang, igual a antes', async () => {
    stubGameinfo();
    const call = (path: string) => {
      const url = new URL('https://guarita.pages.dev' + path);
      return routePlayer(new Request(url), url, env, ctx);
    };
    expect(await (await call('/api/player/search?q=ab&lang=es'))!.json()).toEqual({ error: 'Escribe al menos 3 caracteres del nombre.' });
    expect(await (await call('/api/player/search?q=ab'))!.json()).toEqual({ error: 'Digite pelo menos 3 caracteres do nome.' });
    expect(await (await call('/api/player/x!?lang=es'))!.json()).toEqual({ error: 'Id de jugador no válido.' });
    const nf = await call('/api/player/naoexiste123?lang=es');
    expect(nf!.status).toBe(404);
    expect(await nf!.json()).toEqual({ error: 'Jugador no encontrado en el killboard de Americas.' });
    const ok = (await (await call(`/api/player/${ME}?lang=es`))!.json()) as { danger: { reasons: string[] } };
    const okPt = (await (await call(`/api/player/${ME}`))!.json()) as { danger: { reasons: string[] } };
    expect(ok.danger.reasons).not.toEqual(okPt.danger.reasons);
    expect(okPt.danger.reasons).toEqual((await getDossier(env, ctx, ME)).danger.reasons);
  });
});

// ---------- selo de confiança e página de item ----------

describe('selo de confiança em espanhol', () => {
  const worst = { price: 100, ageMin: 200, depth: 2, median7d: 300, sellMin: 100, buyMax: 150, avgDailyVolume: 1 };

  it('mesmo score e rótulo; motivos traduzidos; idade igual à do /api/hoje', () => {
    const pt = confidence(worst);
    const es = confidence(worst, 'es');
    expect(es.score).toBe(pt.score);
    expect(es.label).toBe(pt.label);
    expect(es.reasons).toEqual(['visto hace 3 h', 'libro de órdenes escaso', 'muy por debajo de la mediana', 'compra por encima de la venta (sospechoso)', 'poco volumen']);
    expect(confidence({ price: null, ageMin: null }, 'es').reasons).toEqual(['sin precio registrado']);
    expect(confidence({ price: 100, ageMin: 5, depth: 0 }, 'es').reasons).toContain('sin libro de órdenes');
    for (const m of [null, 0.5, 12, 200, 3000, 9000]) expect(ageLabel(m, 'es')).toBe(ageLabelEs(m));
    // Toda frase fixa do selo tem tradução, e nenhuma tradução ficou em português.
    for (const [ptText, esText] of Object.entries(CONFIDENCE_REASONS_ES)) {
      expect(esText).not.toBe(ptText);
      expect(esText).not.toMatch(/livro|preço|acima|abaixo|pouco/);
    }
  });

  it('português idêntico ao de antes', () => {
    expect(confidence(worst, 'pt')).toEqual(confidence(worst));
    expect(confidence(worst).reasons).toEqual(['visto há 3 h', 'livro raso', 'muito abaixo da mediana', 'compra acima da venda (suspeito)', 'pouco volume']);
  });

  it('/api/item?lang=es: motivos em espanhol, mesmos números, sem subrequest a mais (cache do AODP)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const pt = await getItem(env, ctx, 'T4_BAG', 1);
    expect(calls).toHaveLength(3);
    const es = await getItem(env, ctx, 'T4_BAG', 1, 'es');
    expect(calls).toHaveLength(3);
    const strip = (x: typeof pt) => ({ ...x, cities: x.cities.map((c) => ({ ...c, confidence: { ...c.confidence, reasons: [] } })) });
    expect(strip(es)).toEqual(strip(pt));
    const withReasons = es.cities.filter((c) => c.confidence.reasons.length);
    expect(withReasons.length).toBeGreaterThan(0);
    const esTexts = new Set(Object.values(CONFIDENCE_REASONS_ES));
    for (const c of withReasons) for (const r of c.confidence.reasons) expect(esTexts.has(r) || /^(visto hace |visto ahora|sin fecha)/.test(r)).toBe(true);
    const url = new URL('https://guarita.pages.dev/api/item/%20?lang=es');
    expect(await (await routeMarket(new Request(url), url, env, ctx))!.json()).toEqual({ error: 'Id de objeto no válido.' });
    const urlPt = new URL('https://guarita.pages.dev/api/item/%20');
    expect(await (await routeMarket(new Request(urlPt), urlPt, env, ctx))!.json()).toEqual({ error: 'Id de item inválido.' });
  });
});

// ---------- zonas (arriscar) ----------

describe('zonas em espanhol', () => {
  it('a cópia do front (src/lib/novato/arriscar.ts) é idêntica à fonte em shared/zones.ts', () => {
    expect(ZONE_TEXT_ES_FRONT).toEqual(ZONE_TEXT_ES);
    for (const r of ZONE_RULES) {
      expect(zoneTextFor(r.zone, 'es')).toEqual(zoneText(r.zone, 'es'));
      expect(zoneTextFor(r.zone)).toEqual(zoneText(r.zone, 'pt'));
    }
    expect(ZONE_TEXT_ES.brumas.label).toBe('Nieblas');
    for (const z of Object.values(ZONE_TEXT_ES)) expect(`${z.label} ${z.who} ${z.death} ${z.note}`).not.toMatch(/Brumas|guilda|você/);
  });

  it('zonesFor/risco: nota e rótulo em espanhol; português sem o campo novo', () => {
    expect(zonesFor(1000, 'pt')).toEqual(zonesFor(1000));
    for (const z of zonesFor(1000)) expect(z).not.toHaveProperty('label');
    const es = zonesFor(1000, 'es');
    expect(es.map((z) => z.amount)).toEqual(zonesFor(1000).map((z) => z.amount));
    expect(es.find((z) => z.zone === 'vermelha')).toMatchObject({ label: 'Zona roja', labelPt: 'Zona vermelha', note: ZONE_TEXT_ES.vermelha.note });
    const q = buildRiskQuote([{ id: 'T4_BAG', quality: 1 }], [], '2026-10-30T12:00:00Z', NOW, 'es');
    expect(q.zones.find((z) => z.zone === 'brumas')?.label).toBe('Nieblas');
    expect(buildRiskQuote([{ id: 'T4_BAG', quality: 1 }], [], '2026-10-30T12:00:00Z', NOW)).toEqual(
      buildRiskQuote([{ id: 'T4_BAG', quality: 1 }], [], '2026-10-30T12:00:00Z', NOW, 'pt'),
    );
  });

  it('POST /api/risk?lang=es: erros em espanhol; sem lang, os de antes', async () => {
    const post = async (path: string, body: unknown) => {
      const url = new URL('https://guarita.pages.dev' + path);
      const r = await handleRisk(new Request(url, { method: 'POST', body: JSON.stringify(body) }), url, env, ctx);
      return r!.json();
    };
    expect(await post('/api/risk?lang=es', { items: [] })).toEqual({ error: 'Elige al menos una pieza.' });
    expect(await post('/api/risk', { items: [] })).toEqual({ error: 'Escolha pelo menos uma peça.' });
    expect(await post('/api/risk?lang=es', { items: [{ id: 'T4_BAG', quality: 9 }] })).toEqual({ error: 'Calidad no válida en T4_BAG: usa de 1 (Normal) a 5 (Obra maestra).' });
  });
});

// ---------- qualidade, festividades, perdas, erros ----------

describe('qualidade e festividades', () => {
  it('nomes de qualidade em espanhol iguais aos do site', () => {
    expect(QUALITY_LABEL_ES).toEqual(QUALITY_LABEL_ES_FRONT);
    expect(qualityLabelFor(3, 'es')).toBe('Notable');
    expect(qualityLabelFor(4, 'es')).toBe('Sobresaliente');
    expect(qualityLabelFor(4)).toBe('Excelente');
  });

  it('relógio: `label` em espanhol só com lang=es; labelPt sempre o português', () => {
    const raw = [
      { kind: 2, category: '', name: 'PRODUCTION_BONUS_CROSSBOW', start: '2026-10-30T10:00:00Z', end: '2026-10-31T10:00:00Z' },
      { kind: 1, category: 'ACTIVITIES', name: 'FAME_BONUS', start: '2026-10-30T11:00:00Z', end: '2026-10-30T20:00:00Z' },
    ];
    const pt = filterFestivities(raw, NOW);
    const es = filterFestivities(raw, NOW, 'es');
    for (const f of pt) expect(f).not.toHaveProperty('label');
    expect(es.map(({ label: _l, ...rest }) => rest)).toEqual(pt);
    expect(es.map((f) => f.label)).toEqual(raw.map((e) => festivityLabelEs(e.kind, e.category, e.name)));
  });
});

describe('perdas e guilda em espanhol', () => {
  function lossesEnv() {
    const seen: string[] = [];
    const core: string[] = [];
    const e = {
      ASSETS: {
        async fetch(req: Request) {
          const path = new URL(req.url).pathname;
          seen.push(path);
          const text = readPublic(path);
          return text === null ? new Response('nf', { status: 404 }) : new Response(text);
        },
      },
      CORE: {
        async fetch(req: Request) {
          const u = new URL(req.url);
          core.push(u.pathname);
          return Response.json({ days: 1, deaths: 9, since: '2026-10-30', items: [{ type: 'T4_BAG', count: 5 }, { type: 'T6_2H_BOW', count: 2 }] });
        },
      },
    } as unknown as Env;
    return { e, seen, core };
  }

  it('nomes das fatias names-es/, mesmo KillLog e mesmo AODP (cache), sem misturar línguas no isolate', async () => {
    mockCaches();
    const aodp = mockFetch(aodpFixtureRoute);
    const { e, seen, core } = lossesEnv();
    const pt = await getLosses(e, ctx, 1, 50);
    const n = { aodp: aodp.length, core: core.length };
    const es = await getLosses(e, ctx, 1, 50, 'es');
    expect({ aodp: aodp.length, core: core.length }).toEqual(n);
    expect(pt.items.find((i) => i.id === 'T4_BAG')?.name).toBe('Bolsa do Adepto (T4)');
    expect(es.items.find((i) => i.id === 'T4_BAG')?.name).toBe('Bolsa del iniciado (T4)');
    expect(es.items.map((i) => ({ ...i, name: '' }))).toEqual(pt.items.map((i) => ({ ...i, name: '' })));
    expect(seen).toContain('/data/names-es/t4.json');
    // Isolate quente: o português de novo continua português (a chave da fatia leva a língua).
    expect((await getLosses(e, ctx, 1, 50)).items.find((i) => i.id === 'T4_BAG')?.name).toBe('Bolsa do Adepto (T4)');
  });

  it('rotas: nomes e erros em espanhol com lang=es', async () => {
    mockCaches();
    mockFetch(aodpFixtureRoute);
    const { e } = lossesEnv();
    const call = async (path: string) => {
      const url = new URL('https://guarita.pages.dev' + path);
      return handleLossesGuild(new Request(url), url, e, ctx);
    };
    const r = (await (await call('/api/losses?days=1&lang=es'))!.json()) as { items: { id: string; name: string }[] };
    expect(r.items.find((i) => i.id === 'T4_BAG')?.name).toBe('Bolsa del iniciado (T4)');
    expect(await (await call('/api/guilds?q=ab&lang=es'))!.json()).toEqual({ error: 'Escribe al menos 3 letras del nombre del gremio.' });
    expect(await (await call('/api/guilds?q=ab'))!.json()).toEqual({ error: 'Digite pelo menos 3 letras do nome da guilda.' });
  });

  it('erros do KillLog e guilda inexistente: espanhol por textFor, português igual a antes', () => {
    const g = new GuildNotFound('BAGRE');
    expect(g.message).toBe('Guilda “BAGRE” não encontrada no servidor Americas. O nome precisa ser exato.');
    expect(g.textFor('pt')).toBe(g.message);
    expect(g.textFor('es')).toBe('No encontré el gremio “BAGRE” en el servidor Americas. El nombre tiene que ser exacto.');
    expect(new CoreError('O histórico do killboard está indisponível agora.').textFor('es')).toBe('El historial del killboard no está disponible ahora.');
    expect(new CoreError('x', 503).textFor('es')).toBe('El historial del killboard respondió con error 503.');
  });
});

describe('erro do AODP na língua pedida', () => {
  it('espanhol remontado pelo status; português idêntico ao upstreamError', async () => {
    expect(aodpMessageEs(new AodpError('O AODP limitou as requisições; tente de novo em 30 s.', 429, 30))).toBe('El AODP limitó las solicitudes; inténtalo de nuevo en 30 s.');
    expect(aodpMessageEs(new AodpError('O AODP demorou demais para responder.', 504))).toBe('El AODP tardó demasiado en responder.');
    expect(aodpMessageEs(new AodpError('Não foi possível falar com o AODP.', 504))).toBe('No fue posible comunicarse con el AODP.');
    expect(aodpMessageEs(new AodpError('O AODP respondeu com erro 503.', 503))).toBe('El AODP respondió con error 503.');
    const err = new AodpError('O AODP limitou as requisições; tente de novo em 30 s.', 429, 30);
    const a = upstreamErrorL(err, 'pt');
    const b = upstreamError(err);
    expect([a.status, a.headers.get('Retry-After'), await a.text()]).toEqual([b.status, b.headers.get('Retry-After'), await b.text()]);
    const es = upstreamErrorL(err, 'es');
    expect(es.status).toBe(502);
    expect(await es.json()).toEqual({ error: 'El AODP limitó las solicitudes; inténtalo de nuevo en 30 s.' });
  });
});

// ---------- cliente do site ----------

describe('src/lib/api.ts', () => {
  it('em espanhol leva lang=es; em português a URL é a de antes', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(u);
      return Response.json({});
    }));
    await api.dossier('X1');
    await api.dossier('X1', 'es');
    await api.autopsy('X1', 'es');
    await api.item('T4_BAG', 2);
    await api.item('T4_BAG', 2, 'es');
    await api.clock();
    await api.clock('es');
    await api.losses(7, 'es');
    await api.guild('B A G R E', 'es');
    await api.risk([{ id: 'T4_BAG', quality: 1 }], 'es');
    await api.risk([{ id: 'T4_BAG', quality: 1 }]);
    expect(urls).toEqual([
      '/api/player/X1',
      '/api/player/X1?lang=es',
      '/api/player/X1/autopsy?lang=es',
      '/api/item/T4_BAG?q=2',
      '/api/item/T4_BAG?q=2&lang=es',
      '/api/clock',
      '/api/clock?lang=es',
      '/api/losses?days=7&lang=es',
      '/api/guild/B%20A%20G%20R%20E?lang=es',
      '/api/risk?lang=es',
      '/api/risk',
    ]);
  });
});
