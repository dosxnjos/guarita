// Entrada do _worker.js do Pages: atende /api/* e /discord; o resto vai para os arquivos estáticos,
// com fallback para index.html (o front roteia por caminho). Páginas saem com título, descrição e Open Graph da rota
// (worker/seo.ts); /sitemap.xml é gerado aqui.
import type { Env } from './env';
import { handleApi } from './api/router';
import { handleDiscord } from './discord/interactions';
import { handleMcp } from './mcp/server';
import { sitemapResponse, withPageMeta } from './seo';

/** Pedido para o servidor MCP? Tudo que não é GET/HEAD, ou GET que pede SSE (spec: o servidor responde 405). Pura. */
export function isMcpClientRequest(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return true;
  if (request.method === 'HEAD') return false;
  return (request.headers.get('accept') ?? '').includes('text/event-stream') || request.headers.has('mcp-protocol-version');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/discord') return await handleDiscord(request, env, ctx);
      // MCP: POST, OPTIONS e DELETE vão ao servidor. GET de cliente MCP (Accept com text/event-stream ou cabeçalho
      // mcp-protocol-version: tenta abrir SSE) vai ao servidor, que responde 405 como a spec pede. Qualquer outro GET
      // (navegador, prévia de link do Discord/WhatsApp, curl simples) recebe a página que explica como ligar.
      if (url.pathname === '/mcp' && isMcpClientRequest(request)) {
        return await handleMcp(request, env, ctx);
      }
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, ctx);
    } catch (err) {
      console.error('erro não tratado', url.pathname, err);
      return Response.json({ error: 'erro interno' }, { status: 500 });
    }
    if (url.pathname === '/sitemap.xml' && (request.method === 'GET' || request.method === 'HEAD')) {
      return sitemapResponse(request.method);
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || request.method !== 'GET' || url.pathname.includes('.')) return withPageMeta(request, asset, env);
    return withPageMeta(request, await env.ASSETS.fetch(new Request(new URL('/index.html', url), request)), env);
  },
} satisfies ExportedHandler<Env>;
