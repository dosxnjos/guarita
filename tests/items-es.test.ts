// Nomes de item em espanhol: fatias ac-es/ e names-es/ do bot (worker/lib/acIndex.ts), índice items-index-es.json do
// navegador (src/lib/itemsClient.ts). Tudo gerado por scripts/build-items.mjs a partir do nome ES-ES do dump.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acLabel, acNamesPath, acSearch, parseAcQuery } from '../worker/lib/acIndex';
import { itemName, searchItems, type ItemsIndex } from '../shared/items';
import type { Env } from '../worker/env';
import { readPublic } from './helpers/public';

const env = {
  ASSETS: {
    fetch: async (req: Request) => {
      const body = readPublic(new URL(req.url).pathname);
      return body == null ? new Response('não achei', { status: 404 }) : new Response(body);
    },
  },
} as unknown as Env;

const read = (p: string) => JSON.parse(readPublic(`/data/${p}`) ?? 'null');
const pt = read('items-index.json') as ItemsIndex;
const es = read('items-index-es.json') as ItemsIndex;

describe('items-index-es.json', () => {
  it('mesmo formato e mesmos itens, na mesma ordem, do índice em português', () => {
    expect(es.v).toBe(1);
    expect(es.items.length).toBe(pt.items.length);
    for (let i = 0; i < pt.items.length; i += 97) {
      const [id, , en, tier, ench] = pt.items[i];
      expect(es.items[i][0]).toBe(id);
      expect(es.items[i].slice(2)).toEqual([en, tier, ench]);
    }
  });
  it('nome em espanhol do jogo na posição do nome localizado', () => {
    expect(itemName(es, 'T4_BAG')).toBe('Bolsa del iniciado');
    expect(itemName(es, 'T8_BAG')).toBe('Bolsa del anciano');
    expect(itemName(es, 'T4_POTION_HEAL')).toBe('Poción de curación');
  });
  it('a busca do navegador acha pelo nome em espanhol e pelo inglês', () => {
    expect(searchItems(es, 'bolsa iniciado', 3)[0]).toMatchObject({ id: 'T4_BAG', pt: 'Bolsa del iniciado' });
    expect(searchItems(es, 'pocion curacion', 5).map((h) => h.id)).toContain('T4_POTION_HEAL');
    expect(searchItems(es, "adept's bag", 3)[0].id).toBe('T4_BAG');
    // Os exemplos do placeholder em espanhol (SearchBox e painel de live) acham item de verdade.
    expect(searchItems(es, 'tablas T5.1', 5).map((h) => h.id)).toContain('T5_PLANKS_LEVEL1@1');
    expect(searchItems(es, 'tablones T5.1', 5)).toEqual([]); // o exemplo antigo não achava nada
    expect(searchItems(es, 'tablas T5', 5).map((h) => h.id)).toContain('T5_PLANKS');
    expect(searchItems(es, 'capa de Martlock', 5).length).toBeGreaterThan(0);
  });
});

