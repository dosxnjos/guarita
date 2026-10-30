// Rotas HTTP da Fase 3 (roadmap/2026-10-30-guarita-fase3.md). Cada módulo implementa a sua:
// (c) GET /api/hoje?prata=&minutos=&premium= · (d) GET /api/forecast/:id?q=&city=
import type { Env } from '../env';

export async function routeHoje(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null; // módulo (c)
}
export async function routeForecast(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null; // módulo (d)
}
