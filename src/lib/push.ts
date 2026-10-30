// Push no navegador: registra /sw.js, inscreve com a chave VAPID e guarda o id da inscrição. Dono: módulo (e).
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}
/** Inscreve e devolve o id da inscrição (dono dos alertas deste aparelho). */
export async function enablePush(): Promise<string> {
  throw new Error('não implementado: módulo (e)');
}
/** Id salvo neste aparelho, ou null se ainda não inscrito. */
export function currentSubId(): string | null {
  try { return localStorage.getItem('guarita.sub'); } catch { return null; }
}
export async function disablePush(): Promise<void> {
  throw new Error('não implementado: módulo (e)');
}
