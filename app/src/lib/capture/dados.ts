// Dados de apoio da captura, baixados pelo painel e entregues ao Rust:
// - tabela de códigos (app/capture-codes.json do repositório; vale a de versão maior que a embutida no app);
// - lista de itens do ao-bin-dumps (formatted/items.txt: "  123: T4_BAG  : Adept's Bag"), para o índice numérico
//   do loot virar o id do item;
// - lista de mapas do ao-bin-dumps (formatted/world.txt: "3004: Martlock"), para o id do mapa virar nome.
// Cópia local no Cache Storage (todas as janelas dividem); refeita a cada 24 h; sem rede, vale a cópia.
// Escopo de rede: estas três URLs exatas, só na capability do painel (src-tauri/capabilities/painel.json).
import { isTauri } from '../windows';

export const URL_CODIGOS = 'https://raw.githubusercontent.com/dosxnjos/guarita/main/app/capture-codes.json';
export const URL_ITENS = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.txt';
export const URL_MAPAS = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/world.txt';
export const DADOS_IDADE_MAX_MS = 24 * 60 * 60_000;
const CACHE_NAME = 'guarita-app-captura-v1';
const SALVO_EM = 'x-guarita-salvo-em';
const TIMEOUT_MS = 30_000;

/** `items.txt` → lista em que a posição é o índice numérico do item no jogo (posições sem item ficam ""). */
export function parseItensTxt(txt: string): string[] {
  const out: string[] = [];
  for (const linha of txt.split(/\r?\n/)) {
    const m = /^\s*(\d+):\s*([A-Z0-9_@]+)\s*(?::|$)/.exec(linha);
    if (!m) continue;
    const i = Number(m[1]);
    if (!Number.isInteger(i) || i < 0 || i > 200_000) continue;
    while (out.length < i) out.push('');
    out[i] = m[2];
  }
  return out;
}

/** `world.txt` → id do mapa → nome. */
export function parseMapasTxt(txt: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const linha of txt.split(/\r?\n/)) {
    const m = /^([^:\s]+):\s*(.+?)\s*$/.exec(linha);
    if (m && m[2]) out[m[1]] = m[2];
  }
  return out;
}

export type BaixarTexto = (url: string) => Promise<string>;

let tauriFetch: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

/** Baixa texto com prazo (plugin-http no app, fetch no navegador). */
export const baixarTexto: BaixarTexto = async (url) => {
  let f: (url: string, init?: RequestInit) => Promise<Response>;
  if (isTauri()) {
    tauriFetch ??= (await import('@tauri-apps/plugin-http')).fetch;
    f = tauriFetch;
  } else {
    f = (u, i) => fetch(u, i);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await f(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
};

export interface CopiaTexto {
  ler(url: string): Promise<{ texto: string; salvoEm: number } | null>;
  gravar(url: string, texto: string, quando: number): Promise<void>;
}

export function copiaCacheStorage(): CopiaTexto {
  const abrir = async (): Promise<Cache | null> => {
    try {
      return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
    } catch {
      return null;
    }
  };
  return {
    async ler(url) {
      try {
        const r = await (await abrir())?.match(url);
        if (!r) return null;
        return { texto: await r.text(), salvoEm: Number(r.headers.get(SALVO_EM)) || 0 };
      } catch {
        return null;
      }
    },
    async gravar(url, texto, quando) {
      try {
        await (await abrir())?.put(url, new Response(texto, { headers: { [SALVO_EM]: String(quando) } }));
      } catch {
        // sem cópia: baixa de novo na próxima abertura
      }
    },
  };
}

/**
 * Texto da URL: cópia local nova → cópia; velha ou sem cópia → rede (e grava); rede falhou → cópia velha;
 * nada → erro.
 */
export async function textoComCopia(
  url: string,
  deps: { baixar?: BaixarTexto; copia?: CopiaTexto; agora?: () => number } = {},
): Promise<string> {
  const baixar = deps.baixar ?? baixarTexto;
  const copia = deps.copia ?? copiaCacheStorage();
  const agora = deps.agora ?? Date.now;
  const salvo = await copia.ler(url);
  if (salvo && agora() - salvo.salvoEm < DADOS_IDADE_MAX_MS) return salvo.texto;
  try {
    const texto = await baixar(url);
    await copia.gravar(url, texto, agora());
    return texto;
  } catch (e) {
    if (salvo) return salvo.texto;
    throw e;
  }
}
