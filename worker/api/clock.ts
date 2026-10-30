// Módulo (b): /api/clock. Também exporta getClock para o bot.
import type { Env } from '../env';
import type { ClockResponse } from '../../shared/types';

export async function getClock(_env: Env, _ctx: ExecutionContext): Promise<ClockResponse> {
  throw new Error('não implementado: módulo (b)');
}
export async function routeClock(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null;
}
