import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findItem,
  itemName,
  normalize,
  parseQuery,
  searchItems,
  tierLabel,
  warmItemsIndex,
  type ItemsIndex,
} from '../shared/items';
import { loadItemsIndex, resetItemsIndexCache } from '../worker/lib/items';
import type { Env } from '../worker/env';

// O tsconfig não carrega @types/node (o código roda em Workers); o fs entra tipado à mão, como em helpers/net.ts.
const NODE_FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(p: URL, enc: 'utf8'): string };

const raw = readFileSync(new URL('../public/data/items-index.json', import.meta.url), 'utf8');
const index = JSON.parse(raw) as ItemsIndex;
const ids = (q: string, n = 5) => searchItems(index, q, n).map((h) => h.id);
const first = (q: string) => searchItems(index, q, 1)[0]?.id;

describe('items-index.json gerado', () => {
  it('formato e tamanho', () => {
    expect(index.v).toBe(1);
    expect(index.items.length).toBeGreaterThan(11000);
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThan(1.2 * 1024 * 1024); // bytes, não caracteres
  });
  it('tier e encantamento batem com o id; todo item tem nome', () => {
    for (const [id, pt, en, tier, ench] of index.items) {
      expect(pt || en).toBeTruthy();
      expect(tier).toBe(/^T(\d)_/.test(id) ? Number(id[1]) : 0);
      expect(ench).toBe(/@(\d+)$/.test(id) ? Number(id.split('@')[1]) : 0);
    }
  });
  it('variante encantada mantém o nome', () => {
    expect(findItem(index, 'T4_BAG@1')).toEqual(['T4_BAG@1', 'Bolsa do Adepto', "Adept's Bag", 4, 1]);
  });
});

describe('normalização e leitura da busca', () => {
  it('tira acento, caixa e apóstrofo', () => {
    expect(normalize("Bolsa do Grão-mestre")).toBe('bolsa do grao mestre');
    expect(normalize("Adept's Bag")).toBe('adepts bag');
  });
  it('lê tier e encantamento', () => {
    expect(parseQuery('t4')).toMatchObject({ tier: 4, ench: null });
    expect(parseQuery('T4.1 bolsa')).toMatchObject({ tier: 4, ench: 1, core: 'bolsa' });
    expect(parseQuery('4.1')).toMatchObject({ tier: 4, ench: 1 });
    expect(parseQuery('4.0')).toMatchObject({ tier: 4, ench: 0 });
    expect(parseQuery('bolsa 4')).toMatchObject({ tier: null, core: 'bolsa 4' }); // número solto não é tier
  });
  it('nome de tier vira termo de tier e sai do miolo', () => {
    const p = parseQuery('bolsa do grão-mestre');
    expect(p.core).toBe('bolsa');
    expect(p.tokens.map((t) => t.tierWord)).toEqual([0, 7]);
  });
});

