// Página /app: qual instalador oferecer. Consulta a última release pública do GitHub (dosxnjos/guarita) no navegador
// de quem abre a página, para o botão nunca prometer um download que não existe (sem release = "Em breve").
// Pura, exceto buscarInstalador. Só o instalador NSIS (`*-setup.exe`) é oferecido: um arquivo só, sem dúvida de qual baixar.
// Textos com `loc` opcional no fim (padrão: a língua atual do site, como em src/lib/format.ts).
import { currentLocale, intlLocaleFor, type Locale } from './i18n/core';

export const RELEASES_URL = 'https://github.com/dosxnjos/guarita/releases';
export const RELEASE_API = 'https://api.github.com/repos/dosxnjos/guarita/releases/latest';

export interface Instalador {
  versao: string;
  nome: string;
  url: string;
  tamanhoBytes: number;
  /** SHA-256 em hexadecimal, quando o GitHub informa (campo `digest` do arquivo). */
  sha256: string | null;
  paginaRelease: string;
}

export type EstadoDownload =
  | { tipo: 'conferindo' }
  | { tipo: 'em-breve' }
  | { tipo: 'pronto'; instalador: Instalador }
  /** A consulta falhou (limite do GitHub, rede): o botão leva à página de releases. */
  | { tipo: 'pagina' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Só aceita endereço de download do próprio repositório no GitHub. */
function urlDoRepo(u: unknown): u is string {
  return typeof u === 'string' && u.startsWith('https://github.com/dosxnjos/guarita/releases/download/');
}

/** Escolhe o instalador `-setup.exe` da resposta de /releases/latest; null se não houver. Pura. */
export function escolherInstalador(release: unknown): Instalador | null {
  return escolherArquivo(release, /-setup\.exe$/i);
}

/** Primeiro arquivo da release cujo nome casa com `nome`, servido do próprio repositório; null se não houver. Pura. */
function escolherArquivo(release: unknown, nome: RegExp): Instalador | null {
  if (!isObj(release) || release.draft === true || release.prerelease === true) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const a = assets.find((x) => isObj(x) && typeof x.name === 'string' && nome.test(x.name) && urlDoRepo(x.browser_download_url));
  if (!isObj(a)) return null;
  const digest = typeof a.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(a.digest) : null;
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  return {
    versao: tag.replace(/^v/i, ''),
    nome: a.name as string,
    url: a.browser_download_url as string,
    tamanhoBytes: typeof a.size === 'number' ? a.size : 0,
    sha256: digest ? digest[1].toLowerCase() : null,
    paginaRelease: typeof release.html_url === 'string' && release.html_url.startsWith(`${RELEASES_URL}/`) ? release.html_url : RELEASES_URL,
  };
}

/** Releases recentes (a da extensão pode não ser a mais nova, se a do app sair depois). */
export const RELEASES_LIST_API = 'https://api.github.com/repos/dosxnjos/guarita/releases?per_page=10';
const ZIP_EXTENSAO = /^guarita-extensao-[0-9.]+\.zip$/i;

/** O .zip da extensão na release mais nova que tem um (lista de /releases, mais nova primeiro); null se nenhuma. Pura. */
export function escolherExtensao(releases: unknown): Instalador | null {
  if (!Array.isArray(releases)) return null;
  for (const r of releases) {
    const a = escolherArquivo(r, ZIP_EXTENSAO);
    if (a) return { ...a, versao: /([0-9]+(?:\.[0-9]+)*)\.zip$/i.exec(a.nome)?.[1] ?? a.versao };
  }
  return null;
}

/** Compara versões "0.2.0" (só números). Negativo se a < b. Pura. */
export function compararVersao(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Versão do app a partir da qual existe a captura da sessão (widgets Sessão e Loot). */
export const VERSAO_CAPTURA = '0.2.0';

/**
 * Tamanho com vírgula, ex.: "2,4 MB"; abaixo de 1 MB em KB ("24 KB"), senão o zip da extensão viraria "0,0 MB".
 * Em espanhol, o número segue o es-419 ("2.4 MB"). Sem `loc`, a língua atual do site (espelho em i18n/core.ts).
 */
export function fmtTamanho(bytes: number, loc: Locale = currentLocale()): string {
  if (!bytes) return '';
  const l = intlLocaleFor(loc);
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(l)} KB`;
  return `${(bytes / 1048576).toLocaleString(l, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

/** Texto do botão, ex.: "Baixar para Windows (versão 0.1.0, 2,4 MB)" / "Descargar para Windows (versión 0.1.0, 2.4 MB)". Pura. */
export function rotuloBaixar(i: Instalador, loc: Locale = currentLocale()): string {
  const es = loc === 'es';
  const extra = [i.versao ? `${es ? 'versión' : 'versão'} ${i.versao}` : '', fmtTamanho(i.tamanhoBytes, loc)].filter(Boolean).join(', ');
  const base = es ? 'Descargar para Windows' : 'Baixar para Windows';
  return extra ? `${base} (${extra})` : base;
}

async function buscar(url: string, escolher: (j: unknown) => Instalador | null, fetcher: typeof fetch, timeoutMs: number): Promise<EstadoDownload> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetcher(url, { headers: { accept: 'application/vnd.github+json' }, signal: ctrl.signal });
    if (r.status === 404) return { tipo: 'em-breve' };
    if (!r.ok) return { tipo: 'pagina' };
    const inst = escolher(await r.json());
    return inst ? { tipo: 'pronto', instalador: inst } : { tipo: 'em-breve' };
  } catch {
    return { tipo: 'pagina' };
  } finally {
    clearTimeout(t);
  }
}

/** Consulta o GitHub. 404 (nenhuma release) ou release sem instalador = em breve; outra falha = página de releases. */
export function buscarInstalador(fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<EstadoDownload> {
  return buscar(RELEASE_API, escolherInstalador, fetcher, timeoutMs);
}

/** Igual, para o .zip da extensão: nenhuma release com o zip = em breve (o botão não promete o que não existe). */
export function buscarExtensao(fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<EstadoDownload> {
  return buscar(RELEASES_LIST_API, escolherExtensao, fetcher, timeoutMs);
}
