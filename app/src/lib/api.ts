// Cliente da API pública da Guarita (contrato em ../../../shared/types.ts, doc em ../../../docs/CONTRATO-API.md).
// Telas e motor importam daqui; nunca `fetch` solto.
//
// Por que não o `fetch` do navegador: a API do site não manda cabeçalho CORS para /api/*, e o WebView2 do app roda
// na origem http://tauri.localhost. Dentro do app as chamadas saem pelo tauri-plugin-http (lado Rust, sem CORS),
// com escopo limitado a https://guarita.pages.dev/* nas capabilities. No navegador (vite:dev) usa o fetch comum.
//
// Cache em memória por URL com prazo por rota (gameinfo é lenta: dossiê guarda 10 min), uma só requisição em voo
// por URL e timeout com AbortController. Erro sempre como ApiError com mensagem em PT-BR.
import type {
  City,
  ClockResponse,
  ItemResponse,
  PlayerDossier,
  PlayerSearchResponse,
  PricesResponse,
  Quality,
} from '../../../shared/types';
import type { ItemsIndex } from '../../../shared/items';
import { isTauri } from './windows';

export const API_BASE = 'https://guarita.pages.dev';
export const ITEMS_INDEX_URL = `${API_BASE}/data/items-index.json`;

/** Mesma forma do fetch; o tauri-plugin-http e o fetch do navegador servem. */
export type Fetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

export type ApiErrorKind = 'http' | 'timeout' | 'rede' | 'resposta';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: ApiErrorKind,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Prazos de cache em ms. */
export const TTL = {
  item: 60_000,
  prices: 60_000,
  clock: 60_000,
  playerSearch: 5 * 60_000,
  dossier: 10 * 60_000,
  itemsIndex: 24 * 60 * 60_000,
} as const;

export const TIMEOUT_MS = 15_000;
/** gameinfo responde de 0,4 s a 60 s (ARMADILHAS.md): rotas de jogador esperam mais. */
export const TIMEOUT_GAMEINFO_MS = 25_000;
/** O /api/prices aceita até 300 ids por consulta. */
export const MAX_PRICE_IDS = 300;

export interface ApiOptions {
  base?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
  now?: () => number;
}

/** Resposta com a hora em que foi buscada (ms) e se veio do cache em memória. */
export interface Fetched<T> {
  data: T;
  at: number;
  fromCache: boolean;
}

export interface PricesQuery {
  ids: string[];
  cities?: City[];
  qualities?: Quality[];
}

export interface GuaritaApi {
  item(id: string, quality?: Quality): Promise<Fetched<ItemResponse>>;
  prices(q: PricesQuery): Promise<Fetched<PricesResponse>>;
  clock(): Promise<Fetched<ClockResponse>>;
  searchPlayers(q: string): Promise<Fetched<PlayerSearchResponse>>;
  dossier(id: string): Promise<Fetched<PlayerDossier>>;
  /** Índice de itens (~1 MB). Cópia local por 24 h; módulo do preço rápido decide persistir em disco. */
  itemsIndex(): Promise<Fetched<ItemsIndex>>;
  /** Esquece o cache (todo, ou só as URLs que começam com o prefixo). */
  clearCache(prefix?: string): void;
}

let tauriFetch: Fetcher | null = null;

async function defaultFetcher(): Promise<Fetcher> {
  if (isTauri()) {
    if (!tauriFetch) {
      const mod = await import('@tauri-apps/plugin-http');
      tauriFetch = mod.fetch as Fetcher;
    }
    return tauriFetch;
  }
  return (url, init) => fetch(url, init);
}

/**
 * Lê o JSON do corpo, mas desiste quando o sinal aborta: se o stream travar e o fetcher não encerrar o corpo com
 * erro ao abortar, a promessa não fica pendurada (e com ela o cache `inflight` daquela URL).
 */
