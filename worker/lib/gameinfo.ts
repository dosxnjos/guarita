// Cliente do killboard oficial (gameinfo). Dono: módulo (c). A API é lenta (0,4 s a 60 s) e devolve 502 à toa:
// timeout de 25 s, uma nova tentativa em 502/5xx/timeout, cache em duas camadas (memória do isolate para juntar
// pedidos iguais em voo + Cache API via cachedJsonMeta, que guarda reserva para quando a fonte cair).
// O cache guarda o dado JÁ NORMALIZADO (pequeno): JSON.parse de 170 KB a cada acerto custaria CPU à toa.
// Pegadinha: /players/{id}/kills e /deaths respondem 502 com qualquer query (?limit=...); só 10 eventos.
import { GAMEINFO_BASE } from '../../shared/market';
import { cachedJsonMeta } from './cache';

export const GI_TTL = { search: 600, player: 300, events: 180 } as const;
export const GI_TIMEOUT_MS = 25_000;
const USER_AGENT = 'guarita (github.com/dosxnjos/guarita)';

export type GameinfoErrorKind = 'not_found' | 'timeout' | 'upstream' | 'budget';

/** Erro da gameinfo já classificado; a rota traduz em 404/504/502. */
export class GameinfoError extends Error {
  constructor(readonly kind: GameinfoErrorKind, message: string, readonly upstreamStatus: number | null = null) {
    super(message);
    this.name = 'GameinfoError';
  }
}

/**
 * Orçamento de subrequests de uma invocação (plano grátis: 50). Cada ida à rede gasta 1; acerto de cache não gasta.
 * O dossiê roda com 6; a autópsia divide o seu entre a morte, o dossiê do matador e a recompra.
 */
export class Budget {
  used = 0;
  constructor(readonly max: number) {}
  get left(): number {
    return Math.max(0, this.max - this.used);
  }
  take(n = 1): boolean {
    if (this.used + n > this.max) return false;
    this.used += n;
    return true;
  }
}

export interface GiOptions {
  ctx?: ExecutionContext;
  budget?: Budget;
  timeoutMs?: number;
  /** false = sem nova tentativa (usado no dossiê do matador, para a autópsia não esperar 100 s). */
  retry?: boolean;
}

export interface GiResult<T> {
  data: T;
  /** Quando o dado foi buscado na gameinfo (ISO UTC). */
  at: string;
  /** true se veio da reserva porque a gameinfo falhou agora. */
  stale: boolean;
}

/** Uma ida à gameinfo com timeout. Classifica o erro; não tenta de novo (quem tenta é gameinfoFetch). */
async function fetchOnce(path: string, timeoutMs: number): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(GAMEINFO_BASE + path, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'User-Agent': USER_AGENT },
      signal: ac.signal,
    });
  } catch (err) {
    const aborted = ac.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    throw aborted
      ? new GameinfoError('timeout', `gameinfo: sem resposta em ${timeoutMs} ms`)
      : new GameinfoError('upstream', `gameinfo: falha de rede (${String(err)})`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) throw new GameinfoError('not_found', 'gameinfo: não encontrado', 404);
  if (!res.ok) throw new GameinfoError('upstream', `gameinfo: HTTP ${res.status}`, res.status);
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new GameinfoError('timeout', 'gameinfo: corpo interrompido');
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // A gameinfo às vezes devolve página HTML de erro com 200.
    throw new GameinfoError('upstream', 'gameinfo: resposta não é JSON');
  }
  if (data === null) throw new GameinfoError('not_found', 'gameinfo: resposta vazia');
  return data;
}

/** GET na gameinfo com orçamento, timeout e 1 nova tentativa em 5xx/timeout/rede (nunca em 404). */
export async function gameinfoFetch(path: string, opts: GiOptions = {}): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? GI_TIMEOUT_MS;
  const attempts = opts.retry === false ? 1 : 2;
  let last: GameinfoError | null = null;
  for (let i = 0; i < attempts; i++) {
    if (opts.budget && !opts.budget.take()) {
      throw last ?? new GameinfoError('budget', 'orçamento de subrequests esgotado');
    }
    try {
      return await fetchOnce(path, timeoutMs);
    } catch (err) {
      if (!(err instanceof GameinfoError)) throw err;
      if (err.kind === 'not_found') throw err;
      last = err;
    }
  }
  throw last ?? new GameinfoError('upstream', 'gameinfo: falha');
}

// Camada de memória: junta pedidos iguais em voo e reaproveita o resultado dentro do TTL no mesmo isolate.
const MEM_MAX = 64;
const mem = new Map<string, { exp: number; value: Promise<GiResult<unknown>> }>();

/** Só para testes: esvazia o cache em memória. */
export function _resetGameinfoMemory(): void {
  mem.clear();
}

/**
 * Busca + normaliza + guarda. `normalize` recebe o JSON cru e devolve a forma enxuta que vai para o cache.
 * Fonte caiu e há reserva na Cache API → devolve a reserva com stale=true.
 */
export async function gameinfoCached<T>(
  path: string,
  ttlSeconds: number,
  normalize: (raw: unknown) => T,
  opts: GiOptions = {},
): Promise<GiResult<T>> {
  const now = Date.now();
  const hit = mem.get(path);
  if (hit && hit.exp > now) return hit.value as Promise<GiResult<T>>;

  const value = cachedJsonMeta<T>(`gameinfo${path}`, ttlSeconds, opts.ctx, async () =>
    normalize(await gameinfoFetch(path, opts)),
  );
  const entry = { exp: now + ttlSeconds * 1000, value };
  mem.set(path, entry);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string);
  value.then(
    // Reserva (fonte fora) fica pouco na memória: daqui a 30 s vale tentar a fonte de novo.
    (r) => { if (r.stale) entry.exp = Math.min(entry.exp, Date.now() + 30_000); },
    () => { if (mem.get(path) === entry) mem.delete(path); },
  );
  return value;
}

/** Caminhos da gameinfo (o id já validado pela rota; encode por garantia). */
export const giPath = {
  search: (q: string) => `/search?q=${encodeURIComponent(q)}`,
  player: (id: string) => `/players/${encodeURIComponent(id)}`,
  kills: (id: string) => `/players/${encodeURIComponent(id)}/kills`,
  deaths: (id: string) => `/players/${encodeURIComponent(id)}/deaths`,
};
