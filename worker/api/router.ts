// Roteador da API de leitura. Contrato: shared/types.ts e roadmap/2026-10-29-guarita-fase1.md § Contrato.
// Cada módulo mora no seu arquivo: market.ts e clock.ts (b), player.ts (c), alerts.ts (e).
import type { Env } from '../env';
import { routeMarket } from './market';
import { routeClock } from './clock';
import { routePlayer } from './player';
import { routeAlerts } from './alerts';
import { routeLossesGuild, routeRisk, routeGoldHealth, routeTimers } from './routesF2';

type Route = (request: Request, url: URL, env: Env, ctx: ExecutionContext) => Promise<Response | null>;
const ROUTES: Route[] = [routeMarket, routeClock, routePlayer, routeAlerts, routeLossesGuild, routeRisk, routeGoldHealth, routeTimers];

export async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
    let hub: unknown = null;
    try {
      hub = await (await env.HUB.get(env.HUB.idFromName('main')).fetch('https://hub/health')).json();
    } catch (e) {
      hub = { error: String(e) };
    }
    return Response.json({ ok: true, hub, at: new Date().toISOString() });
  }
  for (const route of ROUTES) {
    const res = await route(request, url, env, ctx);
    if (res) return res;
  }
  return Response.json({ error: 'rota não encontrada' }, { status: 404 });
}
