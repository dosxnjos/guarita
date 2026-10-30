// Entrada do _worker.js do Pages: atende /api/* e /discord; o resto vai para os arquivos estáticos,
// com fallback para index.html (o front roteia por caminho).
import type { Env } from './env';
import { handleApi } from './api/router';
import { handleDiscord } from './discord/interactions';
import { handleMcp } from './mcp/server';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/discord') return await handleDiscord(request, env, ctx);
      // MCP: POST (e OPTIONS do CORS) vão ao servidor; GET /mcp é a página que explica como ligar.
      if (url.pathname === '/mcp' && request.method !== 'GET') return await handleMcp(request, env, ctx);
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, ctx);
    } catch (err) {
      console.error('erro não tratado', url.pathname, err);
      return Response.json({ error: 'erro interno' }, { status: 500 });
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || request.method !== 'GET' || url.pathname.includes('.')) return asset;
    return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
  },
} satisfies ExportedHandler<Env>;
