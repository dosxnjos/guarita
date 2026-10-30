// Carrega o índice de itens no navegador (uma vez por língua, com cache). Dono: módulo (a).
// Ordem: memória → Cache Storage (abre na hora, mesmo offline) → rede. Com cópia no Cache Storage, a rede é
// consultada em segundo plano e a versão nova vale a partir da próxima abertura (o arquivo muda raramente).
// Língua: em /es/... carrega /data/items-index-es.json, MESMO formato com o nome em espanhol na posição do nome
// localizado (ItemTuple[1]); assim searchItems, itemName e hit.pt de shared/items.ts devolvem o nome ES sem mudar
// nada nas telas. A troca de língua remonta a tela (App.svelte), que chama loadIndex() de novo.
import { warmItemsIndex, type ItemsIndex } from '../../shared/items';
import { getLocale, type Locale } from './i18n/index.svelte';

const INDEX_URLS: Record<Locale, string> = {
  pt: '/data/items-index.json',
  es: '/data/items-index-es.json',
};
const CACHE_NAME = 'guarita-items-v1';

/** Endereço do índice de itens de uma língua (padrão: a língua atual). */
export function indexUrl(locale: Locale = getLocale()): string {
  return INDEX_URLS[locale] ?? INDEX_URLS.pt;
}

const memo = new Map<string, Promise<ItemsIndex>>();

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

async function fromCache(cache: Cache | null, url: string): Promise<ItemsIndex | null> {
  if (!cache) return null;
  try {
    const res = await cache.match(url);
    if (!res) return null;
    const data: unknown = await res.json();
    return valid(data) ? data : null;
  } catch {
    return null;
  }
}

async function fromNetwork(cache: Cache | null, url: string): Promise<ItemsIndex> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const copy = res.clone();
  const data: unknown = await res.json();
  if (!valid(data)) throw new Error('formato inesperado');
  if (cache) cache.put(url, copy).catch(() => {});
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

async function load(url: string, locale: Locale): Promise<ItemsIndex> {
  const cache = await openCache();
  const cached = await fromCache(cache, url);
  if (cached) {
    fromNetwork(cache, url).catch(() => {}); // atualiza a cópia para a próxima visita
    return cached;
  }
  try {
    return await fromNetwork(cache, url);
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    throw new Error(
      locale === 'es'
        ? `No se pudo cargar la lista de objetos (${detalhe}). Revisa la conexión e inténtalo de nuevo.`
        : `Não foi possível carregar a lista de itens (${detalhe}). Verifique a conexão e tente de novo.`,
    );
  }
}

/** Índice de itens na língua atual (ou na pedida): nome localizado em ItemTuple[1], EN em ItemTuple[2]. */
export async function loadIndex(locale: Locale = getLocale()): Promise<ItemsIndex> {
  const url = indexUrl(locale);
  let p = memo.get(url);
  if (!p) {
    p = load(url, locale).then(
      (index) => {
        warmLater(index);
        return index;
      },
      (err: unknown) => {
        memo.delete(url); // permite tentar de novo
        throw err;
      },
    );
    memo.set(url, p);
  }
  return p;
}
