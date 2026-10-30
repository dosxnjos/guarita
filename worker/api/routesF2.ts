// Rotas HTTP da Fase 2. Cada módulo implementa a sua função abaixo (mesmo dono das funções em insights.ts):
// (a) /api/losses?days=, /api/guild/:nome, /api/guilds?q= · (c) POST /api/risk · (d) /api/gold?days=, /api/data-health ·
// (f) /api/timers (POST, GET ?owner=, DELETE /:id?owner=).
import type { Env } from '../env';
import { handleTimers } from './timers';
import { handleRisk } from './risk';
import { handleLossesGuild } from './insightsA';
import { routeGoldHealthImpl } from './goldHealth';

export async function routeLossesGuild(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  return handleLossesGuild(request, url, env, ctx); // módulo (a): ./insightsA.ts (+ /api/guilds?q= busca)
}
export async function routeRisk(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  return handleRisk(request, url, env, ctx); // módulo (c): POST /api/risk, em ./risk.ts
}
export async function routeGoldHealth(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  return routeGoldHealthImpl(request, url, env, ctx); // módulo (d): /api/gold e /api/data-health, em ./goldHealth.ts
}
export async function routeTimers(request: Request, url: URL, env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return handleTimers(request, url, env); // módulo (f): worker/api/timers.ts
}
