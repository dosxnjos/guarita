// Cache genérico sobre a Cache API (caches.default) com URL sintética https://cache.guarita/<chave>.
// Guarda por bem mais tempo que o TTL (janela de reserva) para poder devolver o último valor bom quando a
// fonte falhar (429, 5xx, timeout). Fresco ou velho quem decide é o carimbo x-guarita-at, não a Cache API.
// Sem caches (vitest, ambiente sem Cache API) ou com o put virando no-op (*.workers.dev), só chama o loader.

const CACHE_ORIGIN = 'https://cache.guarita/';
/** Quanto tempo além do TTL o valor fica guardado como reserva para erro da fonte. */
export const STALE_WINDOW_S = 24 * 3600;

export interface Cached<T> {
  data: T;
  /** Quando o valor foi buscado na fonte (ISO UTC). */
  at: string;
  /** true se veio da reserva porque a fonte falhou. */
  stale: boolean;
}

interface CtxLike {
  waitUntil(promise: Promise<unknown>): void;
}

function defaultCache(): Cache | null {
  try {
    const c = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

export function cacheUrl(key: string): string {
  return CACHE_ORIGIN + key.replace(/^\/+/, '');
}

/** Igual a cachedJson, mas devolve também quando o dado foi buscado e se é reserva. */
export async function cachedJsonMeta<T>(
  key: string,
  ttlSeconds: number,
  ctx: CtxLike | undefined,
  loader: () => Promise<T>,
): Promise<Cached<T>> {
  const cache = defaultCache();
  const url = cacheUrl(key);
  let old: Cached<T> | null = null;

  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) {
        const at = hit.headers.get('x-guarita-at') ?? '';
        const data = (await hit.json()) as T;
        const age = (Date.now() - Date.parse(at)) / 1000;
        if (Number.isFinite(age) && age >= 0 && age < ttlSeconds) return { data, at, stale: false };
        old = { data, at, stale: true };
      }
    } catch {
      old = null; // entrada corrompida: trata como ausente
    }
  }

  let data: T;
  try {
    data = await loader();
  } catch (err) {
    if (old) {
      console.warn('cache: fonte falhou, devolvendo reserva', key, String(err));
      return old;
    }
    throw err;
  }

  const at = new Date().toISOString();
  if (cache) {
    const res = new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${ttlSeconds + STALE_WINDOW_S}`,
        'x-guarita-at': at,
      },
    });
    const put = cache.put(url, res).catch((e) => console.warn('cache: put falhou', key, String(e)));
    if (ctx) ctx.waitUntil(put);
    else await put;
  }
  return { data, at, stale: false };
}

/** Lê do cache se ainda fresco; senão chama o loader e guarda. Fonte falhou e há reserva → devolve a reserva. */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  ctx: CtxLike | undefined,
  loader: () => Promise<T>,
): Promise<T> {
  return (await cachedJsonMeta(key, ttlSeconds, ctx, loader)).data;
}
