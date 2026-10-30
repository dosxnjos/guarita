// Carrega /data/items-index.json dos arquivos estáticos e guarda em memória. Dono: módulo (a).
// O índice fica numa variável global do isolate: só o primeiro request de um isolate frio paga o JSON.parse (~1 MB).
import type { Env } from '../env';
import type { ItemsIndex } from '../../shared/items';

const INDEX_PATH = '/data/items-index.json';
// O binding ASSETS ignora o host; só precisa de URL absoluta.
const ASSETS_ORIGIN = 'https://assets.local';

let cached: Promise<ItemsIndex> | null = null;

/** Confere o formato mínimo antes de guardar (arquivo truncado ou HTML de fallback não entram no cache). */
export function isItemsIndex(x: unknown): x is ItemsIndex {
  const o = x as ItemsIndex | null;
  return !!o && o.v === 1 && Array.isArray(o.items) && o.items.length > 0 && Array.isArray(o.items[0]);
}

async function fetchIndex(env: Env): Promise<ItemsIndex> {
  const res = await env.ASSETS.fetch(new Request(ASSETS_ORIGIN + INDEX_PATH));
  if (!res.ok) throw new Error(`índice de itens indisponível (HTTP ${res.status})`);
  const data: unknown = await res.json();
  if (!isItemsIndex(data)) throw new Error('índice de itens em formato inesperado');
  return data;
}

export async function loadItemsIndex(env: Env): Promise<ItemsIndex> {
  if (!cached) {
    // Guarda a promessa (requests simultâneos no isolate frio dividem a mesma leitura); falhou → tenta de novo depois.
    cached = fetchIndex(env).catch((err: unknown) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Só para testes: esquece o índice em memória. */
export function resetItemsIndexCache(): void {
  cached = null;
}
