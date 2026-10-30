// Cache curto em memória para não refazer a busca lenta ao ir e voltar entre dossiê e autópsia.
const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, { at: number; p: Promise<unknown> }>();

/** Reaproveita a promessa por 5 min; se ela falhar, sai do cache para o "tentar de novo" buscar de verdade. */
export function cached<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.p as Promise<T>;
  const p = load();
  store.set(key, { at: Date.now(), p });
  p.catch(() => { if (store.get(key)?.p === p) store.delete(key); });
  return p;
}
