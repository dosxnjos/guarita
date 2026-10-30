// Busca de reserva do Worker (isolate frio, limite de 10 ms de CPU) e a troca para a busca completa.
import { describe, expect, it } from 'vitest';
import { isSearchReady, quickSearch, searchItems, type ItemsIndex } from '../shared/items';
import { workerSearch } from '../worker/discord/interactions';

const NODE_FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(p: URL, enc: 'utf8'): string };
const load = () => JSON.parse(readFileSync(new URL('../public/data/items-index.json', import.meta.url), 'utf8')) as ItemsIndex;
const index = load();
const ids = (q: string, n = 5) => quickSearch(index, q, n).map((h) => h.id);

describe('quickSearch', () => {
  it('nome PT com tier', () => {
    expect(ids('bolsa t4', 1)).toEqual(['T4_BAG']);
    expect(ids('bolsa t4.1', 1)).toEqual(['T4_BAG@1']);
    expect(ids('bolsa adepto')).toContain('T4_BAG');
  });
  it('id direto e começo de id', () => {
    expect(ids('T4_BAG@2', 1)).toEqual(['T4_BAG@2']);
    expect(ids('t4_capeitem_fw', 3).every((id) => id.startsWith('T4_CAPEITEM_FW'))).toBe(true);
  });
  it('sinônimo e nome EN', () => {
    expect(ids('madeira t4', 3)).toContain('T4_WOOD');
    expect(ids("elder's bag", 3)).toContain('T8_BAG');
  });
  it('palavra com acento digitada como está', () => {
    expect(ids('poção', 3).length).toBeGreaterThan(0);
  });
  it('vazio e sem resultado', () => {
    expect(quickSearch(index, '', 5)).toEqual([]);
    expect(quickSearch(index, 'zzzqqqxx', 5)).toEqual([]);
    expect(quickSearch(index, 'bolsa', 0)).toEqual([]);
  });
  it('respeita o limite', () => {
    expect(quickSearch(index, 'bolsa', 25)).toHaveLength(25);
  });
});

describe('workerSearch', () => {
  it('frio: busca rápida e agenda o preparo; depois usa a busca completa', async () => {
    const fresh = load(); // objeto novo: cache de preparo vazio
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
    expect(isSearchReady(fresh)).toBe(false);
    const cold = workerSearch(fresh, 'bolsa adepto', 5, ctx);
    expect(cold.map((h) => h.id)).toContain('T4_BAG');
    expect(pending).toHaveLength(1);
    // Depois das microtarefas (quando a resposta já teria saído) o preparo ainda não rodou.
    await Promise.resolve();
    await Promise.resolve();
    expect(isSearchReady(fresh)).toBe(false);
    await Promise.all(pending);
    expect(isSearchReady(fresh)).toBe(true);
    const warm = workerSearch(fresh, 'bolsa adepto', 5, ctx);
    expect(warm).toEqual(searchItems(fresh, 'bolsa adepto', 5));
    expect(pending).toHaveLength(1); // não agenda de novo
  });
});
