// Endpoint de interações do Discord (preenchido na Fase 1, passo 2d).
import type { Env } from '../env';

export async function handleDiscord(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
  return new Response('não implementado', { status: 501 });
}
