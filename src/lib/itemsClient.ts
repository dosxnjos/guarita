// Carrega o índice de itens no navegador (uma vez, com cache). Dono: módulo (a).
// Ordem: memória → Cache Storage (abre na hora, mesmo offline) → rede. Com cópia no Cache Storage, a rede é
// consultada em segundo plano e a versão nova vale a partir da próxima abertura (o arquivo muda raramente).
import { warmItemsIndex, type ItemsIndex } from '../../shared/items';

const INDEX_URL = '/data/items-index.json';
const CACHE_NAME = 'guarita-items-v1';

let memo: Promise<ItemsIndex> | null = null;

function valid(x: unknown): x is ItemsIndex {
  const o = x as ItemsIndex | null;
  return !!o && o.v === 1 && Array.isArray(o.items) && o.items.length > 0;
}

/** Cache Storage só existe em contexto seguro (https/localhost) e pode falhar em aba anônima: tudo opcional. */
async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
  } catch {
    return null;
  }
}

async function fromCache(cache: Cache | null): Promise<ItemsIndex | null> {
  if (!cache) return null;
  try {
    const res = await cache.match(INDEX_URL);
    if (!res) return null;
    const data: unknown = await res.json();
    return valid(data) ? data : null;
  } catch {
    return null;
  }
}

async function fromNetwork(cache: Cache | null): Promise<ItemsIndex> {
  const res = await fetch(INDEX_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const copy = res.clone();
  const data: unknown = await res.json();
  if (!valid(data)) throw new Error('formato inesperado');
  if (cache) cache.put(INDEX_URL, copy).catch(() => {});
  return data;
}

/** Pré-normaliza a busca quando o navegador estiver ocioso, para a primeira digitação já responder na hora. */
function warmLater(index: ItemsIndex): void {
  const run = () => warmItemsIndex(index);
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 2000 });
  else setTimeout(run, 0);
}

async function load(): Promise<ItemsIndex> {
  const cache = await openCache();
  const cached = await fromCache(cache);
  if (cached) {
    fromNetwork(cache).catch(() => {}); // atualiza a cópia para a próxima visita
    return cached;
  }
  try {
    return await fromNetwork(cache);
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    throw new Error(`Não foi possível carregar a lista de itens (${detalhe}). Verifique a conexão e tente de novo.`);
  }
}

export async function loadIndex(): Promise<ItemsIndex> {
  if (!memo) {
    memo = load().then(
      (index) => {
        warmLater(index);
        return index;
      },
      (err: unknown) => {
        memo = null; // permite tentar de novo
        throw err;
      },
    );
  }
  return memo;
}
