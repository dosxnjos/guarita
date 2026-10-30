// Rotas HTTP da Fase 2. Cada módulo implementa a sua função abaixo (mesmo dono das funções em insights.ts):
// (a) /api/losses?days=, /api/guild/:nome · (c) POST /api/risk · (d) /api/gold?days=, /api/data-health ·
// (f) /api/timers (POST, GET ?owner=, DELETE /:id?owner=).
import type { Env } from '../env';

export async function routeLossesGuild(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null; // módulo (a)
}
export async function routeRisk(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null; // módulo (c)
}
export async function routeGoldHealth(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null; // módulo (d)
}
export async function routeTimers(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null; // módulo (f)
}
