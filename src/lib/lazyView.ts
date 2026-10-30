// Telas carregadas sob demanda (App.svelte): depois de um deploy, a aba aberta ainda pede o arquivo da tela com o
// hash antigo e recebe 404. Recarrega a página uma vez para buscar o index.html novo; se falhar de novo em menos de
// RETRY_WINDOW_MS, é falta de rede, e a tela mostra o erro em vez de recarregar em laço.

export const CHUNK_RETRY_KEY = 'guarita.recarga-tela';
export const RETRY_WINDOW_MS = 60_000;

/** Pode recarregar agora? Pura: `last` é o carimbo gravado na última recarga (ou null). */
export function shouldRetryChunk(last: string | null, now: number): boolean {
  const t = last === null ? NaN : Number(last);
  return !Number.isFinite(t) || now - t > RETRY_WINDOW_MS || now < t;
}

export function canRetryChunk(now = Date.now()): boolean {
  try {
    return shouldRetryChunk(sessionStorage.getItem(CHUNK_RETRY_KEY), now);
  } catch {
    // Sem armazenamento não há como saber se já recarregou: não recarrega (evita laço).
    return false;
  }
}

export function markChunkRetry(now = Date.now()): void {
  try {
    sessionStorage.setItem(CHUNK_RETRY_KEY, String(now));
  } catch {
    /* sem armazenamento: canRetryChunk já devolve false */
  }
}
