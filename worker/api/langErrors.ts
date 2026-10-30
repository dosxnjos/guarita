// Erro de fonte (AODP) na língua pedida. As mensagens do AodpError nascem em português em worker/lib/aodp.ts; em
// espanhol a mensagem é remontada pelo status (e pelo Retry-After), sem repassar o texto em português.
// Em português, devolve exatamente o que worker/lib/respond.ts devolvia antes.
import { AodpError } from '../lib/aodp';
import { json, upstreamError } from '../lib/respond';
import type { ApiLang } from '../../shared/lang';

/** Mensagem do AodpError em espanhol, montada pelo status (o texto em português fica só no log). */
export function aodpMessageEs(err: AodpError): string {
  if (err.status === 429) {
    return err.retryAfterS
      ? `El AODP limitó las solicitudes; inténtalo de nuevo en ${err.retryAfterS} s.`
      : 'El AODP limitó las solicitudes; inténtalo de nuevo en unos instantes.';
  }
  if (err.status === 504) {
    return /demorou/.test(err.message) ? 'El AODP tardó demasiado en responder.' : 'No fue posible comunicarse con el AODP.';
  }
  if (err.status === 400) {
    if (/longo demais/.test(err.message)) return 'Id de objeto demasiado largo.';
    if (/demais/.test(err.message)) return 'Demasiados objetos en una sola consulta.';
    return 'Consulta no válida para el AODP.';
  }
  if (/inválida|inesperado/.test(err.message)) return 'El AODP devolvió una respuesta no válida.';
  return `El AODP respondió con error ${err.status}.`;
}

/** upstreamError (worker/lib/respond.ts) na língua pedida: 502 com a mensagem do AODP, 500 genérico no resto. */
export function upstreamErrorL(err: unknown, lang: ApiLang = 'pt'): Response {
  if (lang !== 'es') return upstreamError(err);
  if (err instanceof AodpError) {
    const extra: Record<string, string> = err.retryAfterS ? { 'Retry-After': String(err.retryAfterS) } : {};
    return json({ error: aodpMessageEs(err) }, 502, 0, extra);
  }
  console.error('api: erro inesperado', err);
  return json({ error: 'Error interno al preparar la respuesta.' }, 500);
}
