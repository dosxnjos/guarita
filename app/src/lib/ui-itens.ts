// Índice de itens do app (busca do preço rápido e do formulário de alertas).
// Ordem: memória → cópia local (Cache Storage do WebView2, que todas as janelas do app dividem) → rede pela API
// (plugin-http). Com cópia local, a janela abre na hora, mesmo sem internet; se a cópia passou de 24 h, a rede é
// consultada em segundo plano e a versão nova vale a partir da próxima abertura. Cada janela tem a sua memória,
// por isso a cópia local: sem ela, abrir o preço rápido baixaria 1 MB toda vez.
//
// Língua: um índice por língua (o espanhol é o /data/items-index-es.json, mesmo formato com o nome ES na posição do
// nome PT), cada um com a sua cópia local (chave = a URL). A troca de língua remonta a tela, que pede o da língua nova.
import { searchItems, warmItemsIndex, type ItemHit, type ItemsIndex } from '../../../shared/items';
import { currentLocale, type Locale } from '../../../src/lib/i18n/core';
import { api, itemsIndexUrl } from './api';

export const ITENS_IDADE_MAX_MS = 24 * 60 * 60_000;
const CACHE_NAME = 'guarita-app-itens-v1';
const SALVO_EM = 'x-guarita-salvo-em';

export function indiceValido(x: unknown): x is ItemsIndex {
  const o = x as ItemsIndex | null;
  return !!o && o.v === 1 && Array.isArray(o.items) && o.items.length > 0;
}

/** Onde a cópia local mora (Cache Storage no app; memória nos testes). */
export interface CopiaLocal {
  ler(): Promise<{ index: ItemsIndex; salvoEm: number } | null>;
  gravar(index: ItemsIndex, quando: number): Promise<void>;
}

/** Cache Storage: pode não existir ou falhar; tudo opcional (sem cópia, só a rede). Chave = URL do índice da língua. */
export function copiaCacheStorage(url: string = itemsIndexUrl('pt')): CopiaLocal {
  const abrir = async (): Promise<Cache | null> => {
    try {
      return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
    } catch {
      return null;
    }
  };
  return {
    async ler() {
      try {
        const c = await abrir();
        const r = c ? await c.match(url) : undefined;
        if (!r) return null;
        const index: unknown = await r.json();
        const salvoEm = Number(r.headers.get(SALVO_EM)) || 0;
        return indiceValido(index) ? { index, salvoEm } : null;
      } catch {
        return null;
      }
    },
    async gravar(index, quando) {
      try {
        const c = await abrir();
        if (!c) return;
        const body = JSON.stringify(index);
        await c.put(url, new Response(body, { headers: { 'content-type': 'application/json', [SALVO_EM]: String(quando) } }));
      } catch {
        // sem cópia local: a próxima abertura baixa de novo
      }
    },
  };
}

export interface CarregadorDeps {
  baixar: () => Promise<ItemsIndex>;
  copia: CopiaLocal;
  now?: () => number;
  /** Pré-normaliza a busca depois de carregar (padrão: quando a janela estiver ociosa). */
  aquecer?: (index: ItemsIndex) => void;
}

export interface CarregadorItens {
  carregar(): Promise<ItemsIndex>;
}

export function criarCarregadorItens(deps: CarregadorDeps): CarregadorItens {
  const now = deps.now ?? (() => Date.now());
  let memo: Promise<ItemsIndex> | null = null;

  async function daRede(): Promise<ItemsIndex> {
    const index = await deps.baixar();
    if (!indiceValido(index)) throw new Error('formato inesperado'); // igual em espanhol
    await deps.copia.gravar(index, now());
    return index;
  }

  async function carregarUmaVez(): Promise<ItemsIndex> {
    const local = await deps.copia.ler();
    if (local) {
      if (now() - local.salvoEm > ITENS_IDADE_MAX_MS) daRede().catch(() => {}); // atualiza para a próxima abertura
      return local.index;
    }
    try {
      return await daRede();
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : String(err);
      throw new Error(
        currentLocale() === 'es'
          ? `No fue posible cargar la lista de objetos (${detalhe}). Revisa la conexión e inténtalo de nuevo.`
          : `Não foi possível carregar a lista de itens (${detalhe}). Confira a conexão e tente de novo.`,
      );
    }
  }

  return {
    carregar() {
      if (!memo) {
        memo = carregarUmaVez().then(
          (index) => {
            deps.aquecer?.(index);
            return index;
          },
          (err: unknown) => {
            memo = null; // deixa tentar de novo
            throw err;
          },
        );
      }
      return memo;
    },
  };
}

function aquecerQuandoOcioso(index: ItemsIndex): void {
  const run = () => warmItemsIndex(index);
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(run, { timeout: 2000 });
  else setTimeout(run, 0);
}

const carregadores = new Map<Locale, CarregadorItens>();

/** Índice de itens desta janela na língua pedida (padrão: a do app; uma carga por língua; cópia local compartilhada). */
export function carregarItens(loc: Locale = currentLocale()): Promise<ItemsIndex> {
  let c = carregadores.get(loc);
  if (!c) {
    c = criarCarregadorItens({
      baixar: async () => (await api.itemsIndex(loc)).data,
      copia: copiaCacheStorage(itemsIndexUrl(loc)),
      aquecer: aquecerQuandoOcioso,
    });
    carregadores.set(loc, c);
  }
  return c.carregar();
}

/** Busca tolerante (nome da língua do índice, EN, id, "t4.1 bolsa"). Nunca lança: erro de busca vira lista vazia. */
export function buscarItens(index: ItemsIndex, q: string, limite = 8): ItemHit[] {
  try {
    return searchItems(index, q, limite);
  } catch {
    return [];
  }
}