function lerCorpo(r: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
  return new Promise((ok, falha) => {
    const desistir = () => falha(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', desistir, { once: true });
    r.json().then(
      (v) => {
        signal.removeEventListener('abort', desistir);
        ok(v);
      },
      (e) => {
        signal.removeEventListener('abort', desistir);
        falha(e);
      },
    );
  });
}

export function createApi(opts: ApiOptions = {}): GuaritaApi {
  const base = (opts.base ?? API_BASE).replace(/\/$/, '');
  const now = opts.now ?? (() => Date.now());
  const cache = new Map<string, { at: number; data: unknown }>();
  const inflight = new Map<string, Promise<Fetched<unknown>>>();

  async function raw<T>(url: string, timeoutMs: number): Promise<T> {
    const fetcher = opts.fetcher ?? (await defaultFetcher());
    const ctrl = new AbortController();
    // O prazo vale para a resposta INTEIRA: o fetcher resolve com os cabeçalhos e o corpo chega depois, por stream
    // (plugin-http), sem prazo próprio. Por isso o timer só é limpo depois de ler o corpo.
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const demorou = () =>
      new ApiError(`A Guarita demorou mais de ${Math.round(timeoutMs / 1000)} s para responder. Tente de novo.`, 0, 'timeout');
    let r: Response;
    let body: unknown;
    try {
      try {
        r = await fetcher(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      } catch {
        if (ctrl.signal.aborted) throw demorou();
        throw new ApiError('Sem conexão com a Guarita. Verifique a internet e tente de novo.', 0, 'rede');
      }
      body = await lerCorpo(r, ctrl.signal);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (ctrl.signal.aborted) throw demorou();
      throw new ApiError(`Resposta inválida da Guarita (erro ${r!.status}).`, r!.status, 'resposta');
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) {
      const msg = (body as { error?: string } | null)?.error ?? `Erro ${r.status} na Guarita.`;
      throw new ApiError(msg, r.status, 'http');
    }
    return body as T;
  }

  function get<T>(path: string, ttl: number, timeoutMs = opts.timeoutMs ?? TIMEOUT_MS): Promise<Fetched<T>> {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttl) return Promise.resolve({ data: hit.data as T, at: hit.at, fromCache: true });
    const running = inflight.get(url);
    if (running) return running as Promise<Fetched<T>>;
    const p = raw<T>(url, timeoutMs)
      .then((data) => {
        const at = now();
        cache.set(url, { at, data });
        return { data, at, fromCache: false };
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  const enc = encodeURIComponent;
  return {
    item: (id, quality = 1) => get<ItemResponse>(`/api/item/${enc(id.toUpperCase())}?q=${quality}`, TTL.item),
    prices: ({ ids, cities, qualities }) => {
      const list = [...new Set(ids.map((i) => i.toUpperCase()))];
      if (!list.length) return Promise.reject(new ApiError('Informe ao menos um item.', 400, 'http'));
      if (list.length > MAX_PRICE_IDS) {
        return Promise.reject(new ApiError(`No máximo ${MAX_PRICE_IDS} itens por consulta.`, 400, 'http'));
      }
      let qs = `ids=${enc(list.join(','))}`;
      if (cities?.length) qs += `&cities=${enc(cities.join(','))}`;
      if (qualities?.length) qs += `&q=${qualities.join(',')}`;
      return get<PricesResponse>(`/api/prices?${qs}`, TTL.prices);
    },
    clock: () => get<ClockResponse>('/api/clock', TTL.clock),
    searchPlayers: (q) => get<PlayerSearchResponse>(`/api/player/search?q=${enc(q.trim())}`, TTL.playerSearch, TIMEOUT_GAMEINFO_MS),
    dossier: (id) => get<PlayerDossier>(`/api/player/${enc(id)}`, TTL.dossier, TIMEOUT_GAMEINFO_MS),
    itemsIndex: () => get<ItemsIndex>(ITEMS_INDEX_URL, TTL.itemsIndex, 30_000),
    clearCache: (prefix) => {
      for (const k of [...cache.keys()]) if (!prefix || k.startsWith(prefix) || k.startsWith(`${base}${prefix}`)) cache.delete(k);
    },
  };
}

/** Instância única do app (cada janela tem a sua, com cache próprio). */
export const api = createApi();
