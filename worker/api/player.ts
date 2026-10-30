// Módulo (c): /api/player/search, /api/player/:id, /api/player/:id/autopsy. Exporta as funções para o bot.
import type { Env } from '../env';
import type { AutopsyResponse, PlayerDossier, PlayerSearchResponse } from '../../shared/types';

export async function searchPlayers(_env: Env, _ctx: ExecutionContext, _q: string): Promise<PlayerSearchResponse> {
  throw new Error('não implementado: módulo (c)');
}
export async function getDossier(_env: Env, _ctx: ExecutionContext, _id: string): Promise<PlayerDossier> {
  throw new Error('não implementado: módulo (c)');
}
export async function getAutopsy(_env: Env, _ctx: ExecutionContext, _id: string): Promise<AutopsyResponse> {
  throw new Error('não implementado: módulo (c)');
}
export async function routePlayer(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null;
}
