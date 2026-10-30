// Respostas JSON da API de leitura (módulo b): cache público curto no sucesso, no-store no erro.
import { AodpError } from './aodp';

export function json(data: unknown, status = 200, maxAge = 60, extra: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': status < 400 && maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
      ...extra,
    },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

/** Erro da fonte (AODP) → 502 com a mensagem clara; erro desconhecido → 500 genérico. */
export function upstreamError(err: unknown): Response {
  if (err instanceof AodpError) {
    const extra: Record<string, string> = err.retryAfterS ? { 'Retry-After': String(err.retryAfterS) } : {};
    return json({ error: err.message }, 502, 0, extra);
  }
  console.error('api de mercado: erro inesperado', err);
  return json({ error: 'Erro interno ao montar a resposta.' }, 500);
}
