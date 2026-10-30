// Módulo (e) da Fase 2: servidor MCP público em POST /mcp (JSON-RPC 2.0, transporte "Streamable HTTP" só com
// respostas JSON, sem SSE e sem sessão). As ferramentas moram em tools.ts; o catálogo, em catalog.ts.
//
// Limite por IP: até MCP_CALLS_PER_MIN chamadas de tools/call por minuto, contadas na memória do isolate pelo hash
// do IP (o IP cru nunca é guardado). É best-effort: zera quando o isolate esfria e cada isolate conta à parte.
// O Hub do core poderia contar de verdade, mas nesta fase o Hub é de outro módulo (ver docs/ARMADILHAS.md).
import type { Env } from '../env';
import { MCP_CALLS_PER_MIN, MCP_PROTOCOL_VERSIONS, MCP_SERVER_NAME, MCP_SERVER_VERSION } from './catalog';
import { callTool, linguaOf, listTools, toolError, UnknownToolError, type ToolResult } from './tools';

export const SUPPORTED_VERSIONS: readonly string[] = MCP_PROTOCOL_VERSIONS;
export const LATEST_VERSION = MCP_PROTOCOL_VERSIONS[0];
/** Corpo máximo aceito (um tools/call legítimo tem poucas centenas de bytes). */
export const MAX_BODY_BYTES = 64 * 1024;
/** Mensagens por lote e tools/call por requisição: cada ferramenta gasta até ~10 dos 50 subrequests do plano grátis. */
export const MAX_BATCH = 10;
export const MAX_TOOL_CALLS_PER_POST = 2;

export const INSTRUCTIONS =
  'Guarita: dados públicos do Albion Online para o servidor Americas, em português. ' +
  'Use buscar_item para achar o id de um item pelo nome (PT-BR ou inglês) e preco_item para o preço por cidade, ' +
  'a mediana de 7 dias e o melhor flip para o Black Market. relogio traz status do servidor, bônus ativos, ouro e ' +
  'Premium. dossie_jogador mostra o histórico público de um jogador (pode levar até 1 minuto, porque o killboard ' +
  'oficial é lento). perdas_pvp lista os itens mais perdidos no PvP, bom para decidir o que craftar. ' +
  'Os preços vêm do Albion Data Project, enviados por jogadores, e podem ter minutos ou horas de atraso: ' +
  'sempre cite a idade do dado e recomende confirmar no jogo. O killboard é histórico, com minutos de atraso: ' +
  'nunca use para dizer onde um jogador está agora. Responda ao usuário em português do Brasil, com números ' +
  'no formato 1.234 e datas no horário de Brasília. Se o usuário escrever em espanhol, passe lingua: "es" em ' +
  'qualquer ferramenta: o texto, os nomes de item e as mensagens de erro voltam em espanhol. ' +
  'Não afiliado à Sandbox Interactive. / ' +
  'Si el usuario escribe en español, usa lingua: "es" en todas las herramientas y respóndele en español.';

// ---------- JSON-RPC ----------

type Id = string | number;

interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

type RpcResponse = { jsonrpc: '2.0'; id: Id | null; result: unknown } | { jsonrpc: '2.0'; id: Id | null; error: RpcError };

export const RPC = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;

function rpcError(id: Id | null, code: number, message: string, data?: unknown): RpcResponse {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } };
}

function rpcResult(id: Id, result: unknown): RpcResponse {
  return { jsonrpc: '2.0', id, result };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is Id => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

// ---------- HTTP ----------

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
  'Access-Control-Max-Age': '86400',
};