describe('acIndex em espanhol (bot)', () => {
  it('tier em espanhol vira filtro, inclusive "gran maestro"', () => {
    expect(parseAcQuery('bolsa iniciado', 'es')).toEqual({ words: ['bolsa'], exact: ['t4'] });
    expect(parseAcQuery('bolsa del gran maestro', 'es')).toEqual({ words: ['bolsa'], exact: ['t7'] });
    expect(parseAcQuery('bolsa maestro', 'es')).toEqual({ words: ['bolsa'], exact: ['t6'] });
    // "gran" sozinho é palavra comum ("Gran bastón maldito").
    expect(parseAcQuery('gran baston', 'es')).toEqual({ words: ['gran', 'baston'], exact: [] });
  });
  it('acha a bolsa do iniciado com rótulo em espanhol', async () => {
    const hits = await acSearch(env, 'bolsa iniciado', 5, 'es');
    expect(hits[0]).toEqual({ id: 'T4_BAG', label: 'Bolsa del iniciado (T4)' });
    expect(hits.map((h) => h.id)).toContain('T4_BAG@1');
  });
  it('gran maestro = T7; gran bastón continua achando', async () => {
    expect((await acSearch(env, 'bolsa gran maestro', 3, 'es'))[0].id).toBe('T7_BAG');
    const staff = await acSearch(env, 'gran baston maldito', 25, 'es');
    expect(staff.map((h) => h.id)).toContain('T4_2H_CURSEDSTAFF');
  });
  it('acento e nome em inglês também valem', async () => {
    expect((await acSearch(env, 'poción curación', 5, 'es')).map((h) => h.id)).toContain('T4_POTION_HEAL');
    expect((await acSearch(env, "elder's bag", 3, 'es'))[0]).toEqual({ id: 'T8_BAG', label: 'Bolsa del anciano (T8)' });
  });
  it('id digitado direto e rótulo pelo id', async () => {
    expect(await acSearch(env, 't4_bag@1', 5, 'es')).toEqual([{ id: 'T4_BAG@1', label: 'Bolsa del iniciado (T4.1)' }]);
    expect(await acLabel(env, 't4_bag@1', 'es')).toBe('Bolsa del iniciado (T4.1)');
    expect(await acLabel(env, 'T4_NAO_EXISTE', 'es')).toBeNull();
  });
  it('sem locale (ou locale desconhecido) continua em português', async () => {
    expect(await acLabel(env, 'T4_BAG')).toBe('Bolsa do Adepto (T4)');
    expect(await acLabel(env, 'T4_BAG', 'xx' as 'pt')).toBe('Bolsa do Adepto (T4)');
    expect((await acSearch(env, 'bolsa adepto', 1))[0].label).toBe('Bolsa do Adepto (T4)');
    expect(acNamesPath(4)).toBe('/data/names/t4.json');
    expect(acNamesPath(4, 'es')).toBe('/data/names-es/t4.json');
  });
  it('id com nome de propriedade do objeto não vira rótulo', async () => {
    expect(await acLabel(env, 'constructor')).toBeNull();
  });
  it('rótulo recortado do texto da fatia, sem JSON.parse do arquivo inteiro (CPU do /perdas em espanhol)', async () => {
    expect(await acLabel(env, 'T6_BAG', 'es')).toBe('Bolsa del maestro (T6)');
    expect(await acLabel(env, 'T7_BAG', 'es')).toBe('Bolsa del gran maestro (T7)');
    // Prova de que o arquivo não passa por JSON.parse: um texto que não é JSON válido no todo ainda resolve o id.
    const raw = { ASSETS: { fetch: async () => new Response('{"T3_FAKE":"Capa \\"rara\\" (T3)", corte no meio') } } as unknown as Env;
    expect(await acLabel(raw, 't3_fake', 'es')).toBe('Capa "rara" (T3)');
    expect(await acLabel(raw, 'T3_FAK', 'es')).toBeNull();
  });
});

describe('acIndex em português: grão-mestre', () => {
  it('"grão-mestre" é o T7 (antes virava t7 + t6 e não achava nada)', async () => {
    expect(parseAcQuery('bolsa grão-mestre')).toEqual({ words: ['bolsa'], exact: ['t7'] });
    expect((await acSearch(env, 'bolsa grao mestre', 3))[0].id).toBe('T7_BAG');
    expect(parseAcQuery('bolsa mestre')).toEqual({ words: ['bolsa'], exact: ['t6'] });
  });
});

describe('itemsClient escolhe o índice pela língua', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const tiny = (name: string): ItemsIndex => ({ v: 1, generatedAt: '', source: '', items: [['T4_BAG', name, "Adept's Bag", 4, 0]] });

  it('pt lê items-index.json; es lê items-index-es.json; um fetch por língua', async () => {
    const fetch = vi.fn(async (url: string) =>
      Response.json(url.endsWith('-es.json') ? tiny('Bolsa del iniciado') : tiny('Bolsa do Adepto')),
    );
    vi.stubGlobal('fetch', fetch);
    const { loadIndex, indexUrl } = await import('../src/lib/itemsClient');
    expect(indexUrl()).toBe('/data/items-index.json'); // fora do navegador a língua é pt
    expect(indexUrl('es')).toBe('/data/items-index-es.json');
    expect(itemName(await loadIndex(), 'T4_BAG')).toBe('Bolsa do Adepto');
    expect(itemName(await loadIndex('es'), 'T4_BAG')).toBe('Bolsa del iniciado');
    await loadIndex('es');
    await loadIndex('pt');
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['/data/items-index.json', '/data/items-index-es.json']);
  });
  it('segue getLocale() quando a língua muda', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(tiny(url))));
    const i18n = await import('../src/lib/i18n/index.svelte');
    const { loadIndex } = await import('../src/lib/itemsClient');
    i18n.setLocale('es');
    expect((await loadIndex()).items[0][1]).toBe('/data/items-index-es.json');
    i18n.setLocale('pt');
    expect((await loadIndex()).items[0][1]).toBe('/data/items-index.json');
  });
  it('erro em espanhol na tela em espanhol, e não fica no cache', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (n++ === 0 ? new Response('x', { status: 500 }) : Response.json(tiny('ok')))));
    const { loadIndex } = await import('../src/lib/itemsClient');
    await expect(loadIndex('es')).rejects.toThrow('No se pudo cargar la lista de objetos (HTTP 500)');
    expect((await loadIndex('es')).items[0][1]).toBe('ok');
  });
});
