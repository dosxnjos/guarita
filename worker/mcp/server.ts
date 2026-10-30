// Módulo (e) da Fase 2: servidor MCP público em POST /mcp (JSON-RPC 2.0, respostas JSON).
import type { Env } from '../env';

export async function handleMcp(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
  return Response.json({ error: 'não implementado: módulo (e) da Fase 2' }, { status: 501 });
}