function reply(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...(body === null ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

// ---------- limite por IP (best-effort, memória do isolate) ----------

interface Bucket {
  n: number;
  start: number;
}

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;
const buckets = new Map<string, Bucket>();

/** FNV-1a de 32 bits: chave curta e sem guardar o IP. */
export function hashIp(ip: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Conta uma chamada; devolve false se passou do limite da janela de 1 minuto. */
export function takeToken(key: string, now = Date.now(), limit = MCP_CALLS_PER_MIN): boolean {
  let b = buckets.get(key);
  if (!b || now - b.start >= WINDOW_MS) {
    if (!b && buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (now - v.start >= WINDOW_MS) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    b = { n: 0, start: now };
    buckets.set(key, b);
  }
  if (b.n >= limit) return false;
  b.n++;
  return true;
}

/** Só para teste. */
export function resetMcpRateLimit(): void {
  buckets.clear();
}

function clientKey(request: Request): string {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido';
  return hashIp(ip);
}

// ---------- despacho ----------

interface CallState {
  key: string;
  toolCalls: number;
  env: Env;
  ctx: ExecutionContext;
}

function negotiate(requested: unknown): string {
  return typeof requested === 'string' && SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST_VERSION;
}

/** Uma mensagem → resposta, ou null quando é notificação (ou resposta do cliente) e não leva resposta. */
async function dispatch(msg: unknown, st: CallState): Promise<RpcResponse | null> {
  if (!isObj(msg)) return rpcError(null, RPC.INVALID_REQUEST, 'Requisição inválida: esperado um objeto JSON-RPC 2.0.');
  const hasId = 'id' in msg && msg.id !== undefined;
  const id = isId(msg.id) ? msg.id : null;
  if (msg.jsonrpc !== '2.0') return rpcError(id, RPC.INVALID_REQUEST, 'Requisição inválida: "jsonrpc" precisa ser "2.0".');
  // Resposta do cliente a algo do servidor (o servidor nunca pergunta nada): aceita e ignora.
  if (typeof msg.method !== 'string') {
    if (hasId && ('result' in msg || 'error' in msg)) return null;
    return rpcError(id, RPC.INVALID_REQUEST, 'Requisição inválida: falta "method".');
  }
  if (hasId && !isId(msg.id)) return rpcError(null, RPC.INVALID_REQUEST, 'Requisição inválida: "id" precisa ser texto ou número.');
  const method = msg.method;
  if (!hasId) return null; // notificação (notifications/initialized, notifications/cancelled…): sem resposta
  const reqId = msg.id as Id;
  if (msg.params !== undefined && !isObj(msg.params)) return rpcError(reqId, RPC.INVALID_PARAMS, 'Parâmetros inválidos: "params" precisa ser um objeto.');
  const params = (msg.params ?? {}) as Record<string, unknown>;

  switch (method) {
    case 'initialize':
      return rpcResult(reqId, {
        protocolVersion: negotiate(params.protocolVersion),
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, title: 'Guarita', version: MCP_SERVER_VERSION },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return rpcResult(reqId, {});
    case 'tools/list':
      return rpcResult(reqId, { tools: listTools() });
    case 'tools/call': {
      if (typeof params.name !== 'string' || !params.name) {
        return rpcError(reqId, RPC.INVALID_PARAMS, 'Parâmetros inválidos: informe "name" com o nome da ferramenta.');
      }
      let result: ToolResult;
      // Mensagens do servidor na língua pedida pela ferramenta (argumento `lingua`; inválido ou ausente = pt).
      const es = linguaOf(params.arguments) === 'es';
      if (st.toolCalls >= MAX_TOOL_CALLS_PER_POST) {
        result = toolError(es
          ? `Como máximo ${MAX_TOOL_CALLS_PER_POST} herramientas por solicitud. Envía las demás llamadas por separado.`
          : `No máximo ${MAX_TOOL_CALLS_PER_POST} ferramentas por requisição. Envie as outras chamadas separadas.`);
      } else if (!takeToken(st.key)) {
        result = toolError(es
          ? `Se alcanzó el límite de ${MCP_CALLS_PER_MIN} consultas por minuto. Espera un minuto e inténtalo de nuevo.`
          : `Limite de ${MCP_CALLS_PER_MIN} consultas por minuto atingido. Espere um minuto e tente de novo.`);
      } else {
        st.toolCalls++;
        try {
          result = await callTool(params.name, params.arguments, { env: st.env, ctx: st.ctx });
        } catch (err) {
          if (err instanceof UnknownToolError) {
            return rpcError(reqId, RPC.INVALID_PARAMS, es ? `Herramienta desconocida: ${params.name.slice(0, 60)}` : `Ferramenta desconhecida: ${params.name.slice(0, 60)}`);
          }
          console.error('mcp: falha inesperada em tools/call', err);
          return rpcError(reqId, RPC.INTERNAL, es ? 'Error interno al ejecutar la herramienta.' : 'Erro interno ao executar a ferramenta.');
        }
      }
      return rpcResult(reqId, result);
    }
    default:
      return rpcError(reqId, RPC.METHOD_NOT_FOUND, `Método não suportado: ${method.slice(0, 60)}`);
  }
}

export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  // Sem SSE e sem sessão: GET (abrir stream) e DELETE (encerrar sessão) recebem 405, como o protocolo prevê.
  if (request.method !== 'POST') {
    return reply(rpcError(null, RPC.INVALID_REQUEST, 'Use POST com JSON-RPC 2.0. Este servidor não abre stream SSE.'), 405, { Allow: 'POST, OPTIONS' });
  }

  const version = request.headers.get('mcp-protocol-version');
  if (version && !SUPPORTED_VERSIONS.includes(version.trim())) {
    return reply(rpcError(null, RPC.INVALID_REQUEST, `Versão do protocolo MCP não suportada: ${version.slice(0, 20)}. Suportadas: ${SUPPORTED_VERSIONS.join(', ')}.`), 400);
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return reply(rpcError(null, RPC.INVALID_REQUEST, 'Requisição grande demais.'), 413);
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return reply(rpcError(null, RPC.PARSE, 'Não consegui ler o corpo da requisição.'), 400);
  }
  if (raw.length > MAX_BODY_BYTES) return reply(rpcError(null, RPC.INVALID_REQUEST, 'Requisição grande demais.'), 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(rpcError(null, RPC.PARSE, 'Erro de parse: o corpo não é JSON válido.'), 400);
  }

  const st: CallState = { key: clientKey(request), toolCalls: 0, env, ctx };

  if (Array.isArray(body)) {
    if (!body.length) return reply(rpcError(null, RPC.INVALID_REQUEST, 'Requisição inválida: lote vazio.'));
    if (body.length > MAX_BATCH) return reply(rpcError(null, RPC.INVALID_REQUEST, `Lote grande demais: no máximo ${MAX_BATCH} mensagens.`));
    const out: RpcResponse[] = [];
    // Em sequência: o limite de ferramentas por requisição e o de subrequests ficam previsíveis.
    for (const m of body) {
      const r = await dispatch(m, st);
      if (r) out.push(r);
    }
    return out.length ? reply(out) : reply(null, 202);
  }

  const r = await dispatch(body, st);
  return r ? reply(r) : reply(null, 202);
}
