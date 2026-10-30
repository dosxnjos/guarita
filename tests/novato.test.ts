// Módulo (c) da Fase 2: novato (Quanto vale arriscar, Golpes, Glossário).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../worker/env';
import type { PlayerHit, PriceRow, ZoneKind } from '../shared/types';
import { ZONE_RULES, zonesFor } from '../shared/zones';
import { GLOSSARY, glossLetter, searchGlossary } from '../shared/glossary';
import { SCAMS } from '../shared/scams';
import { buildRiskQuote, handleRisk, parseRiskBody } from '../worker/api/risk';
import { routeRisk } from '../worker/api/routesF2';
import { classifyNick, editDistance, nickQueries, nickSkeleton, similarNicks } from '../src/lib/novato/similar';
import { PRESETS, coverageText, parseSetParam, readyPieces, newPiece, setParam } from '../src/lib/novato/arriscar';
import { aodpFixtureRoute, mockCaches, mockFetch } from './helpers/net';
import { readPublic } from './helpers/public';

const env = {
  ASSETS: {
    fetch: async (req: Request) => {
      const body = readPublic(new URL(req.url).pathname);
      return body == null ? new Response('não achei', { status: 404 }) : new Response(body);
    },
  },
} as unknown as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function post(body: unknown, method = 'POST'): [Request, URL] {
  const url = new URL('https://guarita.pages.dev/api/risk');
  const req = new Request(url, method === 'POST'
    ? { method, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }
    : { method });
  return [req, url];
}

afterEach(() => vi.unstubAllGlobals());

describe('zonas', () => {
  const kinds: ZoneKind[] = ['azul', 'amarela', 'vermelha', 'preta', 'avalon', 'brumas'];
  it('tem cada tipo de zona uma vez, com texto', () => {
    expect(ZONE_RULES.map((z) => z.zone).sort()).toEqual([...kinds].sort());
    for (const z of ZONE_RULES) {
      expect(z.labelPt && z.who && z.death && z.note).toBeTruthy();
    }
  });
  it('azul e amarela só perdem durabilidade; as de saque total põem o set inteiro em risco', () => {
    const zs = zonesFor(123456.4);
    const by = Object.fromEntries(zs.map((z) => [z.zone, z]));
    expect(by.azul.lose).toBe('durabilidade');
    expect(by.amarela.lose).toBe('durabilidade');
    expect(by.azul.amount).toBe(0);
    for (const k of ['vermelha', 'preta', 'avalon', 'brumas'] as const) {
      expect(by[k].lose).toBe('tudo');
      expect(by[k].amount).toBe(123456);
    }
  });
  it('total inválido vira zero', () => {
    expect(zonesFor(Number.NaN).every((z) => z.amount === 0)).toBe(true);
  });
});

