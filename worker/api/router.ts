// Roteador da API de leitura. Cada módulo de rota mora no seu arquivo (market.ts, clock.ts, player.ts, alerts.ts).
import type { Env } from '../env';

export async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
    let hub: unknown = null;
    let core: unknown = null;
    try {
      const stub = env.HUB.get(env.HUB.idFromName('main'));
      hub = await (await stub.fetch('https://hub/health')).json();
    } catch (e) {
      hub = { error: String(e) };
    }
    try {
      core = await (await env.CORE.fetch('https://core/internal/health')).json();
    } catch (e) {
      core = { error: String(e) };
    }
    return Response.json({ ok: true, hub, core, at: new Date().toISOString() });
  }
  void ctx;
  return Response.json({ error: 'rota não encontrada' }, { status: 404 });
}