describe('searchItems', () => {
  it('exemplos do plano', () => {
    expect(first('bolsa adepto')).toBe('T4_BAG');
    expect(ids('bolsa adepto')).toEqual(['T4_BAG', 'T4_BAG@1', 'T4_BAG@2', 'T4_BAG@3', 'T4_BAG@4']);
    expect(first('couro t5.2')).toBe('T5_LEATHER_LEVEL2@2');
    expect(first('capa de thetford')).toBe('T4_CAPEITEM_FW_THETFORD');
    const espadas = searchItems(index, 't6 espada', 10);
    expect(espadas.length).toBe(10);
    for (const h of espadas) {
      expect(h.tier).toBe(6);
      expect(normalize(h.pt).startsWith('espada')).toBe(true);
    }
    expect(searchItems(index, 'merc', 20).some((h) => h.pt.includes('Mercenário'))).toBe(true);
  });
  it('id direto e começo de id', () => {
    expect(first('T4_BAG')).toBe('T4_BAG');
    expect(first('t4_bag@2')).toBe('T4_BAG@2');
    expect(first('T4_CAPEITEM_FW_THET')).toBe('T4_CAPEITEM_FW_THETFORD');
  });
  it('nome EN e tier em EN/PT', () => {
    expect(first('adepts bag')).toBe('T4_BAG');
    expect(first("Elder's Bag")).toBe('T8_BAG');
    expect(first('grao mestre bolsa')).toBe('T7_BAG');
    expect(first('bolsa grão-mestre')).toBe('T7_BAG');
    expect(first('bolsa novato')).toBe('T2_BAG');
    expect(first('bolsa iniciante')).toBe('T3_BAG'); // no PT-BR do jogo T3 = Iniciante
    expect(first('bolsa jornaleiro')).toBe('T3_BAG');
    expect(first('master bag')).toBe('T6_BAG');
  });
  it('sem acento, sem caixa, ordem livre, prefixo', () => {
    expect(first('POCAO DE CURA')).toBe('T4_POTION_HEAL');
    expect(first('cura poção')).toBe('T4_POTION_HEAL');
    expect(first('bols')).toBe('T2_BAG');
    expect(first('thetford capa')).toBe('T4_CAPEITEM_FW_THETFORD');
  });
  it('sinônimos BR achando recurso pelo id', () => {
    expect(first('madeira t4')).toBe('T4_WOOD');
    expect(first('tora t5')).toBe('T5_WOOD');
    expect(first('barra 4.0')).toBe('T4_METALBAR');
    expect(first('tabua t4.1')).toBe('T4_PLANKS_LEVEL1@1');
    expect(first('fibra t6')).toBe('T6_FIBER');
    expect(first('minerio t4.3')).toBe('T4_ORE_LEVEL3@3');
    expect(first('tecido t4')).toBe('T4_CLOTH');
    expect(first('bloco t4')).toBe('T4_STONEBLOCK');
    expect(first('pedra t4')).toBe('T4_ROCK');
    expect(ids('pele t4', 5)).toContain('T4_HIDE');
    expect(searchItems(index, 'montaria t5', 30).some((h) => h.id === 'T5_MOUNT_HORSE')).toBe(true);
    expect(searchItems(index, 'cavalo t5', 10).some((h) => h.id === 'T5_MOUNT_HORSE')).toBe(true);
  });
  it('filtro de tier é rígido e AND entre termos', () => {
    for (const h of searchItems(index, 'couro t5.2', 50)) expect([h.tier, h.ench]).toEqual([5, 2]);
    for (const h of searchItems(index, '4.0 bolsa', 50)) expect([h.tier, h.ench]).toEqual([4, 0]);
    expect(searchItems(index, 'bolsa zzzzqqq')).toEqual([]);
  });
  it('limite e entradas vazias', () => {
    expect(searchItems(index, 'bolsa', 3)).toHaveLength(3);
    expect(searchItems(index, '')).toEqual([]);
    expect(searchItems(index, '   ')).toEqual([]);
    expect(searchItems(index, 'de do da')).toEqual([]);
    expect(searchItems(index, 'bolsa', 0)).toEqual([]);
    expect(searchItems({ v: 1, generatedAt: '', source: '', items: [] }, 'bolsa')).toEqual([]);
  });
  it('item só com nome EN aparece com o nome EN', () => {
    const h = searchItems(index, 'dragonknight helmet', 1)[0];
    expect(h.id).toBe('T8_HEAD_PLATE_PROTOTYPE');
    expect(h.pt).toBe('Dragonknight Helmet');
  });
  it('rápido depois de preparado (< 5 ms)', () => {
    warmItemsIndex(index); // o navegador faz isso em momento ocioso (itemsClient)
    for (const q of ['bolsa adepto', 'comida', 'pedra', 'merc', 't4', 'capa de thetford', 'adepto']) {
      let best = Infinity; // melhor de 3: tira ruído de GC da máquina de teste
      for (let r = 0; r < 3; r++) {
        const t0 = performance.now();
        searchItems(index, q);
        best = Math.min(best, performance.now() - t0);
      }
      expect(best).toBeLessThan(5);
    }
  });
  it('nomes do protótipo de objeto não quebram a busca', () => {
    expect(() => searchItems(index, 'constructor toString __proto__')).not.toThrow();
    expect(parseQuery('constructor').tokens[0]).toMatchObject({ tierWord: 0, alts: [] });
  });
});

describe('itemName e tierLabel', () => {
  it('cai de PT para EN e para o id', () => {
    expect(itemName(index, 'T4_BAG')).toBe('Bolsa do Adepto');
    expect(itemName(index, 't4_bag')).toBe('Bolsa do Adepto');
    expect(itemName(index, 'T8_HEAD_PLATE_PROTOTYPE')).toBe('Dragonknight Helmet');
    expect(itemName(index, 'NAO_EXISTE')).toBe('NAO_EXISTE');
  });
  it('rótulo de tier', () => {
    expect(tierLabel(4, 1)).toBe('T4.1');
    expect(tierLabel(4, 0)).toBe('T4');
    expect(tierLabel(0, 0)).toBe('');
  });
});

describe('loadItemsIndex (Worker)', () => {
  afterEach(() => resetItemsIndexCache());
  const envWith = (fetch: (r: Request) => Promise<Response>) => ({ ASSETS: { fetch } }) as unknown as Env;

  it('busca uma vez e reaproveita no isolate', async () => {
    const fetch = vi.fn(async (r: Request) => {
      expect(new URL(r.url).pathname).toBe('/data/items-index.json');
      return new Response(raw, { headers: { 'content-type': 'application/json' } });
    });
    const env = envWith(fetch);
    const [a, b] = await Promise.all([loadItemsIndex(env), loadItemsIndex(env)]);
    const c = await loadItemsIndex(env);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a.items.length).toBe(index.items.length);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('erro não fica no cache: próxima chamada tenta de novo', async () => {
    let n = 0;
    const env = envWith(async () => (n++ === 0 ? new Response('x', { status: 404 }) : new Response(raw)));
    await expect(loadItemsIndex(env)).rejects.toThrow('HTTP 404');
    await expect(loadItemsIndex(env)).resolves.toMatchObject({ v: 1 });
  });
  it('rejeita conteúdo que não é o índice', async () => {
    const env = envWith(async () => new Response('{"ok":true}'));
    await expect(loadItemsIndex(env)).rejects.toThrow('formato inesperado');
  });
});