describe('glossário', () => {
  it('tem 60+ termos com id único e tudo preenchido', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(60);
    expect(new Set(GLOSSARY.map((t) => t.id)).size).toBe(GLOSSARY.length);
    for (const t of GLOSSARY) {
      expect(t.term.trim()).not.toBe('');
      expect(t.def.length).toBeGreaterThan(20);
      expect(glossLetter(t)).toMatch(/^[A-Z#]$/);
    }
  });
  it('cobre os termos pedidos', () => {
    const all = GLOSSARY.flatMap((t) => [t.term, ...t.aka].map((s) => s.toLowerCase()));
    for (const w of ['gank', 'regear', 'cta', 'zvz', 'ho', 'rrr', 'ip', 'bm', 'flip', 'scout', 'cluster', 't4.1', 'foco',
      'fama', 'prata', 'ouro', 'premium', 'ilha', 'laborer', 'journal', 'artefato', 'hellgate', 'brumas', 'roads',
      'ancient lands', 'castelo', 'outpost', 'território', 'temporada', 'smart cluster queue', 'zona azul', 'zona amarela',
      'zona vermelha', 'zona preta', 'full loot', 'chest', 'dps', 'healer', 'tank', 'support', 'kite', 'cc', 'purge',
      'escape', 'montaria', 'ganker', 'loot logger', 'killboard', 'aodp', 'emv', 'setup fee', 'taxa', 'buy order',
      'sell order', 'transmutar', 'encantar', 'refinar', 'especialização', 'maestria', 'destiny board']) {
      expect(all, w).toContain(w);
    }
  });
  it('busca por português, inglês e sem acento', () => {
    expect(searchGlossary('gank')[0].id).toBe('gank');
    expect(searchGlossary('hideout')[0].id).toBe('ho');
    expect(searchGlossary('especializacao')[0].id).toBe('especializacao');
    expect(searchGlossary('black market')[0].id).toBe('black-market');
    expect(searchGlossary('xyzzy')).toEqual([]);
    expect(searchGlossary('').length).toBe(GLOSSARY.length);
  });
});

describe('golpes', () => {
  it('cada golpe tem como funciona, sinais e proteção', () => {
    expect(SCAMS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(SCAMS.map((s) => s.id)).size).toBe(SCAMS.length);
    for (const s of SCAMS) {
      expect(s.title && s.summary && s.how).toBeTruthy();
      expect(s.signs.length).toBeGreaterThan(0);
      expect(s.protect.length).toBeGreaterThan(0);
    }
  });
  it('nunca chama ninguém de golpista', () => {
    expect(JSON.stringify(SCAMS).toLowerCase()).not.toContain('golpista conhecido');
  });
});

describe('nick parecido', () => {
  const hit = (name: string, id = name): PlayerHit => ({ id, name, guild: '', alliance: '', killFame: 0, deathFame: 0 });
  it('esqueleto junta letras que se confundem', () => {
    expect(nickSkeleton('CaIangoPet0')).toBe(nickSkeleton('CalangoPeto'));
    expect(nickSkeleton('Mo0rn')).toBe(nickSkeleton('MoOm'));
  });
  it('distância de edição', () => {
    expect(editDistance('calango', 'calango')).toBe(0);
    expect(editDistance('calango', 'calangoo')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
  it('classifica exato, caixa, homóglifo e edição', () => {
    expect(classifyNick('CalangoPeto', hit('CalangoPeto'))?.kind).toBe('exato');
    expect(classifyNick('CalangoPeto', hit('calangopeto'))?.kind).toBe('caixa');
    const h = classifyNick('CalangoPeto', hit('CaIangoPet0'));
    expect(h?.kind).toBe('homoglifo');
    expect(h?.reason).toContain('“l” virou “I”');
    expect(classifyNick('CalangoPeto', hit('CalangoPetoo'))).toMatchObject({ kind: 'edicao', distance: 1 });
    expect(classifyNick('CalangoPeto', hit('Bagre'))).toBeNull();
  });
  it('nome curto não vira parecido com qualquer coisa', () => {
    expect(classifyNick('Abc', hit('Xyz'))).toBeNull();
    expect(classifyNick('Abc', hit('Abd'))?.kind).toBe('edicao');
  });
  it('ordena e tira repetidos', () => {
    const list = similarNicks('CalangoPeto', [hit('CalangoPetoo', '1'), hit('CaIangoPeto', '2'), hit('CalangoPeto', '3'), hit('CaIangoPeto', '2'), hit('Outro', '4')]);
    expect(list.map((m) => m.hit.id)).toEqual(['3', '2', '1']);
  });
  it('consultas: nome inteiro e a primeira metade', () => {
    expect(nickQueries('CalangoPeto')).toEqual(['CalangoPeto', 'Calang']);
    expect(nickQueries('abc')).toEqual(['abc']);
    expect(nickQueries('ab')).toEqual([]);
  });
});

describe('arriscar (front)', () => {
  it('presets têm até 12 peças com id válido e existente', () => {
    for (const p of PRESETS) {
      expect(p.items.length).toBeGreaterThan(0);
      expect(p.items.length).toBeLessThanOrEqual(12);
      for (const it of p.items) {
        expect(it.id).toMatch(/^T[1-8]_[A-Z0-9_]+(@[1-4])?$/);
        const tier = it.id[1];
        const names = JSON.parse(readPublic(`/data/names/t${tier}.json`) ?? '{}') as Record<string, string>;
        expect(names[it.id], it.id).toBeTruthy();
      }
    }
  });
  it('?set= ida e volta', () => {
    const ps = parseSetParam('t4_bag:3,LIXO,T6_CAPE:9,T4_BAG@1');
    expect(ps.map((p) => [p.itemId, p.quality])).toEqual([['T4_BAG', 3], ['T6_CAPE', 1], ['T4_BAG@1', 1]]);
    expect(setParam(readyPieces(ps))).toBe('T4_BAG:3,T6_CAPE:1,T4_BAG@1:1');
    expect(readyPieces([newPiece(), newPiece('T4_BAG')])).toEqual([{ id: 'T4_BAG', quality: 1 }]);
  });
  it('texto de cobertura', () => {
    const item = { id: 'X', quality: 1 as const, price: 1, city: null, ageMin: null };
    expect(coverageText({ items: [item, item], missing: 0 })).toBe('As 2 peças têm preço.');
    expect(coverageText({ items: [item, item, item], missing: 1 })).toContain('2 de 3 peças');
  });
});

describe('POST /api/risk', () => {
  it('valida o corpo', () => {
    expect(parseRiskBody(null)).toHaveProperty('error');
    expect(parseRiskBody({ items: [] })).toHaveProperty('error');
    expect(parseRiskBody({ items: Array.from({ length: 13 }, () => ({ id: 'T4_BAG' })) })).toHaveProperty('error');
    expect(parseRiskBody({ items: [{ id: 'nada' }] })).toHaveProperty('error');
    expect(parseRiskBody({ items: [{ id: 'T4_BAG', quality: 7 }] })).toHaveProperty('error');
    expect(parseRiskBody({ items: [{ id: ' t4_bag@1 ' }] })).toEqual({ items: [{ id: 'T4_BAG@1', quality: 1 }] });
  });

  it('monta a cotação com a menor venda e conta as peças sem preço', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    const rows: PriceRow[] = [
      { id: 'T4_BAG', city: 'Lymhurst', quality: 1, sellMin: 4000, sellMinAt: '2026-10-30T11:00:00Z', buyMax: null, buyMaxAt: null },
      { id: 'T4_BAG', city: 'Martlock', quality: 2, sellMin: 3500, sellMinAt: '2026-10-30T10:00:00Z', buyMax: null, buyMaxAt: null },
    ];
    const q = buildRiskQuote([{ id: 'T4_BAG', quality: 1 }, { id: 'T4_CAPE', quality: 1 }], rows, '2026-10-30T11:59:00Z', now);
    expect(q.items[0]).toMatchObject({ price: 3500, city: 'Martlock', ageMin: 120 });
    expect(q.items[1]).toMatchObject({ price: null, city: null });
    expect(q.total).toBe(3500);
    expect(q.missing).toBe(1);
    expect(q.zones.find((z) => z.zone === 'preta')?.amount).toBe(3500);
    expect(q.fetchedAt).toBe('2026-10-30T11:59:00Z');
  });

  it('ignora outras rotas e recusa GET', async () => {
    const other = new URL('https://guarita.pages.dev/api/gold');
    expect(await routeRisk(new Request(other), other, env, ctx)).toBeNull();
    const res = await handleRisk(...post(null, 'GET'), env, ctx);
    expect(res?.status).toBe(405);
  });

  it('400 para JSON quebrado, 13 peças, id mal formado e item que não existe', async () => {
    expect((await handleRisk(...post('{'), env, ctx))?.status).toBe(400);
    expect((await handleRisk(...post({ items: Array.from({ length: 13 }, () => ({ id: 'T4_BAG', quality: 1 })) }), env, ctx))?.status).toBe(400);
    expect((await handleRisk(...post({ items: [{ id: 'DROP TABLE', quality: 1 }] }), env, ctx))?.status).toBe(400);
    const res = await handleRisk(...post({ items: [{ id: 'T4_NAO_EXISTE_XYZ', quality: 1 }] }), env, ctx);
    expect(res?.status).toBe(400);
    expect(((await res!.json()) as { error: string }).error).toContain('T4_NAO_EXISTE_XYZ');
  });

  it('caminho feliz com o AODP (fixture de T4_BAG), uma chamada, sem cache público', async () => {
    mockCaches();
    const calls = mockFetch(aodpFixtureRoute);
    const res = await routeRisk(...post({ items: [{ id: 'T4_BAG', quality: 1 }] }), env, ctx);
    expect(res?.status).toBe(200);
    expect(res?.headers.get('cache-control')).toBe('no-store');
    const body = (await res!.json()) as { items: { price: number | null; city: string | null }[]; total: number; zones: unknown[] };
    expect(calls.filter((c) => c.url.includes('/prices/')).length).toBe(1);
    expect(calls[0].url).toContain('T4_BAG');
    expect(body.items[0].price).toBeGreaterThan(0);
    expect(body.items[0].city).not.toBe('Black Market');
    expect(body.total).toBe(body.items[0].price);
    expect(body.zones).toHaveLength(6);
  });
});
