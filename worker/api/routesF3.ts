// Rotas HTTP da Fase 3 (roadmap/2026-10-30-guarita-fase3.md). Cada módulo implementa a sua:
// (c) GET /api/hoje?prata=&minutos=&premium= · (d) GET /api/forecast/:id?q=&city=
import type { Env } from '../env';
import { routeHojeImpl } from './hoje';
import { handleForecast } from './forecast';

export async function routeHoje(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  return routeHojeImpl(request, url, env, ctx); // módulo (c): worker/api/hoje.ts
}

export async function routeForecast(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  return handleForecast(request, url, env, ctx); // módulo (d): worker/api/forecast.ts
}
