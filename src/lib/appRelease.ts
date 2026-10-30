// Página /app: qual instalador oferecer. Consulta a última release pública do GitHub (dosxnjos/guarita) no navegador
// de quem abre a página, para o botão nunca prometer um download que não existe (sem release = "Em breve").
// Pura, exceto buscarInstalador. Só o instalador NSIS (`*-setup.exe`) é oferecido: um arquivo só, sem dúvida de qual baixar.

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
  if (!isObj(release) || release.draft === true || release.prerelease === true) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const a = assets.find((x) => isObj(x) && typeof x.name === 'string' && /-setup\.exe$/i.test(x.name) && urlDoRepo(x.browser_download_url));
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

/** Tamanho em MB com vírgula, ex.: "2,4 MB". */
export function fmtTamanho(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

/** Texto do botão, ex.: "Baixar para Windows (versão 0.1.0, 2,4 MB)". Pura. */
export function rotuloBaixar(i: Instalador): string {
  const extra = [i.versao ? `versão ${i.versao}` : '', fmtTamanho(i.tamanhoBytes)].filter(Boolean).join(', ');
  return extra ? `Baixar para Windows (${extra})` : 'Baixar para Windows';
}

/** Consulta o GitHub. 404 (nenhuma release) ou release sem instalador = em breve; outra falha = página de releases. */
export async function buscarInstalador(fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<EstadoDownload> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetcher(RELEASE_API, { headers: { accept: 'application/vnd.github+json' }, signal: ctrl.signal });
    if (r.status === 404) return { tipo: 'em-breve' };
    if (!r.ok) return { tipo: 'pagina' };
    const inst = escolherInstalador(await r.json());
    return inst ? { tipo: 'pronto', instalador: inst } : { tipo: 'em-breve' };
  } catch {
    return { tipo: 'pagina' };
  } finally {
    clearTimeout(t);
  }
}
